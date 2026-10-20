import type {
  AdminAnalyticsRange, AiAnalyticsResponse, LearningAnalyticsResponse, PracticeAttemptCounts, SpeechAnalyticsResponse, TimeAnalyticsResponse,
} from "@wordinator/contracts/admin";
import { AI_PROVIDERS, type AiProvider } from "@wordinator/contracts/ai";
import type { LearningActivity, TimeCategories } from "@wordinator/contracts/learning";
import { addTimeSeconds, emptyTimeCategories } from "../learning/activity";

// Superuser analytics reads (docs/settings-and-administration.md#analytics). Each query groups by UTC day number
// (`created_at / 86400000`, integer division) and account, selects counts and sums only, and never reads a text column
// other than the provider and model names. The rows are folded here into daily totals and per-account totals.

const DAY_MS = 24 * 60 * 60 * 1000;
type Range = { days: AdminAnalyticsRange; firstDay: number; lastDay: number; start: number; end: number };

// The range ends with today (UTC) and covers `days` whole UTC days.
export function analyticsRange(days: AdminAnalyticsRange, now = Date.now()): Range {
  const lastDay = Math.floor(now / DAY_MS);
  const firstDay = lastDay - days + 1;
  return { days, firstDay, lastDay, start: firstDay * DAY_MS, end: (lastDay + 1) * DAY_MS };
}

export const dayLabel = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const rangeFields = (range: Range) => ({ days: range.days, from: dayLabel(range.firstDay), to: dayLabel(range.lastDay) });
const dayNumbers = (range: Range) => Array.from({ length: range.days }, (_, index) => range.firstDay + index);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// D1 binds at most 100 parameters per statement, so usernames are read in chunks.
async function usernames(db: D1Database, userIds: Iterable<string>): Promise<Map<string, string | null>> {
  const ids = [...new Set(userIds)];
  const names = new Map<string, string | null>();
  for (let index = 0; index < ids.length; index += 90) {
    const chunk = ids.slice(index, index + 90);
    const rows = await db.prepare(`SELECT id, username FROM users WHERE id IN (${chunk.map(() => "?").join(", ")})`).bind(...chunk)
      .all<{ id: string; username: string | null }>();
    for (const row of rows.results) names.set(row.id, row.username);
  }
  return names;
}

// Usernames sort case-insensitively; accounts without one go last, by ID.
function byUsername<T extends { userId: string; username: string | null }>(left: T, right: T) {
  if (left.username === null || right.username === null) {
    return left.username === right.username ? left.userId.localeCompare(right.userId) : left.username === null ? 1 : -1;
  }
  return left.username.localeCompare(right.username, "en", { sensitivity: "base" }) || left.userId.localeCompare(right.userId);
}

type LearningCounts = { lessonsCompleted: number; drillReviews: number; practiceAttempts: PracticeAttemptCounts; pronunciationAttempts: number };
const emptyLearning = (): LearningCounts => ({ lessonsCompleted: 0, drillReviews: 0, practiceAttempts: { lesson: 0, aiChat: 0, aiPractice: 0 }, pronunciationAttempts: 0 });
function addLearning(target: LearningCounts, source: LearningCounts) {
  target.lessonsCompleted += source.lessonsCompleted; target.drillReviews += source.drillReviews; target.pronunciationAttempts += source.pronunciationAttempts;
  target.practiceAttempts.lesson += source.practiceAttempts.lesson; target.practiceAttempts.aiChat += source.practiceAttempts.aiChat;
  target.practiceAttempts.aiPractice += source.practiceAttempts.aiPractice;
}

