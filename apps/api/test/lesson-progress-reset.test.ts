import { env } from "cloudflare:test";
import { courseProgressResponseSchema, lessonProgressResponseSchema } from "@wordinator/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, request, resetDatabase, seedGroup, seedUser, signIn, word,
} from "./courseApi";
import { fetchWorker } from "./worker";

// Lesson progress read, completion audit, and lesson reset (C14c; docs/courses.md#lesson-progress-tab, #reset).
const lessonProgress = async (path: string, cookie: string) => {
  const response = await request(`${path}/progress/lessons`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return lessonProgressResponseSchema.parse(await response.json());
};
const complete = (path: string, lessonId: string, cookie: string) => request(`${path}/lessons/${lessonId}/completion`, cookie, undefined, "PUT");
const reset = (path: string, lessonId: string, cookie: string) => request(`${path}/lessons/${lessonId}/reset`, cookie, {});
const place = (path: string, lessonId: string, stepKey: string, cookie: string) => request(`${path}/lessons/${lessonId}/position`, cookie, { stepKey }, "PUT");
async function grade(path: string, lessonId: string, wordId: string, cookie: string, result: "got" | "again" = "got", direction = "understand") {
  const response = await request(`${path}/lessons/${lessonId}/words/${wordId}/drill/${direction}`, cookie, { result }, "PUT");
  expect(response.status, await response.clone().text()).toBe(200);
}
async function saveProgress(path: string, lessonId: string, blockId: string, answered: number, cookie: string) {
  const response = await request(`${path}/lessons/${lessonId}/blocks/${blockId}/progress`, cookie, { answered }, "PUT");
  expect(response.status, await response.clone().text()).toBe(200);
}
async function seedAttempt(userId: string, courseId: string, lessonId: string, practiceId: string, source: "lesson" | "ai_chat") {
  await env.DB.prepare(
    `INSERT INTO practice_attempts (id, user_id, course_id, lesson_id, practice_kind, practice_id, item_index, prompt, answer, reference, matched, source, created_at)
     VALUES (?, ?, ?, ?, 'lesson', ?, 0, 'Prompt', 'Answer', 'Reference', 1, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, courseId, lessonId, practiceId, source, Date.now()).run();
}
async function seedPronunciation(userId: string, lessonId: string | null, wordId: string | null, termKey = "de hond") {
  await env.DB.prepare(
    `INSERT INTO pronunciation_attempts (id, user_id, surface, reference_text, term_key, lesson_id, word_id, overall, accuracy, fluency, completeness, word_scores, created_at)
     VALUES (?, ?, 'drill', ?, ?, ?, ?, 80, 80, 80, 80, '[]', ?)`,
  ).bind(crypto.randomUUID(), userId, termKey, termKey, lessonId, wordId, Date.now()).run();
}
// A ready shared activity (no lease, payload set) and the learner's private runs and answers, shaped to the table CHECKs.
async function seedActivity(courseId: string, lessonId: string, sourceId: string) {
  const id = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO lesson_activities (id, lesson_id, course_id, source_id, activity_type, source_fingerprint, recipe_version, schema_version, language, cache_key, status, lease_token, lease_expires_at, next_attempt_at, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'story_summary', 'fingerprint', 1, 1, 'nl', ?, 'ready', NULL, NULL, NULL, ?, ?, ?)`,
  ).bind(id, lessonId, courseId, sourceId, `cache-${id}`, JSON.stringify({ items: [{ id: "item-1" }] }), now, now).run();
  return id;
}
async function seedRun(activityId: string, userId: string) {
  const id = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO lesson_activity_runs (id, activity_id, user_id, cursor, cue_mode, status, started_at, updated_at, completed_at)
     VALUES (?, ?, ?, 0, 'english', 'active', ?, ?, NULL)`,
  ).bind(id, activityId, userId, now, now).run();
  return id;
}
async function seedActivityAnswer(runId: string) {
  await env.DB.prepare(
    `INSERT INTO lesson_activity_answers (id, run_id, item_id, idempotency_key, answer, input_mode, correct, matched, reference, pronunciation_json, created_at)
     VALUES (?, ?, 'item-1', ?, 'Hond', 'typed', 1, 1, 'Hond', NULL, ?)`,
  ).bind(crypto.randomUUID(), runId, crypto.randomUUID(), Date.now()).run();
}
const countWhere = async (table: string, where: string, ...values: unknown[]) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`).bind(...values).first<{ total: number }>())!.total;
const memoryOf = (userId: string) => env.DB.prepare(
  "SELECT term_key AS termKey, direction, lesson_id AS lessonId, recent, reps FROM word_memory WHERE user_id = ? ORDER BY term_key, direction",
).bind(userId).all<{ termKey: string; direction: string; lessonId: string; recent: string; reps: number }>().then((rows) => rows.results);
const eventsOf = (userId: string) => env.DB.prepare(
  "SELECT actor, kind, lesson_id AS lessonId FROM progress_events WHERE user_id = ? ORDER BY created_at, id",
).bind(userId).all<{ actor: string; kind: string; lessonId: string }>().then((rows) => rows.results);

