import {
  LEARNING_ACTIVITY_DAYS, learningActivityQuerySchema, learningActivityResponseSchema, learningGoalSchema, type ActivityTotals, type AiPracticeFocus,
  type LearningActivity, type LearningActivityDay, type LearningActivityRange, type LearningActivityResponse, type TimeCategories,
} from "@wordinator/contracts/learning";
import { DEFAULT_TUTOR_PROFILE } from "@wordinator/contracts/tutor";
import type { Hono, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnvironment } from "../app";
import { apiError, parseJson } from "../http";

// Learning activity and the daily goal (C15d, docs/learning-time.md#activity and #daily-goal-and-streak). The activity read is per
// library, like the send route. The goal belongs to the account, so it is read and saved outside any library.

const DAY_MS = 86_400_000;
// The streak and the previous period are read from this many days back at most, so a streak longer than a year counts as a year.
export const LEARNING_STREAK_LOOKBACK_DAYS = 366;

export type TimeCategory = Exclude<keyof TimeCategories, "total">;

/** The category of one stored row. Reading splits by its focus, drill and words are vocabulary, and tutor time is AI practice. */
export function categoryOf(activity: LearningActivity, focus: string | null): TimeCategory {
  switch (activity) {
    case "reading": return focus === "grammar" ? "grammar" : "lesson";
    case "practice": return "practice";
    case "drill": case "words": return "vocabulary";
    case "tutor": case "ai_practice": case "lesson_activity": return "aiPractice";
  }
}

/** Adds one stored row's seconds to its category and to the total. */
export function addTimeSeconds(totals: TimeCategories, activity: LearningActivity, focus: string | null, seconds: number) {
  totals[categoryOf(activity, focus)] += seconds;
  totals.total += seconds;
}

export const emptyTimeCategories = (): TimeCategories => ({ lesson: 0, grammar: 0, practice: 0, vocabulary: 0, aiPractice: 0, total: 0 });
const emptyActivityTotals = (): ActivityTotals => ({
  ...emptyTimeCategories(), aiPracticeFocus: { grammar: 0, vocabulary: 0, reading: 0, listening: 0, writing: 0 },
});

/** `YYYY-MM-DD` moved by whole days. Day strings compare in date order, so ranges are plain string comparisons. */
export const shiftDay = (day: string, offset: number) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);

/**
 * The streak: consecutive days meeting the threshold, ending on `end`. Today counts once it meets the threshold; until then the
 * streak runs from yesterday. The map holds only the days read, so the walk stops at the lookback.
 */
export function streakEndingOn(end: string, secondsByDay: ReadonlyMap<string, number>, thresholdSeconds: number): number {
  let day = (secondsByDay.get(end) ?? 0) >= thresholdSeconds ? end : shiftDay(end, -1);
  let streak = 0;
  while ((secondsByDay.get(day) ?? 0) >= thresholdSeconds) {
    streak += 1;
    day = shiftDay(day, -1);
  }
  return streak;
}

/** A day meets the goal at its minutes; without a goal, any full minute of study meets it. */
export const thresholdSecondsOf = (dailyGoalMinutes: number | null) => (dailyGoalMinutes ?? 1) * 60;

export async function readDailyGoal(db: D1Database, userId: string): Promise<number | null> {
  const row = await db.prepare("SELECT daily_goal_minutes AS minutes FROM learner_profiles WHERE user_id = ?").bind(userId).first<{ minutes: number | null }>();
  return row?.minutes ?? null;
}

// A missing tutor profile row is created with the defaults, as the tutor's notes do.
export async function writeDailyGoal(db: D1Database, userId: string, minutes: number | null, now = Date.now()) {
  await db.prepare(
    `INSERT INTO learner_profiles (user_id, native_language, reply_language, goals, tutor_notes, daily_goal_minutes, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET daily_goal_minutes = excluded.daily_goal_minutes, updated_at = excluded.updated_at`,
  ).bind(userId, DEFAULT_TUTOR_PROFILE.nativeLanguage, DEFAULT_TUTOR_PROFILE.replyLanguage, minutes, now).run();
}

