import { env } from "cloudflare:test";
import { lessonMetricsResponseSchema, type LearningTimeEntry, type LessonTime } from "@wordinator/contracts/learning";
import { beforeEach, describe, expect, it } from "vitest";
import { clampSeconds, median } from "../src/learning/time";
import { saveAiPractice } from "../src/tutor/aiPractices";
import { addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, request, resetDatabase, seedGroup, seedUser, signIn } from "./courseApi";
import { fetchWorker } from "./worker";

// Learning time (C15, docs/learning-time.md): sending time, its limits, the snapshots, the lesson box's times and medians, reset,
// and lesson deletion.
const practicePayload = { instruction: "Translate.", items: [{ prompt: "house", authorsVersion: ["huis"] }, { prompt: "mouse", authorsVersion: ["muis"] }] };
const today = () => new Date().toISOString().slice(0, 10);

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader"); const otherId = await seedUser("other");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId); await join(groupId, otherId);
  const owner = await signIn("owner"); const reader = await signIn("reader"); const other = await signIn("other");
  const course = await createCourse(groupId, owner);
  const heading = blocks.heading("Huis"); const practice = blocks.practice(practicePayload);
  const lesson = await addLesson(groupId, course.id, owner, "Huis", { document: documentOf(heading, blocks.paragraph("Een huis."), practice) });
  return { ownerId, readerId, otherId, groupId, owner, reader, other, course, lesson, practiceId: practice.id, headingId: heading.id };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const send = (s: Setup, cookie: string, entries: LearningTimeEntry[], day = today()) => request(`/api/groups/${s.groupId}/learning-time`, cookie, { day, entries });
const reading = (s: Setup, seconds: number, focus: "lesson" | "grammar" = "lesson"): LearningTimeEntry => ({ activity: "reading", focus, courseId: s.course.id, lessonId: s.lesson.lesson.id, seconds });
const practising = (s: Setup, seconds: number): LearningTimeEntry => ({ activity: "practice", courseId: s.course.id, lessonId: s.lesson.lesson.id, practiceId: s.practiceId, seconds });
// Moves an account's rows back in time, as if their last send had been that long ago.
const age = (userId: string, ms = 3_600_000) => env.DB.prepare("UPDATE learning_time SET updated_at = updated_at - ? WHERE user_id = ?").bind(ms, userId).run();
const rows = (userId: string) => env.DB.prepare("SELECT activity, focus, course_id AS courseId, lesson_id AS lessonId, practice_id AS practiceId, seconds FROM learning_time WHERE user_id = ? ORDER BY activity, focus")
  .bind(userId).all<Record<string, unknown>>().then((result) => result.results);