const practicePayload = { instruction: "Translate.", items: [{ prompt: "The dog.", authorsVersion: ["De hond."] }, { prompt: "The cat.", authorsVersion: ["De kat."] }] };

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader"); const otherId = await seedUser("other");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId); await join(groupId, otherId);
  const owner = await signIn("owner"); const reader = await signIn("reader"); const other = await signIn("other");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  const hond = word("de hond"); const kat = word("de kat"); const hondAgain = word("De hond");
  const practice = blocks.practice(practicePayload);
  const steps = [blocks.example("De hond slaapt."), blocks.example("De kat eet.")];
  const first = (await addLesson(groupId, course.id, owner, "Animals", { document: documentOf(...steps, blocks.vocabulary(hond, kat), practice) })).lesson;
  const secondSteps = [blocks.example("Mijn hond."), blocks.example("Jouw hond.")];
  const second = (await addLesson(groupId, course.id, owner, "Pets", { document: documentOf(...secondSteps, blocks.vocabulary(hondAgain)) })).lesson;
  const thirdSteps = [blocks.example("Een."), blocks.example("Twee."), blocks.example("Drie."), blocks.example("Vier.")];
  const third = (await addLesson(groupId, course.id, owner, "Counting", { document: documentOf(...thirdSteps) })).lesson;
  const draft = (await addLesson(groupId, course.id, owner, "Later", { published: false, document: documentOf(blocks.example("Straks.")) })).lesson;
  return { ownerId, readerId, otherId, groupId, owner, reader, other, course, path, hond, kat, hondAgain, practice, firstSteps: steps, first, second, third, thirdSteps, draft };
}

beforeEach(resetDatabase);