export async function learningAnalytics(db: D1Database, days: AdminAnalyticsRange, now = Date.now()): Promise<LearningAnalyticsResponse> {
  const range = analyticsRange(days, now);
  type Row = { d: number; userId: string; a: number | null; b: number | null; c: number | null };
  const grouped = (sql: string) => db.prepare(sql).bind(range.start, range.end);
  // Seed reviews are the C14a migration's copy of old drill states, not activity.
  const [reviews, practice, pronunciation, completions, positions, turns] = await db.batch<Row>([
    grouped(`SELECT created_at / ${DAY_MS} AS d, user_id AS userId, SUM(source = 'drill') AS a, NULL AS b, NULL AS c FROM word_reviews
      WHERE created_at >= ? AND created_at < ? AND source != 'seed' GROUP BY d, user_id`),
    grouped(`SELECT created_at / ${DAY_MS} AS d, user_id AS userId, SUM(source = 'lesson') AS a, SUM(source = 'ai_chat') AS b, SUM(source = 'ai_practice') AS c
      FROM practice_attempts WHERE created_at >= ? AND created_at < ? GROUP BY d, user_id`),
    grouped(`SELECT created_at / ${DAY_MS} AS d, user_id AS userId, COUNT(*) AS a, NULL AS b, NULL AS c FROM pronunciation_attempts
      WHERE created_at >= ? AND created_at < ? GROUP BY d, user_id`),
    grouped(`SELECT completed_at / ${DAY_MS} AS d, user_id AS userId, COUNT(*) AS a, NULL AS b, NULL AS c FROM course_lesson_completions
      WHERE completed_at >= ? AND completed_at < ? GROUP BY d, user_id`),
    grouped(`SELECT updated_at / ${DAY_MS} AS d, user_id AS userId, COUNT(*) AS a, NULL AS b, NULL AS c FROM course_lesson_positions
      WHERE updated_at >= ? AND updated_at < ? GROUP BY d, user_id`),
    grouped(`SELECT created_at / ${DAY_MS} AS d, user_id AS userId, COUNT(*) AS a, NULL AS b, NULL AS c FROM ai_usage
      WHERE created_at >= ? AND created_at < ? AND turn_start = 1 GROUP BY d, user_id`),
  ]);

  // day → account → counts. Any row at all marks the account active that day.
  const cells = new Map<number, Map<string, LearningCounts>>();
  const cell = (row: Row) => {
    let accounts = cells.get(row.d);
    if (!accounts) cells.set(row.d, accounts = new Map());
    let counts = accounts.get(row.userId);
    if (!counts) accounts.set(row.userId, counts = emptyLearning());
    return counts;
  };
  for (const row of reviews!.results) cell(row).drillReviews += num(row.a);
  for (const row of practice!.results) {
    const counts = cell(row).practiceAttempts;
    counts.lesson += num(row.a); counts.aiChat += num(row.b); counts.aiPractice += num(row.c);
  }
  for (const row of pronunciation!.results) cell(row).pronunciationAttempts += num(row.a);
  for (const row of completions!.results) cell(row).lessonsCompleted += num(row.a);
  for (const row of [...positions!.results, ...turns!.results]) cell(row);

  const totals = new Map<string, LearningCounts & { activeDays: number }>();
  const daily = dayNumbers(range).map((day) => {
    const accounts = cells.get(day) ?? new Map<string, LearningCounts>();
    const sum = emptyLearning();
    for (const [userId, counts] of accounts) {
      addLearning(sum, counts);
      let total = totals.get(userId);
      if (!total) totals.set(userId, total = { ...emptyLearning(), activeDays: 0 });
      addLearning(total, counts); total.activeDays += 1;
    }
    return { day: dayLabel(day), activeAccounts: accounts.size, ...sum };
  });
  const names = await usernames(db, totals.keys());
  const accounts = [...totals].map(([userId, total]) => ({ userId, username: names.get(userId) ?? null, ...total })).sort(byUsername);
  return { ...rangeFields(range), daily, accounts };
}

type AiCounts = { turns: number; requests: number; failures: number; tokensIn: number; tokensOut: number; costMicroUsd: number };
const emptyAi = (): AiCounts => ({ turns: 0, requests: 0, failures: 0, tokensIn: 0, tokensOut: 0, costMicroUsd: 0 });
function addAi(target: AiCounts, source: AiCounts) {
  target.turns += source.turns; target.requests += source.requests; target.failures += source.failures;
  target.tokensIn += source.tokensIn; target.tokensOut += source.tokensOut; target.costMicroUsd += source.costMicroUsd;
}

export async function aiAnalytics(db: D1Database, days: AdminAnalyticsRange, now = Date.now()): Promise<AiAnalyticsResponse> {
  const range = analyticsRange(days, now);
  const rows = await db.prepare(
    `SELECT created_at / ${DAY_MS} AS d, user_id AS userId, provider, model, SUM(turn_start = 1) AS turns, COUNT(*) AS requests,
       SUM(ok = 0) AS failures, SUM(tokens_in) AS tokensIn, SUM(tokens_out) AS tokensOut, SUM(cost_microusd) AS costMicroUsd
     FROM ai_usage WHERE created_at >= ? AND created_at < ? GROUP BY d, user_id, provider, model`,
  ).bind(range.start, range.end).all<{ d: number; userId: string; provider: AiProvider; model: string } & Record<keyof AiCounts, number | null>>();

  const byDay = new Map<number, AiCounts>();
  const byAccount = new Map<string, AiCounts>();
  const byModel = new Map<string, AiCounts & { provider: AiProvider; model: string }>();
  for (const row of rows.results) {
    const counts: AiCounts = {
      turns: num(row.turns), requests: num(row.requests), failures: num(row.failures),
      tokensIn: num(row.tokensIn), tokensOut: num(row.tokensOut), costMicroUsd: num(row.costMicroUsd),
    };
    if (!byDay.has(row.d)) byDay.set(row.d, emptyAi());
    addAi(byDay.get(row.d)!, counts);
    if (!byAccount.has(row.userId)) byAccount.set(row.userId, emptyAi());
    addAi(byAccount.get(row.userId)!, counts);
    const modelKey = `${row.provider}\n${row.model}`;
    if (!byModel.has(modelKey)) byModel.set(modelKey, { provider: row.provider, model: row.model, ...emptyAi() });
    addAi(byModel.get(modelKey)!, counts);
  }
  const names = await usernames(db, byAccount.keys());
  return {
    ...rangeFields(range),
    daily: dayNumbers(range).map((day) => ({ day: dayLabel(day), ...(byDay.get(day) ?? emptyAi()) })),
    accounts: [...byAccount].map(([userId, counts]) => ({ userId, username: names.get(userId) ?? null, ...counts })).sort(byUsername),
    // In the providers' canonical order, then by model ID.
    models: [...byModel.values()].sort((left, right) => AI_PROVIDERS.indexOf(left.provider) - AI_PROVIDERS.indexOf(right.provider) || left.model.localeCompare(right.model)),
  };
}

