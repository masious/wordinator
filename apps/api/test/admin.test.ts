import { env } from "cloudflare:test";
import { aiAnalyticsResponseSchema, learningAnalyticsResponseSchema, speechAnalyticsResponseSchema } from "@wordinator/contracts/admin";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@wordinator/contracts/ai";
import { beforeEach, describe, expect, it } from "vitest";
import { readAiSettings } from "../src/ai";
import { addLesson, createCourse, errorCode, join, request, resetDatabase, seedGroup, seedUser, signIn } from "./courseApi";
import { fetchWorker } from "./worker";

// Superuser routes (C14e, docs/settings-and-administration.md#superuser): the flag check on every route, counts by UTC day
// and account over seeded rows, no text in the responses, and the AI settings round trip.

const DAY = 86_400_000;
const SECRET = "SECRET-TEXT";
const ROUTES = [
  ["GET", "/api/admin/analytics/learning?days=7"],
  ["GET", "/api/admin/analytics/ai?days=30"],
  ["GET", "/api/admin/analytics/speech"],
  ["GET", "/api/admin/ai-settings"],
  ["PUT", "/api/admin/ai-settings"],
] as const;
const call = (method: string, path: string, cookie?: string) => fetchWorker(`https://wordinator.test${path}`, {
  method, headers: { ...(cookie ? { cookie } : {}), ...(method === "PUT" ? { "content-type": "application/json" } : {}) },
  body: method === "PUT" ? JSON.stringify(DEFAULT_AI_SETTINGS) : undefined,
});
const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM platform_metadata WHERE key = 'ai_settings'").run();
  await resetDatabase();
});

async function accounts() {
  const adminId = await seedUser("admin"); const learnerId = await seedUser("learner");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET is_superuser = 1, username = 'zed_admin' WHERE id = ?").bind(adminId),
    env.DB.prepare("UPDATE users SET username = 'Ada' WHERE id = ?").bind(learnerId),
  ]);
  const groupId = await seedGroup("library", adminId); await join(groupId, learnerId);
  return { adminId, learnerId, groupId, admin: await signIn("admin"), learner: await signIn("learner") };
}