async function timeOf(s: Setup, cookie: string): Promise<LessonTime> {
  const response = await request(`${s.lesson.path}/metrics`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return lessonMetricsResponseSchema.parse(await response.json()).time;
}
const answer = (s: Setup, cookie: string, answered: number) => request(`${s.lesson.path}/blocks/${s.practiceId}/progress`, cookie, { answered }, "PUT");
const complete = (s: Setup, cookie: string) => request(`${s.lesson.path}/completion`, cookie, {}, "PUT");

beforeEach(resetDatabase);

describe("pure helpers", () => {
  it("scales seconds down to the allowance and takes medians", () => {
    expect(clampSeconds([60, 30], 120)).toEqual([60, 30]);
    expect(clampSeconds([60, 60], 60)).toEqual([30, 30]);
    expect(clampSeconds([10, 10], 0)).toEqual([0, 0]);
    expect(median([])).toBeNull();
    expect(median([300, 100, 200])).toBe(200);
    expect(median([100, 200])).toBe(150);
  });
});

describe("sending time", () => {
  it("needs a signed-in account", async () => {
    const s = await setup();
    const response = await fetchWorker(`https://wordinator.test/api/groups/${s.groupId}/learning-time`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day: today(), entries: [reading(s, 60)] }),
    });
    expect(response.status).toBe(401);
  });

  it("adds each send to one row per target and day, and keeps accounts apart", async () => {
    const s = await setup();
    expect((await send(s, s.reader, [reading(s, 60), reading(s, 20, "grammar"), practising(s, 30), { activity: "drill", courseId: s.course.id, seconds: 15 }, { activity: "tutor", seconds: 10 }, { activity: "words", seconds: 5 }])).status).toBe(204);
    await age(s.readerId);
    expect((await send(s, s.reader, [reading(s, 40)])).status).toBe(204);
    const course = s.course.id; const lessonId = s.lesson.lesson.id;
    expect(await rows(s.readerId)).toEqual([
      { activity: "drill", focus: null, courseId: course, lessonId: null, practiceId: null, seconds: 15 },
      { activity: "practice", focus: null, courseId: course, lessonId, practiceId: s.practiceId, seconds: 30 },
      { activity: "reading", focus: "grammar", courseId: course, lessonId, practiceId: null, seconds: 20 },
      { activity: "reading", focus: "lesson", courseId: course, lessonId, practiceId: null, seconds: 100 },
      { activity: "tutor", focus: null, courseId: null, lessonId: null, practiceId: null, seconds: 10 },
      { activity: "words", focus: null, courseId: null, lessonId: null, practiceId: null, seconds: 5 },
    ]);
    expect(await timeOf(s, s.reader)).toEqual({ readingSeconds: 120, practiceSeconds: 30, typical: { reading: null, practice: null } });
    expect(await timeOf(s, s.other)).toEqual({ readingSeconds: 0, practiceSeconds: 0, typical: { reading: null, practice: null } });
  });

  it("never records more time than has passed since the previous send", async () => {
    const s = await setup();
    // The first send may carry at most ten minutes; twenty entries of ten minutes are scaled down to that.
    const many = Array.from({ length: 20 }, () => ({ activity: "tutor" as const, seconds: 600 }));
    expect((await send(s, s.reader, many)).status).toBe(204);
    expect(await rows(s.readerId)).toEqual([expect.objectContaining({ activity: "tutor", seconds: 600 })]);
    // A send right after it has no time to spend.
    expect((await send(s, s.reader, [reading(s, 60)])).status).toBe(204);
    expect((await rows(s.readerId)).length).toBe(1);
    // Thirty seconds later, thirty seconds fit.
    await age(s.readerId, 30_000);
    expect((await send(s, s.reader, [reading(s, 60)])).status).toBe(204);
    expect(await rows(s.readerId)).toContainEqual(expect.objectContaining({ activity: "reading", seconds: 30 }));
  });

  it("refuses unreadable targets, other days, and shapes that do not fit the activity", async () => {
    const s = await setup();
    const draft = await addLesson(s.groupId, s.course.id, s.owner, "Draft", { published: false, document: documentOf(blocks.paragraph("Soon.")) });
    const hidden = await createCourse(s.groupId, s.owner, false);
    const other = await addLesson(s.groupId, s.course.id, s.owner, "Other", { document: documentOf(blocks.practice(practicePayload)) });
    const lessonId = s.lesson.lesson.id;
    const refusals: Array<[Record<string, unknown>, number, string]> = [
      [{ ...reading(s, 10), lessonId: draft.lesson.id }, 404, "LEARNING_TARGET_NOT_FOUND"],
      [{ activity: "drill", courseId: hidden.id, seconds: 10 }, 404, "LEARNING_TARGET_NOT_FOUND"],
      [{ ...reading(s, 10), courseId: hidden.id }, 404, "LEARNING_TARGET_NOT_FOUND"],
      [{ ...practising(s, 10), lessonId: other.lesson.id }, 404, "LEARNING_TARGET_NOT_FOUND"],
      [{ ...practising(s, 10), practiceId: s.headingId }, 404, "LEARNING_TARGET_NOT_FOUND"],
      [{ activity: "ai_practice", courseId: s.course.id, lessonId, practiceId: crypto.randomUUID(), seconds: 10 }, 404, "LEARNING_TARGET_NOT_FOUND"],
    ];
    for (const [entry, status, code] of refusals) {
      const response = await send(s, s.reader, [reading(s, 10), entry as LearningTimeEntry]);
      expect(response.status, JSON.stringify(entry)).toBe(status);
      expect(await errorCode(response)).toBe(code);
    }
    expect((await send(s, s.reader, [reading(s, 10)], "2001-01-01")).status).toBe(400);
    for (const body of [
      { day: today(), entries: [] },
      { day: today(), entries: [{ activity: "reading", courseId: s.course.id, lessonId, seconds: 10 }] },
      { day: today(), entries: [{ activity: "tutor", courseId: s.course.id, seconds: 10 }] },
      { day: today(), entries: [{ ...reading(s, 601) }] },
      { day: today(), entries: [{ ...reading(s, 0) }] },
      { day: "2026-02-30", entries: [reading(s, 10)] },
    ]) expect((await request(`/api/groups/${s.groupId}/learning-time`, s.reader, body)).status, JSON.stringify(body)).toBe(400);
    expect(await rows(s.readerId)).toEqual([]);
  });

  it("records an AI practice's time with the practice's focus", async () => {
    const s = await setup();
    const save = (focus?: "reading") => saveAiPractice(env.DB, {
      userId: s.readerId, conversationId: crypto.randomUUID(), focus,
      practice: { kind: "choice", payload: { question: "Wat is een huis?", options: ["house", "mouse", "horse"], correct: 0 } },
      lessons: [{ lessonId: s.lesson.lesson.id, courseId: s.course.id, afterBlockId: s.headingId }],
    });
    const named = await save("reading"); const defaulted = await save();
    if (!named.ok || !defaulted.ok) throw new Error("not saved");
    const ai = (practiceId: string, seconds: number): LearningTimeEntry => ({ activity: "ai_practice", courseId: s.course.id, lessonId: s.lesson.lesson.id, practiceId, seconds });
    expect((await send(s, s.reader, [ai(named.practiceId, 20), ai(defaulted.practiceId, 10)])).status).toBe(204);
    const focuses = (await rows(s.readerId)).map((row) => [row.practiceId, row.focus]);
    expect(focuses).toEqual(expect.arrayContaining([[named.practiceId, "reading"], [defaulted.practiceId, "vocabulary"]]));
    expect((await timeOf(s, s.reader)).practiceSeconds).toBe(30);
  });

  it("records only an owned lesson activity with its server-derived focus, outside required lesson times", async () => {
    const s = await setup();
    const activityId = crypto.randomUUID(); const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO lesson_activities (id, lesson_id, course_id, source_id, activity_type, source_fingerprint, recipe_version, schema_version, language, cache_key, status, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'roleplay', 'source', 1, 1, 'nl', ?, 'ready', '{}', ?, ?)`,
    ).bind(activityId, s.lesson.lesson.id, s.course.id, s.headingId, activityId, now, now).run();
    await env.DB.prepare(
      "INSERT INTO lesson_activity_runs (id, activity_id, user_id, cursor, cue_mode, status, started_at, updated_at) VALUES (?, ?, ?, 0, 'english', 'active', ?, ?)",
    ).bind(crypto.randomUUID(), activityId, s.readerId, now, now).run();
    const entry: LearningTimeEntry = { activity: "lesson_activity", courseId: s.course.id, lessonId: s.lesson.lesson.id, activityId, focus: "grammar", seconds: 30 };
    expect((await send(s, s.other, [entry])).status).toBe(404);
    expect((await send(s, s.reader, [{ ...entry, activityId: crypto.randomUUID() }])).status).toBe(404);
    expect((await send(s, s.reader, [entry])).status).toBe(204);
    expect(await rows(s.readerId)).toEqual([expect.objectContaining({ activity: "lesson_activity", focus: "speaking", practiceId: activityId, seconds: 30 })]);
    expect(await timeOf(s, s.reader)).toEqual({ readingSeconds: 0, practiceSeconds: 0, typical: { reading: null, practice: null } });
  });
});

describe("typical times", () => {
  it("takes the median of reading up to each learner's first completion, the viewer included", async () => {
    const s = await setup();
    for (const [cookie, userId, seconds] of [[s.reader, s.readerId, 120], [s.other, s.otherId, 300], [s.owner, s.ownerId, 600]] as const) {
      expect((await send(s, cookie, [reading(s, seconds)])).status).toBe(204);
      await age(userId);
      expect((await complete(s, cookie)).status).toBe(200);
    }
    expect((await timeOf(s, s.reader)).typical.reading).toEqual({ seconds: 300, learners: 3 });
    // Rereading a finished lesson adds to the learner's own time, not to the median; completing again keeps the first snapshot.
    expect((await send(s, s.reader, [reading(s, 500)])).status).toBe(204);
    expect((await complete(s, s.reader)).status).toBe(200);
    const time = await timeOf(s, s.reader);
    expect(time.readingSeconds).toBe(620);
    expect(time.typical.reading).toEqual({ seconds: 300, learners: 3 });
  });

  it("leaves out completions without recorded time", async () => {
    const s = await setup();
    expect((await complete(s, s.reader)).status).toBe(200);
    expect((await timeOf(s, s.reader)).typical.reading).toBeNull();
  });

  it("sums each practice's median practice time up to the save that finished it", async () => {
    const s = await setup();
    expect((await send(s, s.reader, [practising(s, 60)])).status).toBe(204);
    expect((await answer(s, s.reader, 1)).status).toBe(200);
    // Not finished yet: no snapshot.
    expect((await timeOf(s, s.reader)).typical.practice).toBeNull();
    await age(s.readerId);
    expect((await send(s, s.reader, [practising(s, 40)])).status).toBe(204);
    expect((await answer(s, s.reader, 2)).status).toBe(200);
    expect((await send(s, s.other, [practising(s, 300)])).status).toBe(204);
    expect((await answer(s, s.other, 2)).status).toBe(200);
    expect((await timeOf(s, s.owner)).typical.practice).toEqual({ seconds: 200, learners: 2 });
    // Time after finishing does not move the snapshot.
    await age(s.readerId);
    expect((await send(s, s.reader, [practising(s, 500)])).status).toBe(204);
    expect((await answer(s, s.reader, 2)).status).toBe(200);
    expect((await timeOf(s, s.owner)).typical.practice).toEqual({ seconds: 200, learners: 2 });
  });
});

describe("course read", () => {
  it("gives each outline lesson its typical reading plus practice time, and each practice's median", async () => {
    const s = await setup();
    expect((await send(s, s.reader, [reading(s, 120), practising(s, 60)])).status).toBe(204);
    expect((await complete(s, s.reader)).status).toBe(200);
    expect((await answer(s, s.reader, 2)).status).toBe(200);
    const response = await request(coursePath(s.groupId, s.course.id), s.other);
    expect(response.status, await response.clone().text()).toBe(200);
    const body = (await response.json()) as { outline: Array<{ id: string; typicalSeconds?: number | null; typicalPractices?: Record<string, number> }> };
    const [lesson] = body.outline;
    expect(lesson?.id).toBe(s.lesson.lesson.id);
    expect(lesson?.typicalSeconds).toBe(180);
    expect(lesson?.typicalPractices).toEqual({ [s.practiceId]: 60 });
  });

  it("has no typical times for a lesson nobody has finished", async () => {
    const s = await setup();
    const response = await request(coursePath(s.groupId, s.course.id), s.reader);
    const body = (await response.json()) as { outline: Array<{ typicalSeconds?: number | null; typicalPractices?: Record<string, number> }> };
    expect(body.outline[0]?.typicalSeconds ?? null).toBeNull();
    expect(body.outline[0]?.typicalPractices ?? {}).toEqual({});
  });
});

describe("reset and deletion", () => {
  it("reset deletes the viewer's time in the lesson and its snapshots, and keeps other time", async () => {
    const s = await setup();
    expect((await send(s, s.reader, [reading(s, 100), practising(s, 50), { activity: "tutor", seconds: 10 }])).status).toBe(204);
    expect((await answer(s, s.reader, 2)).status).toBe(200);
    expect((await complete(s, s.reader)).status).toBe(200);
    expect((await send(s, s.other, [reading(s, 200)])).status).toBe(204);
    expect((await request(`${s.lesson.path}/reset`, s.reader, {})).status).toBe(200);
    expect(await rows(s.readerId)).toEqual([expect.objectContaining({ activity: "tutor" })]);
    expect(await timeOf(s, s.reader)).toEqual({ readingSeconds: 0, practiceSeconds: 0, typical: { reading: null, practice: null } });
    expect((await timeOf(s, s.other)).readingSeconds).toBe(200);
  });

  it("lesson deletion deletes every account's time in the lesson", async () => {
    const s = await setup();
    expect((await send(s, s.reader, [reading(s, 100), { activity: "drill", courseId: s.course.id, seconds: 10 }])).status).toBe(204);
    expect((await send(s, s.other, [practising(s, 100)])).status).toBe(204);
    expect((await request(s.lesson.path, s.owner, undefined, "DELETE")).status).toBe(200);
    expect(await rows(s.readerId)).toEqual([expect.objectContaining({ activity: "drill" })]);
    expect(await rows(s.otherId)).toEqual([]);
  });
});