/** The viewer's time per local day for the range ending on `end`, the previous period's total, the goal, and the streak. */
export async function readLearningActivity(db: D1Database, userId: string, range: LearningActivityRange, end: string): Promise<LearningActivityResponse> {
  const length = LEARNING_ACTIVITY_DAYS[range];
  const from = shiftDay(end, 1 - length);
  const dailyGoalMinutes = await readDailyGoal(db, userId);
  const rows = await db.prepare(
    `SELECT day, activity, focus, SUM(seconds) AS seconds FROM learning_time WHERE user_id = ? AND day >= ? AND day <= ? GROUP BY day, activity, focus`,
  ).bind(userId, shiftDay(end, 1 - LEARNING_STREAK_LOOKBACK_DAYS), end).all<{ day: string; activity: LearningActivity; focus: string | null; seconds: number }>();

  const secondsByDay = new Map<string, number>();
  const byDay = new Map<string, ActivityTotals>();
  const totals = emptyActivityTotals();
  for (const row of rows.results) {
    secondsByDay.set(row.day, (secondsByDay.get(row.day) ?? 0) + row.seconds);
    if (row.day < from) continue;
    const day = byDay.get(row.day) ?? emptyActivityTotals();
    byDay.set(row.day, day);
    for (const target of [day, totals]) {
      addTimeSeconds(target, row.activity, row.focus, row.seconds);
      if (row.activity === "ai_practice") target.aiPracticeFocus[row.focus as AiPracticeFocus] += row.seconds;
    }
  }

  const days: LearningActivityDay[] = Array.from({ length }, (_, index) => {
    const day = shiftDay(from, index);
    return { day, ...(byDay.get(day) ?? emptyActivityTotals()) };
  });
  let previousTotal = 0;
  for (let index = 1; index <= length; index += 1) previousTotal += secondsByDay.get(shiftDay(from, -index)) ?? 0;
  return {
    range, from, to: end, days, totals, previousTotal, dailyGoalMinutes,
    streak: streakEndingOn(end, secondsByDay, thresholdSecondsOf(dailyGoalMinutes)),
  };
}

// The goal and the activity read need a signed-in account that finished setup, as the tutor routes do.
const requireAccount = createMiddleware<AppEnvironment>(async (context, next) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  if (!user.onboardingComplete) return apiError(context, 403, "ONBOARDING_REQUIRED", "Finish setting up your account to continue.");
  await next();
});

/**
 * `GET /api/groups/:groupId/learning-activity`, `GET` and `PUT /api/learning/goal`. The goal is refused outside
 * DAILY_GOAL_MINUTES_MIN–MAX, and `null` clears it.
 */
export function registerLearningActivityRoutes(app: Hono<AppEnvironment>, deps: { requireGroupAccess: MiddlewareHandler<AppEnvironment> }) {
  app.get("/api/groups/:groupId/learning-activity", deps.requireGroupAccess, async (context) => {
    const parsed = learningActivityQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return apiError(context, 400, "VALIDATION_ERROR", "Choose a week or a month and the day it ends on.");
    return context.json(learningActivityResponseSchema.parse(await readLearningActivity(context.env.DB, context.get("user")!.id, parsed.data.range, parsed.data.end)));
  });

  app.get("/api/learning/goal", requireAccount, async (context) => {
    const minutes = await readDailyGoal(context.env.DB, context.get("user")!.id);
    return context.json(learningGoalSchema.parse({ dailyGoalMinutes: minutes }));
  });

  app.put("/api/learning/goal", requireAccount, async (context) => {
    const parsed = await parseJson(context, learningGoalSchema, 1_024); if ("response" in parsed) return parsed.response;
    await writeDailyGoal(context.env.DB, context.get("user")!.id, parsed.data.dailyGoalMinutes);
    return context.json(learningGoalSchema.parse(parsed.data));
  });
}