describe("superuser access", () => {
  it("refuses anonymous requests on every admin route", async () => {
    for (const [method, path] of ROUTES) {
      const response = await call(method, path);
      expect(response.status, path).toBe(401);
      expect(await errorCode(response)).toBe("AUTH_REQUIRED");
    }
  });

  it("refuses ordinary accounts with 403 SUPERUSER_REQUIRED on every admin route", async () => {
    const { learner } = await accounts();
    for (const [method, path] of ROUTES) {
      const response = await call(method, path, learner);
      expect(response.status, path).toBe(403);
      expect(await errorCode(response)).toBe("SUPERUSER_REQUIRED");
    }
    expect(await readAiSettings(env.DB)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("refuses a superuser that has not finished setup, and takes a revoke on the next request", async () => {
    const { adminId, admin } = await accounts();
    expect((await call("GET", "/api/admin/ai-settings", admin)).status).toBe(200);
    await env.DB.prepare("UPDATE users SET is_superuser = 0 WHERE id = ?").bind(adminId).run();
    const revoked = await call("GET", "/api/admin/ai-settings", admin);
    expect(revoked.status).toBe(403);
    expect(await errorCode(revoked)).toBe("SUPERUSER_REQUIRED");

    const newcomerId = await seedUser("newcomer");
    await env.DB.prepare("UPDATE users SET is_superuser = 1, display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await call("GET", "/api/admin/analytics/learning", await signIn("newcomer"));
    expect(newcomer.status).toBe(403);
    expect(await errorCode(newcomer)).toBe("ONBOARDING_REQUIRED");
  });

  it("carries isSuperuser on the session read", async () => {
    const { admin, learner } = await accounts();
    const read = async (cookie: string) => ((await (await request("/api/session", cookie)).json()) as { user: { isSuperuser: boolean } }).user.isSuperuser;
    expect(await read(admin)).toBe(true);
    expect(await read(learner)).toBe(false);
  });

  it("refuses a range other than 7, 30, or 90 days", async () => {
    const { admin } = await accounts();
    for (const days of ["1", "14", "abc", "7.5"]) {
      const response = await request(`/api/admin/analytics/learning?days=${days}`, admin);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    }
  });
});

describe("analytics", () => {
  async function seeded() {
    const setup = await accounts();
    const course = await createCourse(setup.groupId, setup.admin);
    const { lesson } = await addLesson(setup.groupId, course.id, setup.admin, "Animals");
    const otherLesson = await addLesson(setup.groupId, course.id, setup.admin, "Food");
    const now = Date.now();
    const twoDaysAgo = now - 2 * DAY; const tenDaysAgo = now - 10 * DAY; const longAgo = now - 120 * DAY;
    const db = env.DB;
    const review = (userId: string, source: string, at: number) => db.prepare(
      `INSERT INTO word_reviews (id, user_id, term_key, course_id, lesson_id, word_id, direction, result, source, seed_box, conversation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'understand', 'got', ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), userId, SECRET, course.id, lesson.id, crypto.randomUUID(), source, source === "seed" ? 1 : null, at);
    const attempt = (userId: string, source: string, at: number) => db.prepare(
      `INSERT INTO practice_attempts (id, user_id, course_id, lesson_id, practice_kind, practice_id, item_index, prompt, answer, reference, matched, ai_verdict, ai_note, source, conversation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, NULL, ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), userId, course.id, lesson.id, source === "lesson" ? "lesson" : "ai", crypto.randomUUID(), SECRET, SECRET, SECRET, SECRET, source, at);
    const pronunciation = (userId: string, at: number) => db.prepare(
      `INSERT INTO pronunciation_attempts (id, user_id, surface, reference_text, term_key, lesson_id, word_id, overall, accuracy, fluency, completeness, word_scores, created_at)
       VALUES (?, ?, 'drill', ?, ?, NULL, NULL, 81, 82, 83, 84, ?, ?)`,
    ).bind(crypto.randomUUID(), userId, SECRET, SECRET, JSON.stringify([{ word: SECRET }]), at);
    const usage = (userId: string, provider: string, model: string, turnStart: boolean, ok: boolean, tokensIn: number, tokensOut: number, cost: number, at: number) => db.prepare(
      "INSERT INTO ai_usage (id, user_id, conversation_id, provider, model, turn_start, tokens_in, tokens_out, cost_microusd, ok, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), userId, provider, model, turnStart ? 1 : 0, tokensIn, tokensOut, cost, ok ? 1 : 0, at);
    const speech = (userId: string, characters: number, cached: boolean, at: number) => db.prepare(
      "INSERT INTO speech_usage (id, user_id, surface, clip_hash, characters, cached, created_at) VALUES (?, ?, 'ai_message', ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), userId, crypto.randomUUID(), characters, cached ? 1 : 0, at);

    const { adminId, learnerId } = setup;
    await db.batch([
      // Today: the learner drills twice, does a lesson and a tutor practice, says a word, completes a lesson, and takes a
      // tutor turn; the admin only has a seed review (not activity) and a tutor turn.
      review(learnerId, "drill", now), review(learnerId, "drill", now), review(learnerId, "ai_chat", now), review(adminId, "seed", now),
      attempt(learnerId, "lesson", now), attempt(learnerId, "ai_chat", now), pronunciation(learnerId, now),
      db.prepare("INSERT INTO course_lesson_completions (group_id, course_id, lesson_id, user_id, completed_at) VALUES (?, ?, ?, ?, ?)").bind(setup.groupId, course.id, lesson.id, learnerId, now),
      usage(learnerId, "openrouter", "free/model:free", true, false, 10, 0, 0, now),
      usage(learnerId, "workers_ai", "@cf/meta/llama", false, true, 100, 40, 50, now),
      usage(adminId, "azure", "gpt-4.1-mini", true, true, 1_000, 200, 720, now),
      speech(learnerId, 120, false, now), speech(learnerId, 120, true, now),
      // Two days ago: the admin saves a position (activity only) and does an AI practice; the learner drills once.
      db.prepare(
        "INSERT INTO course_lesson_positions (group_id, course_id, lesson_id, user_id, step_key, step_index, passed_steps, total_steps, updated_at) VALUES (?, ?, ?, ?, 'k', 0, 0, 3, ?)",
      ).bind(setup.groupId, course.id, otherLesson.lesson.id, adminId, twoDaysAgo),
      attempt(adminId, "ai_practice", twoDaysAgo), review(learnerId, "drill", twoDaysAgo),
      speech(adminId, 300, false, twoDaysAgo),
      // Ten days ago: inside 30 days only. 120 days ago: outside every range.
      review(learnerId, "drill", tenDaysAgo), usage(learnerId, "openrouter", "free/model:free", true, true, 5, 5, 0, tenDaysAgo), speech(learnerId, 50, true, tenDaysAgo),
      review(learnerId, "drill", longAgo), pronunciation(adminId, longAgo), usage(adminId, "azure", "gpt-4.1-mini", true, true, 1, 1, 1, longAgo),
    ]);
    return { ...setup, now, twoDaysAgo, tenDaysAgo };
  }

  const json = async (response: Response) => {
    expect(response.status).toBe(200);
    const text = await response.text();
    // Counts and costs only: no prompt, answer, reference, term, or word-score text reaches the response.
    expect(text).not.toContain(SECRET);
    return JSON.parse(text) as unknown;
  };

  it("counts learning activity by UTC day and account", async () => {
    const { admin, adminId, learnerId, now, twoDaysAgo } = await seeded();
    const week = learningAnalyticsResponseSchema.parse(await json(await request("/api/admin/analytics/learning?days=7", admin)));
    expect(week.days).toBe(7);
    expect(week.daily).toHaveLength(7);
    expect(week.to).toBe(dayOf(now));
    expect(week.from).toBe(dayOf(now - 6 * DAY));
    const today = week.daily.at(-1)!;
    expect(today).toEqual({
      day: dayOf(now), activeAccounts: 2, lessonsCompleted: 1, drillReviews: 2,
      practiceAttempts: { lesson: 1, aiChat: 1, aiPractice: 0 }, pronunciationAttempts: 1,
    });
    expect(week.daily.find((row) => row.day === dayOf(twoDaysAgo))).toEqual({
      day: dayOf(twoDaysAgo), activeAccounts: 2, lessonsCompleted: 0, drillReviews: 1,
      practiceAttempts: { lesson: 0, aiChat: 0, aiPractice: 1 }, pronunciationAttempts: 0,
    });
    expect(week.daily.filter((row) => row.activeAccounts === 0)).toHaveLength(5);
    // By username, case-insensitively.
    expect(week.accounts).toEqual([
      { userId: learnerId, username: "Ada", activeDays: 2, lessonsCompleted: 1, drillReviews: 3, practiceAttempts: { lesson: 1, aiChat: 1, aiPractice: 0 }, pronunciationAttempts: 1 },
      { userId: adminId, username: "zed_admin", activeDays: 2, lessonsCompleted: 0, drillReviews: 0, practiceAttempts: { lesson: 0, aiChat: 0, aiPractice: 1 }, pronunciationAttempts: 0 },
    ]);

    const month = learningAnalyticsResponseSchema.parse(await json(await request("/api/admin/analytics/learning?days=30", admin)));
    expect(month.daily).toHaveLength(30);
    expect(month.accounts.find((row) => row.userId === learnerId)).toMatchObject({ activeDays: 3, drillReviews: 4 });
    const quarter = learningAnalyticsResponseSchema.parse(await json(await request("/api/admin/analytics/learning?days=90", admin)));
    expect(quarter.daily).toHaveLength(90);
    expect(quarter.daily.reduce((sum, row) => sum + row.pronunciationAttempts, 0)).toBe(1);
  });

  it("counts AI turns, requests, failures, tokens, and cost per day, account, and model", async () => {
    const { admin, adminId, learnerId, now, tenDaysAgo } = await seeded();
    const week = aiAnalyticsResponseSchema.parse(await json(await request("/api/admin/analytics/ai?days=7", admin)));
    expect(week.daily.at(-1)).toEqual({ day: dayOf(now), turns: 2, requests: 3, failures: 1, tokensIn: 1_110, tokensOut: 240, costMicroUsd: 770 });
    expect(week.daily.slice(0, -1).every((row) => row.requests === 0)).toBe(true);
    expect(week.accounts).toEqual([
      { userId: learnerId, username: "Ada", turns: 1, requests: 2, failures: 1, tokensIn: 110, tokensOut: 40, costMicroUsd: 50 },
      { userId: adminId, username: "zed_admin", turns: 1, requests: 1, failures: 0, tokensIn: 1_000, tokensOut: 200, costMicroUsd: 720 },
    ]);
    expect(week.models).toEqual([
      { provider: "openrouter", model: "free/model:free", turns: 1, requests: 1, failures: 1, tokensIn: 10, tokensOut: 0, costMicroUsd: 0 },
      { provider: "workers_ai", model: "@cf/meta/llama", turns: 0, requests: 1, failures: 0, tokensIn: 100, tokensOut: 40, costMicroUsd: 50 },
      { provider: "azure", model: "gpt-4.1-mini", turns: 1, requests: 1, failures: 0, tokensIn: 1_000, tokensOut: 200, costMicroUsd: 720 },
    ]);
    const month = aiAnalyticsResponseSchema.parse(await json(await request("/api/admin/analytics/ai?days=30", admin)));
    expect(month.daily.find((row) => row.day === dayOf(tenDaysAgo))).toMatchObject({ turns: 1, requests: 1, tokensIn: 5 });
    expect(month.models[0]).toMatchObject({ provider: "openrouter", turns: 2, requests: 2 });
  });

  it("counts speech requests and characters split into cache hits and Azure calls", async () => {
    const { admin, adminId, learnerId, now, twoDaysAgo } = await seeded();
    const week = speechAnalyticsResponseSchema.parse(await json(await request("/api/admin/analytics/speech?days=7", admin)));
    expect(week.daily.at(-1)).toEqual({ day: dayOf(now), requests: 2, characters: 240, cacheHits: 1, azureCalls: 1, azureCharacters: 120 });
    expect(week.daily.find((row) => row.day === dayOf(twoDaysAgo))).toEqual({ day: dayOf(twoDaysAgo), requests: 1, characters: 300, cacheHits: 0, azureCalls: 1, azureCharacters: 300 });
    expect(week.accounts).toEqual([
      { userId: learnerId, username: "Ada", requests: 2, characters: 240, cacheHits: 1, azureCalls: 1, azureCharacters: 120 },
      { userId: adminId, username: "zed_admin", requests: 1, characters: 300, cacheHits: 0, azureCalls: 1, azureCharacters: 300 },
    ]);
    const month = speechAnalyticsResponseSchema.parse(await json(await request("/api/admin/analytics/speech?days=30", admin)));
    expect(month.accounts[0]).toMatchObject({ requests: 3, characters: 290, cacheHits: 2 });
  });
});

describe("AI settings", () => {
  const put = (cookie: string, body: unknown) => request("/api/admin/ai-settings", cookie, body, "PUT");

  it("reads the defaults, replaces the whole value, and reads it back", async () => {
    const { admin } = await accounts();
    expect(await (await request("/api/admin/ai-settings", admin)).json()).toEqual(DEFAULT_AI_SETTINGS);
    const next: AiSettings = {
      providers: [
        { provider: "azure", enabled: true, model: "gpt-4.1-nano" },
        { provider: "openrouter", enabled: false, model: "qwen/qwen3-coder:free" },
        { provider: "workers_ai", enabled: true, model: "@cf/openai/gpt-oss-20b" },
      ],
      dailyTurnCap: 12,
      dailySpeechCharCap: 0,
    };
    const saved = await put(admin, next);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(next);
    expect(await (await request("/api/admin/ai-settings", admin)).json()).toEqual(next);
    expect(await readAiSettings(env.DB)).toEqual(next);
  });

  it("refuses invalid settings with 400 AI_SETTINGS_INVALID and keeps the stored value", async () => {
    const { admin } = await accounts();
    const [first, second, third] = DEFAULT_AI_SETTINGS.providers;
    const invalid: unknown[] = [
      { ...DEFAULT_AI_SETTINGS, providers: DEFAULT_AI_SETTINGS.providers.map((item) => ({ ...item, enabled: false })) },
      { ...DEFAULT_AI_SETTINGS, providers: [first, first, second] },
      { ...DEFAULT_AI_SETTINGS, providers: [first, second] },
      { ...DEFAULT_AI_SETTINGS, providers: [first, second, { ...third, model: "bad model id" }] },
      { ...DEFAULT_AI_SETTINGS, providers: [first, second, { ...third, model: "" }] },
      { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 501 },
      { ...DEFAULT_AI_SETTINGS, dailyTurnCap: -1 },
      { ...DEFAULT_AI_SETTINGS, dailySpeechCharCap: 100_001 },
      { ...DEFAULT_AI_SETTINGS, dailySpeechCharCap: 1.5 },
      { providers: DEFAULT_AI_SETTINGS.providers },
      null,
    ];
    for (const body of invalid) {
      const response = await put(admin, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await errorCode(response)).toBe("AI_SETTINGS_INVALID");
    }
    const malformed = await fetchWorker("https://wordinator.test/api/admin/ai-settings", { method: "PUT", headers: { cookie: admin, "content-type": "application/json" }, body: "{" });
    expect(malformed.status).toBe(400);
    expect(await readAiSettings(env.DB)).toEqual(DEFAULT_AI_SETTINGS);
  });
});
