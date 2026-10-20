import { env } from "cloudflare:test";
import { timeAnalyticsResponseSchema } from "@wordinator/contracts/admin";
import { learningActivityResponseSchema, learningGoalSchema, type LearningActivity } from "@wordinator/contracts/learning";
import { beforeEach, describe, expect, it } from "vitest";
import { shiftDay, streakEndingOn } from "../src/learning/activity";
import { addLesson, createCourse, errorCode, join, request, resetDatabase, seedGroup, seedUser, signIn } from "./courseApi";
import { fetchWorker } from "./worker";

// Learning activity and the daily goal (C15d, docs/learning-time.md#activity and #daily-goal-and-streak): the per-day categories,
// the previous period, the goal's validation, the streak, and the superuser's time analytics.

const END = "2026-10-20";

async function setup() {
  const ownerId = await seedUser("owner"); const learnerId = await seedUser("learner"); const otherId = await seedUser("other");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, learnerId); await join(groupId, otherId);
  const owner = await signIn("owner"); const learner = await signIn("learner"); const other = await signIn("other");
  const course = await createCourse(groupId, owner);
  const lesson = await addLesson(groupId, course.id, owner, "Huis");
  return { ownerId, learnerId, otherId, groupId, owner, learner, other, courseId: course.id, lessonId: lesson.lesson.id };
}
type Setup = Awaited<ReturnType<typeof setup>>;

// Writes one stored row directly; the send route's rules are tested with the time tests. Each row needs its own key.
let rowNumber = 0;
async function store(userId: string, day: string, activity: LearningActivity, seconds: number, options: { focus?: string; courseId?: string; lessonId?: string; practiceId?: string } = {}) {
  rowNumber += 1;
  await env.DB.prepare(
    `INSERT INTO learning_time (user_id, entry_key, day, activity, focus, course_id, lesson_id, practice_id, seconds, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(userId, `k${rowNumber}`, day, activity, options.focus ?? null, options.courseId ?? null, options.lessonId ?? null, options.practiceId ?? null, seconds, Date.now()).run();
}
const activity = (s: Setup, cookie: string, range: "week" | "month" = "week", end = END) =>
  request(`/api/groups/${s.groupId}/learning-activity?range=${range}&end=${end}`, cookie);
const goal = (cookie: string, body?: unknown) => request("/api/learning/goal", cookie, body, body === undefined ? "GET" : "PUT");

beforeEach(resetDatabase);

describe("learning activity read", () => {
  it("needs a signed-in account", async () => {
    const s = await setup();
    const response = await fetchWorker(`https://wordinator.test/api/groups/${s.groupId}/learning-activity?range=week&end=${END}`);
    expect(response.status).toBe(401);
  });

  it("refuses an unknown range or an end that is not a day", async () => {
    const s = await setup();
    expect((await activity(s, s.learner, "week", "2026-02-30")).status).toBe(400);
    expect(await errorCode(await request(`/api/groups/${s.groupId}/learning-activity?range=year&end=${END}`, s.learner))).toBe("VALIDATION_ERROR");
    expect((await request(`/api/groups/${s.groupId}/learning-activity?range=week`, s.learner)).status).toBe(400);
  });

  it("answers every day of the range with its categories, zero-filled, and the period's totals", async () => {
    const s = await setup();
    await store(s.learnerId, END, "reading", 600, { focus: "lesson", courseId: s.courseId, lessonId: s.lessonId });
    await store(s.learnerId, END, "reading", 300, { focus: "grammar", courseId: s.courseId, lessonId: s.lessonId });
    await store(s.learnerId, END, "practice", 120, { courseId: s.courseId, lessonId: s.lessonId, practiceId: "p1" });
    await store(s.learnerId, END, "drill", 60, { courseId: s.courseId });
    await store(s.learnerId, END, "words", 30);
    await store(s.learnerId, END, "tutor", 90);
    await store(s.learnerId, END, "ai_practice", 200, { focus: "listening", courseId: s.courseId, lessonId: s.lessonId, practiceId: "a1" });
    await store(s.learnerId, "2026-10-18", "reading", 60, { focus: "lesson", courseId: s.courseId, lessonId: s.lessonId });

    const response = await activity(s, s.learner);
    expect(response.status).toBe(200);
    const body = learningActivityResponseSchema.parse(await response.json());
    expect(body.from).toBe("2026-10-14");
    expect(body.to).toBe(END);
    expect(body.days.map((row) => row.day)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(body.days[4]).toMatchObject({ lesson: 60, total: 60 });
    expect(body.days[6]).toMatchObject({
      lesson: 600, grammar: 300, practice: 120, vocabulary: 90, aiPractice: 290, total: 1_400,
      aiPracticeFocus: { grammar: 0, vocabulary: 0, reading: 0, listening: 200, writing: 0 },
    });
    expect(body.days[0]).toMatchObject({ lesson: 0, total: 0 });
    expect(body.totals).toMatchObject({ lesson: 660, grammar: 300, practice: 120, vocabulary: 90, aiPractice: 290, total: 1_460 });
  });

  it("counts the previous period of the same length and ignores other accounts", async () => {
    const s = await setup();
    await store(s.learnerId, "2026-10-10", "reading", 500, { focus: "lesson", courseId: s.courseId, lessonId: s.lessonId });
    await store(s.learnerId, "2026-10-01", "reading", 900, { focus: "lesson", courseId: s.courseId, lessonId: s.lessonId });
    await store(s.otherId, END, "tutor", 4_000);
    const body = learningActivityResponseSchema.parse(await (await activity(s, s.learner)).json());
    expect(body.previousTotal).toBe(500);
    expect(body.totals.total).toBe(0);
  });

  it("reads a month as thirty days", async () => {
    const s = await setup();
    const body = learningActivityResponseSchema.parse(await (await activity(s, s.learner, "month")).json());
    expect(body.days).toHaveLength(30);
    expect(body.from).toBe("2026-09-21");
  });
});