type SpeechCounts = { requests: number; characters: number; cacheHits: number; azureCalls: number; azureCharacters: number };
const emptySpeech = (): SpeechCounts => ({ requests: 0, characters: 0, cacheHits: 0, azureCalls: 0, azureCharacters: 0 });
function addSpeech(target: SpeechCounts, source: SpeechCounts) {
  target.requests += source.requests; target.characters += source.characters; target.cacheHits += source.cacheHits;
  target.azureCalls += source.azureCalls; target.azureCharacters += source.azureCharacters;
}

export async function speechAnalytics(db: D1Database, days: AdminAnalyticsRange, now = Date.now()): Promise<SpeechAnalyticsResponse> {
  const range = analyticsRange(days, now);
  const rows = await db.prepare(
    `SELECT created_at / ${DAY_MS} AS d, user_id AS userId, COUNT(*) AS requests, SUM(characters) AS characters, SUM(cached = 1) AS cacheHits,
       SUM(cached = 0) AS azureCalls, SUM(CASE WHEN cached = 0 THEN characters ELSE 0 END) AS azureCharacters
     FROM speech_usage WHERE created_at >= ? AND created_at < ? GROUP BY d, user_id`,
  ).bind(range.start, range.end).all<{ d: number; userId: string } & Record<keyof SpeechCounts, number | null>>();

  const byDay = new Map<number, SpeechCounts>();
  const byAccount = new Map<string, SpeechCounts>();
  for (const row of rows.results) {
    const counts: SpeechCounts = {
      requests: num(row.requests), characters: num(row.characters), cacheHits: num(row.cacheHits),
      azureCalls: num(row.azureCalls), azureCharacters: num(row.azureCharacters),
    };
    if (!byDay.has(row.d)) byDay.set(row.d, emptySpeech());
    addSpeech(byDay.get(row.d)!, counts);
    if (!byAccount.has(row.userId)) byAccount.set(row.userId, emptySpeech());
    addSpeech(byAccount.get(row.userId)!, counts);
  }
  const names = await usernames(db, byAccount.keys());
  return {
    ...rangeFields(range),
    daily: dayNumbers(range).map((day) => ({ day: dayLabel(day), ...(byDay.get(day) ?? emptySpeech()) })),
    accounts: [...byAccount].map(([userId, counts]) => ({ userId, username: names.get(userId) ?? null, ...counts })).sort(byUsername),
  };
}

export async function timeAnalytics(db: D1Database, days: AdminAnalyticsRange, now = Date.now()): Promise<TimeAnalyticsResponse> {
  const range = analyticsRange(days, now);
  // Learning time rows carry the learner's local day, so the range is matched by its labels.
  const rows = await db.prepare(
    `SELECT day, user_id AS userId, activity, focus, SUM(seconds) AS seconds FROM learning_time WHERE day >= ? AND day <= ?
     GROUP BY day, user_id, activity, focus`,
  ).bind(dayLabel(range.firstDay), dayLabel(range.lastDay)).all<{ day: string; userId: string; activity: LearningActivity; focus: string | null; seconds: number }>();

  const byDay = new Map<string, TimeCategories>();
  const byAccount = new Map<string, TimeCategories>();
  for (const row of rows.results) {
    if (!byDay.has(row.day)) byDay.set(row.day, emptyTimeCategories());
    addTimeSeconds(byDay.get(row.day)!, row.activity, row.focus, num(row.seconds));
    if (!byAccount.has(row.userId)) byAccount.set(row.userId, emptyTimeCategories());
    addTimeSeconds(byAccount.get(row.userId)!, row.activity, row.focus, num(row.seconds));
  }
  const names = await usernames(db, byAccount.keys());
  return {
    ...rangeFields(range),
    daily: dayNumbers(range).map((day) => ({ day: dayLabel(day), ...(byDay.get(dayLabel(day)) ?? emptyTimeCategories()) })),
    accounts: [...byAccount].map(([userId, counts]) => ({ userId, username: names.get(userId) ?? null, ...counts })).sort(byUsername),
  };
}
