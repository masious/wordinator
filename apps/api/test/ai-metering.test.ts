import { env } from "cloudflare:test";
import { aiLimitErrorSchema, DEFAULT_AI_SETTINGS, type AiSettings } from "@wordinator/contracts/ai";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AiLimitError, AiUnavailableError, aiErrorResponse, assertDailySpeechCap, assertDailyTurnCap, countDailySpeechCharacters, readAiSettings,
  recordAiUsage, recordSpeechUsage, writeAiSettings,
} from "../src/ai";
import { resetDatabase, seedUser } from "./courseApi";

// Daily caps, speech metering, and the AI settings row (C14f; docs/ai-tutor.md#usage-and-limits, docs/speech.md#on-demand-audio).

const DAY = 24 * 60 * 60 * 1000;
const NOON = Date.UTC(2026, 9, 16, 12, 0, 0);
const MIDNIGHT = Date.UTC(2026, 9, 17);

let userId: string;
let otherId: string;
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM ai_usage"), env.DB.prepare("DELETE FROM speech_usage"), env.DB.prepare("DELETE FROM platform_metadata WHERE key = 'ai_settings'")]);
  await resetDatabase();
  userId = await seedUser("learner");
  otherId = await seedUser("other");
});

const usage = (user: string, turnStart: boolean) => ({
  userId: user, conversationId: null, provider: "openrouter" as const, model: "m:free", turnStart, tokensIn: 1, tokensOut: 1, costMicroUsd: 0, ok: true,
});

describe("daily turn cap", () => {
  it("counts turn-start rows of the current UTC day and refuses at the cap with the reset time", async () => {
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 2 };
    await recordAiUsage(env.DB, usage(userId, true), NOON - DAY); // yesterday
    await recordAiUsage(env.DB, usage(userId, true), Date.UTC(2026, 9, 16, 0, 0, 0)); // today, first millisecond
    await recordAiUsage(env.DB, usage(userId, false), NOON); // a tool-loop or fallback request of the same turn
    await recordAiUsage(env.DB, usage(otherId, true), NOON);
    await recordAiUsage(env.DB, usage(otherId, true), NOON);
    expect(await assertDailyTurnCap(env.DB, userId, settings, NOON)).toEqual({ used: 1, cap: 2, resetsAt: MIDNIGHT });

    await recordAiUsage(env.DB, { ...usage(userId, true), ok: false }, NOON); // a failed turn still counts
    const error = await assertDailyTurnCap(env.DB, userId, settings, NOON).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiLimitError);
    expect(error).toMatchObject({ code: "AI_DAILY_LIMIT", resetsAt: MIDNIGHT });
    // The next UTC day starts afresh.
    expect((await assertDailyTurnCap(env.DB, userId, settings, MIDNIGHT)).used).toBe(0);
  });

  it("refuses every turn at a cap of 0", async () => {
    await expect(assertDailyTurnCap(env.DB, userId, { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 0 }, NOON)).rejects.toMatchObject({ code: "AI_DAILY_LIMIT" });
  });

  it("answers 429 AI_DAILY_LIMIT with resetsAt, and 503 AI_UNAVAILABLE", async () => {
    const app = new Hono();
    app.get("/limit", (context) => aiErrorResponse(context, new AiLimitError("AI_DAILY_LIMIT", MIDNIGHT)) ?? context.text("no"));
    app.get("/unavailable", (context) => aiErrorResponse(context, new AiUnavailableError()) ?? context.text("no"));
    app.get("/other", (context) => aiErrorResponse(context, new Error("x")) ?? context.text("not an AI error"));
    const limit = await app.request("/limit");
    expect(limit.status).toBe(429);
    const body = aiLimitErrorSchema.parse(await limit.json());
    expect(body.error).toMatchObject({ code: "AI_DAILY_LIMIT", resetsAt: MIDNIGHT });
    const unavailable = await app.request("/unavailable");
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: { code: "AI_UNAVAILABLE" } });
    expect(await (await app.request("/other")).text()).toBe("not an AI error");
  });
});

describe("speech metering", () => {
  it("records misses and cache hits, and counts both toward the character cap", async () => {
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, dailySpeechCharCap: 500 };
    await recordSpeechUsage(env.DB, { userId, surface: "ai_message", clipHash: "a".repeat(64), characters: 200, cached: false }, NOON);
    await recordSpeechUsage(env.DB, { userId, surface: "ai_message", clipHash: "b".repeat(64), characters: 250, cached: true }, NOON);
    await recordSpeechUsage(env.DB, { userId, surface: "ai_message", clipHash: "c".repeat(64), characters: 300, cached: false }, NOON - DAY);
    await recordSpeechUsage(env.DB, { userId: otherId, surface: "ai_message", clipHash: "d".repeat(64), characters: 300, cached: false }, NOON);
    const rows = (await env.DB.prepare("SELECT surface, characters, cached FROM speech_usage WHERE user_id = ? ORDER BY created_at DESC, characters").bind(userId).all()).results;
    expect(rows).toEqual([
      { surface: "ai_message", characters: 200, cached: 0 }, { surface: "ai_message", characters: 250, cached: 1 }, { surface: "ai_message", characters: 300, cached: 0 },
    ]);
    expect(await countDailySpeechCharacters(env.DB, userId, NOON)).toBe(450);

    expect(await assertDailySpeechCap(env.DB, userId, settings, 50, NOON)).toEqual({ used: 450, cap: 500, resetsAt: MIDNIGHT });
    const error = await assertDailySpeechCap(env.DB, userId, settings, 51, NOON).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiLimitError);
    expect(error).toMatchObject({ code: "SPEECH_DAILY_LIMIT", resetsAt: MIDNIGHT });
    expect((await assertDailySpeechCap(env.DB, userId, settings, 300, MIDNIGHT)).used).toBe(0);
  });

  it("rejects an unknown surface at the database", async () => {
    await expect(recordSpeechUsage(env.DB, { userId, surface: "lesson" as "ai_message", clipHash: "e", characters: 1, cached: false }, NOON)).rejects.toThrow();
  });
});

describe("AI settings row", () => {
  it("reads the defaults when the row is missing, not JSON, or invalid", async () => {
    expect(await readAiSettings(env.DB)).toEqual(DEFAULT_AI_SETTINGS);
    const store = (value: string) => env.DB.prepare("INSERT INTO platform_metadata (key, value, updated_at) VALUES ('ai_settings', ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(value).run();
    await store("{not json");
    expect(await readAiSettings(env.DB)).toEqual(DEFAULT_AI_SETTINGS);
    await store(JSON.stringify({ ...DEFAULT_AI_SETTINGS, dailyTurnCap: 9999 }));
    expect(await readAiSettings(env.DB)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("stores and reads back a valid value, and refuses to store an invalid one", async () => {
    const settings: AiSettings = {
      providers: [{ provider: "azure", enabled: true, model: "my-deployment" }, { provider: "openrouter", enabled: false, model: "qwen/qwen3-coder:free" }],
      dailyTurnCap: 10, dailySpeechCharCap: 0,
    };
    await writeAiSettings(env.DB, settings, NOON);
    expect(await readAiSettings(env.DB)).toEqual(settings);
    await expect(writeAiSettings(env.DB, { ...settings, dailyTurnCap: -1 }, NOON)).rejects.toThrow();
    expect(await readAiSettings(env.DB)).toEqual(settings);
  });
});
