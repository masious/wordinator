import { env } from "cloudflare:test";
import { lessonMetricsResponseSchema, type LessonMetricsResponse } from "@wordinator/contracts/learning";
import { beforeEach, describe, expect, it } from "vitest";
import { addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, request, resetDatabase, seedGroup, seedUser, signIn, word } from "./courseApi";
import { fetchWorker } from "./worker";

// Lesson metrics (Lumen Batch 6, docs/courses.md#lesson-box): the viewer's own pronunciation, word memory, and recency figures
// for one lesson.
const scores = (fluency: number) => ({
  referenceText: "de hond", overall: 80, accuracy: 90, fluency, completeness: 100, words: [{ word: "hond", accuracy: 90, error: "none" }],
});

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const hond = word("de hond"); const kat = word("de kat");
  const lesson = await addLesson(groupId, course.id, owner, "Animals", { document: documentOf(blocks.vocabulary(hond, kat)) });
  return { ownerId, readerId, groupId, owner, reader, course, hond, kat, lesson };
}
const speak = (groupId: string, cookie: string, body: Record<string, unknown>) => request(`/api/groups/${groupId}/pronunciation-attempts`, cookie, body);
async function metrics(path: string, cookie: string): Promise<LessonMetricsResponse> {
  const response = await request(`${path}/metrics`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return lessonMetricsResponseSchema.parse(await response.json());
}

const none = { attempts: 0, fluency: null };
const untouched = (total: number) => ({ total, practised: 0, strong: 0 });
const DAY = 86_400_000;
const noTime = { readingSeconds: 0, practiceSeconds: 0, typical: { reading: null, practice: null } };
// A memory row as folding would leave it; only stability, the last review, and the known mark matter to the metrics.
const remember = (userId: string, lessonId: string, courseId: string, termKey: string, direction: "understand" | "produce", stability: number, lastReviewedAt: number, known = 0) =>
  env.DB.prepare(`INSERT INTO word_memory (user_id, term_key, direction, course_id, lesson_id, word_id, recent, reps, lapses, stability, difficulty, last_reviewed_at, known_override)
    VALUES (?, ?, ?, ?, ?, 'w', 'g', 1, 0, ?, 5, ?, ?)`).bind(userId, termKey, direction, courseId, lessonId, stability, lastReviewedAt, known).run();

beforeEach(resetDatabase);

describe("Lesson metrics", () => {
  it("is empty before any spoken attempt", async () => {
    const { reader, lesson } = await setup();
    expect(await metrics(lesson.path, reader)).toEqual({ pronunciation: none, words: untouched(2), lastStudiedAt: null, time: noTime });
  });

  it("averages the viewer's fluency on the lesson's words, by lesson word or term", async () => {
    const { groupId, owner, reader, course, hond, kat, lesson } = await setup();
    expect((await speak(groupId, reader, { ...scores(70), surface: "word_card", lessonId: lesson.lesson.id, wordId: hond.id })).status).toBe(204);
    expect((await speak(groupId, reader, { ...scores(81), surface: "word_card", lessonId: lesson.lesson.id, wordId: kat.id })).status).toBe(204);
    // The tutor's Say it records only the term; it still counts for the lesson that teaches it.
    expect((await speak(groupId, reader, { ...scores(90), surface: "ai_chat", termKey: "de hond" })).status).toBe(204);
    // Other terms and attempts without a term do not.
    expect((await speak(groupId, reader, { ...scores(10), surface: "ai_chat", termKey: "de fiets" })).status).toBe(204);
    expect((await speak(groupId, reader, { ...scores(10), surface: "drill" })).status).toBe(204);
    expect((await metrics(lesson.path, reader)).pronunciation).toEqual({ attempts: 3, fluency: 80 });
    // A lesson without those words has none.
    const other = await addLesson(groupId, course.id, owner, "Travel", { document: documentOf(blocks.vocabulary(word("de trein"))) });
    expect(await metrics(other.path, reader)).toEqual({ pronunciation: none, words: untouched(1), lastStudiedAt: null, time: noTime });
  });

  it("never shows another account's attempts", async () => {
    const { groupId, owner, reader, hond, lesson } = await setup();
    expect((await speak(groupId, owner, { ...scores(40), surface: "word_card", lessonId: lesson.lesson.id, wordId: hond.id })).status).toBe(204);
    expect(await metrics(lesson.path, reader)).toEqual({ pronunciation: none, words: untouched(2), lastStudiedAt: null, time: noTime });
    expect((await metrics(lesson.path, owner)).pronunciation).toEqual({ attempts: 1, fluency: 40 });
  });

  it("counts the lesson's words with memory and those remembered well now, never another account's", async () => {
    const { ownerId, readerId, owner, reader, course, lesson } = await setup();
    const now = Date.now();
    // de hond: reviewed both ways, long stable and fresh, so remembered well.
    await remember(readerId, lesson.lesson.id, course.id, "de hond", "understand", 30, now - DAY);
    await remember(readerId, lesson.lesson.id, course.id, "de hond", "produce", 30, now - DAY);
    // de kat: strong one way, faded the other, so practised but not strong.
    await remember(readerId, lesson.lesson.id, course.id, "de kat", "understand", 30, now - DAY);
    await remember(readerId, lesson.lesson.id, course.id, "de kat", "produce", 0.5, now - 20 * DAY);
    await remember(ownerId, lesson.lesson.id, course.id, "de kat", "understand", 30, now);
    expect((await metrics(lesson.path, reader)).words).toEqual({ total: 2, practised: 2, strong: 1 });
    expect((await metrics(lesson.path, owner)).words).toEqual({ total: 2, practised: 1, strong: 1 });
    // Marking the faded word known counts it as remembered well.
    await env.DB.prepare("UPDATE word_memory SET known_override = 1 WHERE user_id = ? AND term_key = 'de kat'").bind(readerId).run();
    expect((await metrics(lesson.path, reader)).words).toEqual({ total: 2, practised: 2, strong: 2 });
  });

  it("reports the viewer's latest activity on the lesson as the last study time", async () => {
    const { groupId, ownerId, readerId, owner, reader, course, hond, lesson } = await setup();
    const position = (userId: string, at: number) => env.DB.prepare(`INSERT INTO course_lesson_positions (group_id, course_id, lesson_id, user_id, step_key, step_index, passed_steps, total_steps, updated_at)
      VALUES (?, ?, ?, ?, 's', 0, 0, 1, ?) ON CONFLICT (lesson_id, user_id) DO UPDATE SET updated_at = excluded.updated_at`).bind(groupId, course.id, lesson.lesson.id, userId, at).run();
    await position(readerId, 1_000);
    expect((await metrics(lesson.path, reader)).lastStudiedAt).toBe(1_000);
    await env.DB.prepare(`INSERT INTO word_reviews (id, user_id, term_key, course_id, lesson_id, word_id, direction, result, source, created_at)
      VALUES ('r1', ?, 'de hond', ?, ?, ?, 'understand', 'got', 'drill', 5_000)`).bind(readerId, course.id, lesson.lesson.id, hond.id).run();
    expect((await metrics(lesson.path, reader)).lastStudiedAt).toBe(5_000);
    // A spoken attempt is stamped now, so it is the latest.
    const before = Date.now();
    expect((await speak(groupId, reader, { ...scores(70), surface: "word_card", lessonId: lesson.lesson.id, wordId: hond.id })).status).toBe(204);
    expect((await metrics(lesson.path, reader)).lastStudiedAt).toBeGreaterThanOrEqual(before);
    // Another account's activity never shows.
    await position(ownerId, Date.now() + DAY);
    expect((await metrics(lesson.path, owner)).lastStudiedAt).toBeGreaterThan(Date.now());
    expect((await metrics(lesson.path, reader)).lastStudiedAt).toBeLessThan(Date.now() + 1_000);
  });

  it("refuses anonymous requests, unfinished setup, and lessons the viewer cannot read", async () => {
    const { groupId, owner, reader, course, lesson } = await setup();
    expect((await fetchWorker(`https://wordinator.test${lesson.path}/metrics`)).status).toBe(401);
    const newcomerId = await seedUser("newcomer"); await join(groupId, newcomerId);
    await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await request(`${lesson.path}/metrics`, await signIn("newcomer"));
    expect(newcomer.status).toBe(403);
    expect(await errorCode(newcomer)).toBe("ONBOARDING_REQUIRED");
    // An unpublished lesson is the owner's to read; an invisible course is missing for everyone else.
    const draft = await addLesson(groupId, course.id, owner, "Draft", { published: false, document: documentOf(blocks.vocabulary(word("het concept"))) });
    const unpublished = await request(`${draft.path}/metrics`, reader);
    expect(unpublished.status).toBe(404);
    expect(await errorCode(unpublished)).toBe("LESSON_NOT_FOUND");
    // The word index holds published words only, so a draft counts none.
    expect(await metrics(draft.path, owner)).toEqual({ pronunciation: none, words: untouched(0), lastStudiedAt: null, time: noTime });
    const hidden = await createCourse(groupId, owner, false, { title: "Hidden", summary: "Not yet." });
    const secret = await addLesson(groupId, hidden.id, owner, "Secret", { document: documentOf(blocks.vocabulary(word("het geheim"))) });
    const invisible = await request(`${secret.path}/metrics`, reader);
    expect(invisible.status).toBe(404);
    expect(await errorCode(invisible)).toBe("COURSE_NOT_FOUND");
    const missing = await request(`${coursePath(groupId, course.id)}/lessons/${crypto.randomUUID()}/metrics`, reader);
    expect(await errorCode(missing)).toBe("LESSON_NOT_FOUND");
    // Another library's member cannot reach the lesson.
    const outsiderId = await seedUser("outsider"); await seedGroup("beta", outsiderId);
    const outsider = await request(`${lesson.path}/metrics`, await signIn("outsider"));
    expect(outsider.status).toBe(404);
  });
});
