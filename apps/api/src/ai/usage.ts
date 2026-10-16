import type { AiProvider, AiSettings, SpeechUsageSurface } from "@wordinator/contracts/ai";
import { AiLimitError } from "./errors";

// Metering and daily caps (docs/ai-tutor.md#usage-and-limits, docs/speech.md#on-demand-audio). Days are UTC days.

const DAY_MS = 24 * 60 * 60 * 1000;
export const utcDayStart = (now: number) => Math.floor(now / DAY_MS) * DAY_MS;
export const nextUtcMidnight = (now: number) => utcDayStart(now) + DAY_MS;

// USD per million tokens, [input, output]. Tokens × USD per million tokens is micro-USD. OpenRouter reports the actual
// cost of each request, which wins over this table; `:free` models cost nothing; a model missing here is metered at 0.
// Azure entries are keyed by deployment name. Approximate list prices, kept small on purpose; update with the settings.
export const AI_MODEL_PRICES: Readonly<Record<string, readonly [number, number]>> = {
  "@cf/meta/llama-4-scout-17b-16e-instruct": [0.27, 0.85],
  "@cf/openai/gpt-oss-120b": [0.35, 0.75],
  "@cf/openai/gpt-oss-20b": [0.2, 0.3],
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1-nano": [0.1, 0.4],
};

export function estimateCostMicroUsd(model: string, tokensIn: number, tokensOut: number): number {
  if (model.endsWith(":free")) return 0;
  const [input, output] = AI_MODEL_PRICES[model] ?? [0, 0];
  return Math.round(tokensIn * input + tokensOut * output);
}

export type AiUsageInput = {
  userId: string;
  conversationId: string | null;
  provider: AiProvider;
  model: string;
  turnStart: boolean;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  ok: boolean;
};

export async function recordAiUsage(db: D1Database, usage: AiUsageInput, now = Date.now()): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO ai_usage (id, user_id, conversation_id, provider, model, turn_start, tokens_in, tokens_out, cost_microusd, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    id, usage.userId, usage.conversationId, usage.provider, usage.model, usage.turnStart ? 1 : 0,
    Math.max(0, Math.round(usage.tokensIn)), Math.max(0, Math.round(usage.tokensOut)), Math.max(0, Math.round(usage.costMicroUsd)), usage.ok ? 1 : 0, now,
  ).run();
  return id;
}

// A turn is counted by its first model request: the `ai_usage` row written with `turn_start` (see `streamChat`'s
// `turnStart`). Fallback attempts and the further model calls of a turn's tool loop are not counted again.
export async function countDailyTurns(db: D1Database, userId: string, now = Date.now()): Promise<number> {
  const start = utcDayStart(now);
  const row = await db.prepare("SELECT COUNT(*) AS used FROM ai_usage WHERE user_id = ? AND created_at >= ? AND created_at < ? AND turn_start = 1")
    .bind(userId, start, start + DAY_MS).first<{ used: number }>();
  return row?.used ?? 0;
}

// The learner's own token counts for the tutor's usage box (docs/ai-tutor.md#usage-box): today's (UTC) model requests made for
// any of their conversations, and, given one, that conversation's requests over its life. Failed requests count with the
// tokens they reported. Turns are counted as the daily cap counts them.
export async function readTutorUsage(db: D1Database, userId: string, conversationId: string | null, now = Date.now()) {
  const start = utcDayStart(now);
  const today = db.prepare(
    `SELECT COALESCE(SUM(tokens_in), 0) AS tokensIn, COALESCE(SUM(tokens_out), 0) AS tokensOut
     FROM ai_usage WHERE user_id = ? AND created_at >= ? AND created_at < ? AND conversation_id IS NOT NULL`,
  ).bind(userId, start, start + DAY_MS).first<{ tokensIn: number; tokensOut: number }>();
  const conversation = conversationId === null ? Promise.resolve(null) : db.prepare(
    "SELECT COALESCE(SUM(tokens_in), 0) AS tokensIn, COALESCE(SUM(tokens_out), 0) AS tokensOut FROM ai_usage WHERE user_id = ? AND conversation_id = ?",
  ).bind(userId, conversationId).first<{ tokensIn: number; tokensOut: number }>();
  const [day, own, turns] = await Promise.all([today, conversation, countDailyTurns(db, userId, now)]);
  return {
    today: { tokensIn: day?.tokensIn ?? 0, tokensOut: day?.tokensOut ?? 0, turns, resetsAt: nextUtcMidnight(now) },
    conversation: own ? { tokensIn: own.tokensIn, tokensOut: own.tokensOut } : null,
  };
}

export type DailyAllowance = { used: number; cap: number; resetsAt: number };

// Call once per turn, before the first model call. Throws `AiLimitError("AI_DAILY_LIMIT")` once the account has started
// `dailyTurnCap` turns today.
export async function assertDailyTurnCap(db: D1Database, userId: string, settings: AiSettings, now = Date.now()): Promise<DailyAllowance> {
  const used = await countDailyTurns(db, userId, now);
  const resetsAt = nextUtcMidnight(now);
  if (used >= settings.dailyTurnCap) throw new AiLimitError("AI_DAILY_LIMIT", resetsAt);
  return { used, cap: settings.dailyTurnCap, resetsAt };
}

export type SpeechUsageInput = { userId: string; surface: SpeechUsageSurface; clipHash: string; characters: number; cached: boolean };

// One row per on-demand speech request, cache hits included.
export async function recordSpeechUsage(db: D1Database, usage: SpeechUsageInput, now = Date.now()): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO speech_usage (id, user_id, surface, clip_hash, characters, cached, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, usage.userId, usage.surface, usage.clipHash, Math.max(0, Math.round(usage.characters)), usage.cached ? 1 : 0, now).run();
  return id;
}

export async function countDailySpeechCharacters(db: D1Database, userId: string, now = Date.now()): Promise<number> {
  const start = utcDayStart(now);
  const row = await db.prepare("SELECT COALESCE(SUM(characters), 0) AS used FROM speech_usage WHERE user_id = ? AND created_at >= ? AND created_at < ?")
    .bind(userId, start, start + DAY_MS).first<{ used: number }>();
  return row?.used ?? 0;
}

// Call before serving a clip of `characters` characters, cached or not. Throws `AiLimitError("SPEECH_DAILY_LIMIT")` when
// the request would take the account past `dailySpeechCharCap` today.
export async function assertDailySpeechCap(db: D1Database, userId: string, settings: AiSettings, characters: number, now = Date.now()): Promise<DailyAllowance> {
  const used = await countDailySpeechCharacters(db, userId, now);
  const resetsAt = nextUtcMidnight(now);
  if (used + characters > settings.dailySpeechCharCap) throw new AiLimitError("SPEECH_DAILY_LIMIT", resetsAt);
  return { used, cap: settings.dailySpeechCharCap, resetsAt };
}