describe("Lesson progress read", () => {
  it("derives states, storyline, practices, words, and course completion for the viewer only", async () => {
    const s = await setup();
    const initial = await lessonProgress(s.path, s.reader);
    // Unpublished lessons are left out, also for editors.
    expect(initial.lessons.map((lesson) => lesson.lessonId)).toEqual([s.first.id, s.second.id, s.third.id]);
    expect((await lessonProgress(s.path, s.owner)).lessons.map((lesson) => lesson.lessonId)).toEqual([s.first.id, s.second.id, s.third.id]);
    expect(initial).toMatchObject({ complete: false, publishedLessons: 3, completedLessons: 0, missedLessons: 0 });
    expect(initial.lessons[0]).toEqual({
      lessonId: s.first.id, slug: s.first.slug, title: "Animals", state: "not_started", storylinePercent: 0,
      practicesDone: 0, practicesTotal: 1, wordsReviewed: 0, wordsTotal: 2, aiPracticeCount: 0, practiceIds: [s.practice.id],
    });

    // Finishing the second lesson leaves the first missed; a review of "de hond" in the first lesson counts in the second too.
    expect((await complete(s.path, s.second.id, s.reader)).status).toBe(200);
    await grade(s.path, s.first.id, s.hond.id, s.reader);
    // Three of four reading steps in a lesson without practices is 75% of it.
    expect((await place(s.path, s.third.id, s.thirdSteps[2]!.id, s.reader)).status).toBe(200);
    const progressed = await lessonProgress(s.path, s.reader);
    expect(progressed).toMatchObject({ complete: false, completedLessons: 1, missedLessons: 1 });
    expect(progressed.lessons.map(({ state, storylinePercent }) => [state, storylinePercent])).toEqual([["missed", 0], ["completed", 100], ["in_progress", 75]]);
    expect(progressed.lessons[0]).toMatchObject({ practicesDone: 0, practicesTotal: 1, wordsReviewed: 1, wordsTotal: 2 });
    expect(progressed.lessons[1]).toMatchObject({ wordsReviewed: 1, wordsTotal: 1 });
    // Another account sees none of it.
    const others = await lessonProgress(s.path, s.other);
    expect(others.lessons.map((lesson) => lesson.state)).toEqual(["not_started", "not_started", "not_started"]);
    expect(others.lessons[0]).toMatchObject({ practicesDone: 0, wordsReviewed: 0 });

    // Completing the last lesson completes the course with the missed lesson counted separately.
    expect((await complete(s.path, s.third.id, s.reader)).status).toBe(200);
    expect(await lessonProgress(s.path, s.reader)).toMatchObject({ complete: true, completedLessons: 2, missedLessons: 1 });
    // A practice done in the missed lesson starts it: half of it is its one practice, and the course is no longer complete.
    await saveProgress(s.path, s.first.id, s.practice.id, 2, s.reader);
    const practised = await lessonProgress(s.path, s.reader);
    expect(practised).toMatchObject({ complete: false, missedLessons: 0 });
    expect(practised.lessons[0]).toMatchObject({ state: "in_progress", storylinePercent: 50, practicesDone: 1, practicesTotal: 1 });
  });

  it("refuses anonymous requests, outsiders, and hidden courses", async () => {
    const s = await setup();
    expect((await fetchWorker(`https://wordinator.test${s.path}/progress/lessons`)).status).toBe(401);
    const outsiderId = await seedUser("outsider"); await seedGroup("beta", outsiderId);
    expect((await request(`${s.path}/progress/lessons`, await signIn("outsider"))).status).toBe(404);
    await request(`${s.path}/archive`, s.owner, {});
    expect((await request(`${s.path}/progress/lessons`, s.reader)).status).toBe(404);
  });
});

describe("Lesson completion audit", () => {
  it("writes one lesson_completed event per new completion", async () => {
    const s = await setup();
    expect((await complete(s.path, s.first.id, s.reader)).status).toBe(200);
    expect((await complete(s.path, s.first.id, s.reader)).status).toBe(200);
    expect(await eventsOf(s.readerId)).toEqual([{ actor: "user", kind: "lesson_completed", lessonId: s.first.id }]);
  });
});