describe("daily goal", () => {
  it("is refused outside 5–240 minutes and accepts a whole number or no goal", async () => {
    const s = await setup();
    for (const dailyGoalMinutes of [4, 241, 12.5, "20"]) {
      expect((await goal(s.learner, { dailyGoalMinutes })).status).toBe(400);
    }
    expect((await goal(s.learner, {})).status).toBe(400);
    expect((await goal(s.learner, { dailyGoalMinutes: 30, streak: 9 })).status).toBe(400);
    const saved = await goal(s.learner, { dailyGoalMinutes: 30 });
    expect(saved.status).toBe(200);
    expect(learningGoalSchema.parse(await saved.json())).toEqual({ dailyGoalMinutes: 30 });
    expect(learningGoalSchema.parse(await (await goal(s.learner)).json())).toEqual({ dailyGoalMinutes: 30 });
    expect(learningGoalSchema.parse(await (await goal(s.learner, { dailyGoalMinutes: null })).json())).toEqual({ dailyGoalMinutes: null });
    expect(learningGoalSchema.parse(await (await goal(s.learner)).json())).toEqual({ dailyGoalMinutes: null });
  });

  it("needs a signed-in account", async () => {
    const response = await fetchWorker("https://wordinator.test/api/learning/goal");
    expect(response.status).toBe(401);
  });

  it("is kept when the tutor profile is saved, and the profile is kept when the goal changes", async () => {
    const s = await setup();
    await goal(s.learner, { dailyGoalMinutes: 15 });
    await request("/api/ai/profile", s.learner, { nativeLanguage: "de", replyLanguage: "target", goals: "Reading" }, "PUT");
    expect(learningGoalSchema.parse(await (await goal(s.learner)).json())).toEqual({ dailyGoalMinutes: 15 });
    await goal(s.learner, { dailyGoalMinutes: 20 });
    const profile = await (await request("/api/ai/profile", s.learner)).json() as { profile: { nativeLanguage: string; goals: string } };
    expect(profile.profile).toMatchObject({ nativeLanguage: "de", goals: "Reading" });
  });

  it("counts a day against the goal, or any full minute without one", async () => {
    const s = await setup();
    await store(s.learnerId, END, "tutor", 300);
    await store(s.learnerId, "2026-10-19", "tutor", 299);
    await store(s.learnerId, "2026-10-18", "tutor", 60);
    const none = learningActivityResponseSchema.parse(await (await activity(s, s.learner)).json());
    expect(none.streak).toBe(3);

    await goal(s.learner, { dailyGoalMinutes: 5 });
    const five = learningActivityResponseSchema.parse(await (await activity(s, s.learner)).json());
    expect(five).toMatchObject({ dailyGoalMinutes: 5, streak: 1 });
  });
});

describe("streak", () => {
  const at = (day: string, seconds: number) => [day, seconds] as const;

  it("ends on today once today meets the goal, and on yesterday until then", () => {
    const seconds = new Map([at("2026-10-18", 600), at("2026-10-19", 600), at("2026-10-20", 600)]);
    expect(streakEndingOn("2026-10-20", seconds, 600)).toBe(3);
    seconds.delete("2026-10-20");
    expect(streakEndingOn("2026-10-20", seconds, 600)).toBe(2);
    expect(streakEndingOn("2026-10-21", seconds, 600)).toBe(0);
  });

  it("stops at the first missing day", () => {
    const seconds = new Map([at("2026-10-16", 600), at("2026-10-18", 600), at("2026-10-19", 600)]);
    expect(streakEndingOn("2026-10-19", seconds, 600)).toBe(2);
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("superuser time analytics", () => {
  it("answers counts by category for each account and day, and refuses other accounts", async () => {
    const s = await setup();
    await env.DB.prepare("UPDATE users SET is_superuser = 1, username = 'zed' WHERE id = ?").bind(s.ownerId).run();
    await env.DB.prepare("UPDATE users SET username = 'Ada' WHERE id = ?").bind(s.learnerId).run();
    const today = new Date().toISOString().slice(0, 10);
    await store(s.learnerId, today, "reading", 120, { focus: "grammar", courseId: s.courseId, lessonId: s.lessonId });
    await store(s.learnerId, today, "drill", 60);
    await store(s.learnerId, today, "ai_practice", 30, { focus: "writing", courseId: s.courseId, lessonId: s.lessonId, practiceId: "w1" });

    const denied = await fetchWorker("https://wordinator.test/api/admin/analytics/time?days=7", { headers: { cookie: s.learner } });
    expect(denied.status).toBe(403);

    const response = await fetchWorker("https://wordinator.test/api/admin/analytics/time?days=7", { headers: { cookie: s.owner } });
    expect(response.status).toBe(200);
    const body = timeAnalyticsResponseSchema.parse(await response.json());
    expect(body.daily.find((row) => row.day === today)).toMatchObject({ grammar: 120, vocabulary: 60, aiPractice: 30, total: 210 });
    expect(body.accounts).toEqual([expect.objectContaining({ userId: s.learnerId, username: "Ada", grammar: 120, total: 210 })]);
  });
});