describe("Lesson reset", () => {
  it("deletes the viewer's lesson data and everything recorded for its terms, and keeps everything else", async () => {
    const s = await setup();
    const { readerId, otherId, course, first, second } = s;
    // The reader learns "de hond" in both lessons and "de kat" in the first only, practises, and finishes the first lesson.
    await grade(s.path, first.id, s.hond.id, s.reader, "again");
    await grade(s.path, second.id, s.hondAgain.id, s.reader, "got");
    await grade(s.path, first.id, s.kat.id, s.reader, "got", "produce");
    await saveProgress(s.path, first.id, s.practice.id, 2, s.reader);
    await seedAttempt(readerId, course.id, first.id, s.practice.id, "lesson");
    await seedAttempt(readerId, course.id, first.id, s.practice.id, "ai_chat");
    await seedAttempt(readerId, course.id, second.id, "other-practice", "lesson");
    await seedPronunciation(readerId, first.id, s.hond.id);
    await seedPronunciation(readerId, second.id, s.hondAgain.id);
    await seedPronunciation(readerId, null, null, "de kat");
    await seedPronunciation(readerId, null, null, "de vis");
    expect((await request(`${s.path}/lessons/${first.id}/words/${s.hond.id}/bookmark`, s.reader, undefined, "PUT")).status).toBe(200);
    expect((await request(`${s.path}/lessons/${second.id}/words/${s.hondAgain.id}/bookmark`, s.reader, undefined, "PUT")).status).toBe(200);
    expect((await complete(s.path, first.id, s.reader)).status).toBe(200);
    expect((await place(s.path, first.id, s.firstSteps[1]!.id, s.reader)).status).toBe(200);
    // Another account has its own data in the same lesson.
    await grade(s.path, first.id, s.hond.id, s.other);
    await saveProgress(s.path, first.id, s.practice.id, 1, s.other);
    await seedAttempt(otherId, course.id, first.id, s.practice.id, "lesson");
    await seedPronunciation(otherId, first.id, s.hond.id);
    expect((await request(`${s.path}/lessons/${first.id}/words/${s.hond.id}/bookmark`, s.other, undefined, "PUT")).status).toBe(200);
    expect((await complete(s.path, first.id, s.other)).status).toBe(200);
    const otherMemory = await memoryOf(otherId);

    const response = await reset(s.path, first.id, s.reader);
    expect(response.status, await response.clone().text()).toBe(200);
    const progress = courseProgressResponseSchema.parse(await response.json());
    expect(progress.completedLessonIds).toEqual([]);
    expect(progress.positions).toEqual([]);
    expect(progress.practices[first.id]).toBeUndefined();

    expect(await countWhere("course_lesson_completions", "lesson_id = ? AND user_id = ?", first.id, readerId)).toBe(0);
    expect(await countWhere("course_lesson_positions", "lesson_id = ? AND user_id = ?", first.id, readerId)).toBe(0);
    expect(await countWhere("course_practice_progress", "lesson_id = ? AND user_id = ?", first.id, readerId)).toBe(0);
    expect(await countWhere("practice_attempts", "user_id = ? AND lesson_id = ?", readerId, first.id)).toBe(0);
    expect(await countWhere("practice_attempts", "user_id = ? AND lesson_id = ?", readerId, second.id)).toBe(1);
    // Reviews and memory of the lesson's terms go, also the second lesson's review of the shared "de hond".
    expect(await countWhere("word_reviews", "user_id = ?", readerId)).toBe(0);
    expect(await memoryOf(readerId)).toEqual([]);
    // Pronunciation attempts recorded from the lesson or for its terms go; one for an unrelated term stays.
    expect(await env.DB.prepare("SELECT term_key AS termKey FROM pronunciation_attempts WHERE user_id = ?").bind(readerId).all().then((rows) => rows.results))
      .toEqual([{ termKey: "de vis" }]);
    // The lesson's bookmarks go; another lesson's bookmark stays.
    expect(await countWhere("course_word_bookmarks", "user_id = ? AND lesson_id = ?", readerId, first.id)).toBe(0);
    expect(await countWhere("course_word_bookmarks", "user_id = ? AND lesson_id = ?", readerId, second.id)).toBe(1);
    // Another account's rows in the lesson are untouched.
    expect(await countWhere("course_lesson_completions", "lesson_id = ? AND user_id = ?", first.id, otherId)).toBe(1);
    expect(await countWhere("course_practice_progress", "lesson_id = ? AND user_id = ?", first.id, otherId)).toBe(1);
    expect(await countWhere("practice_attempts", "user_id = ? AND lesson_id = ?", otherId, first.id)).toBe(1);
    expect(await countWhere("word_reviews", "user_id = ? AND lesson_id = ?", otherId, first.id)).toBe(1);
    expect(await countWhere("pronunciation_attempts", "user_id = ?", otherId)).toBe(1);
    expect(await countWhere("course_word_bookmarks", "user_id = ?", otherId)).toBe(1);
    expect(await memoryOf(otherId)).toEqual(otherMemory);
    // The audit keeps the completion and adds the reset.
    expect(await eventsOf(readerId)).toEqual([
      { actor: "user", kind: "lesson_completed", lessonId: first.id }, { actor: "user", kind: "lesson_reset", lessonId: first.id },
    ]);
    expect((await lessonProgress(s.path, s.reader)).lessons[0]).toMatchObject({ state: "not_started", practicesDone: 0, wordsReviewed: 0, wordsTotal: 2 });
  });

  it("deletes the viewer's lesson activity runs and answers for the lesson and keeps the shared activity", async () => {
    const s = await setup();
    const { readerId, otherId, course, first, second } = s;
    const firstActivity = await seedActivity(course.id, first.id, "first-story");
    const secondActivity = await seedActivity(course.id, second.id, "second-story");
    const readerRun = await seedRun(firstActivity, readerId);
    await seedActivityAnswer(readerRun);
    await seedActivityAnswer(readerRun);
    const readerOtherLessonRun = await seedRun(secondActivity, readerId);
    await seedActivityAnswer(readerOtherLessonRun);
    const otherRun = await seedRun(firstActivity, otherId);
    await seedActivityAnswer(otherRun);

    expect((await reset(s.path, first.id, s.reader)).status).toBe(200);

    // The reader's runs and answers for the lesson's activity go.
    expect(await countWhere("lesson_activity_runs", "id = ?", readerRun)).toBe(0);
    expect(await countWhere("lesson_activity_answers", "run_id = ?", readerRun)).toBe(0);
    // Another lesson's run of the same learner, and another learner's run in the same lesson, stay with their answers.
    expect(await countWhere("lesson_activity_runs", "id = ?", readerOtherLessonRun)).toBe(1);
    expect(await countWhere("lesson_activity_answers", "run_id = ?", readerOtherLessonRun)).toBe(1);
    expect(await countWhere("lesson_activity_runs", "id = ?", otherRun)).toBe(1);
    expect(await countWhere("lesson_activity_answers", "run_id = ?", otherRun)).toBe(1);
    // The shared activities stay ready with their payloads.
    expect(await countWhere("lesson_activities", "id IN (?, ?) AND status = 'ready' AND payload IS NOT NULL", firstActivity, secondActivity)).toBe(2);
  });

  it("refuses archived courses, unreadable lessons, other accounts, and anonymous requests", async () => {
    const s = await setup();
    expect((await complete(s.path, s.first.id, s.reader)).status).toBe(200);
    // An unpublished lesson is unreadable for a reader, and a missing one is the same.
    const hidden = await reset(s.path, s.draft.id, s.reader);
    expect(hidden.status).toBe(404); expect(await errorCode(hidden)).toBe("LESSON_NOT_FOUND");
    expect((await reset(s.path, crypto.randomUUID(), s.reader)).status).toBe(404);
    // Anonymous requests and accounts outside the course's group never reach it.
    expect((await fetchWorker(`https://wordinator.test${s.path}/lessons/${s.first.id}/reset`, { method: "POST" })).status).toBe(401);
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId); const outsider = await signIn("outsider");
    expect((await reset(s.path, s.first.id, outsider)).status).toBe(404);
    expect((await reset(coursePath(otherGroup, s.course.id), s.first.id, outsider)).status).toBe(404);
    // Another member's reset touches only their own rows.
    expect((await reset(s.path, s.first.id, s.other)).status).toBe(200);
    expect(await countWhere("course_lesson_completions", "lesson_id = ? AND user_id = ?", s.first.id, s.readerId)).toBe(1);
    // Archived courses refuse reset, also for the owner who still sees them.
    await request(`${s.path}/archive`, s.owner, {});
    const archived = await reset(s.path, s.first.id, s.owner);
    expect(archived.status).toBe(409); expect(await errorCode(archived)).toBe("COURSE_ARCHIVED");
    expect(await eventsOf(s.ownerId)).toEqual([]);
    expect(await eventsOf(s.readerId)).toEqual([{ actor: "user", kind: "lesson_completed", lessonId: s.first.id }]);
  });
});
