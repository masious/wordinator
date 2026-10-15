import { env, SELF } from "cloudflare:test";
import { WORD_DRILL_SESSION_SIZE, wordDrillDeckSchema, wordDrillGradeResponseSchema, type WordDrillDeck, type WordDrillResult } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import { rebuildWordMemory, type FoldableWordReview } from "../src/wordMemory";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser,
  signIn, word,
} from "./courseApi";

// Drill API (C12d, C14a; docs/words.md#drill): the deck read ranked by word memory and the first-grade write, over real rows.
const DAY = 86_400_000;
const drillPath = (path: string, lessonId: string, wordId: string, direction: string) => `${path}/lessons/${lessonId}/words/${wordId}/drill/${direction}`;
const grade = (path: string, lessonId: string, wordId: string, direction: string, result: unknown, cookie: string) =>
  request(drillPath(path, lessonId, wordId, direction), cookie, { result }, "PUT");
const bookmark = (path: string, lessonId: string, wordId: string, cookie: string) => request(`${path}/lessons/${lessonId}/words/${wordId}/bookmark`, cookie, undefined, "PUT");
async function deck(groupId: string, cookie: string, query: string): Promise<WordDrillDeck> {
  const response = await request(`/api/groups/${groupId}/word-drill?${query}`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return wordDrillDeckSchema.parse(await response.json());
}
async function recent(path: string, lessonId: string, wordId: string, direction: string, result: WordDrillResult, cookie: string) {
  const response = await grade(path, lessonId, wordId, direction, result, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return wordDrillGradeResponseSchema.parse(await response.json()).recent;
}
const reviewsOf = (userId: string) => env.DB.prepare(
  "SELECT term_key AS termKey, lesson_id AS lessonId, word_id AS wordId, direction, result, source FROM word_reviews WHERE user_id = ? ORDER BY created_at, id",
).bind(userId).all<{ termKey: string; lessonId: string; wordId: string; direction: string; result: string; source: string }>().then((rows) => rows.results);
const memoryOf = (userId: string) => env.DB.prepare(
  "SELECT term_key AS termKey, direction, lesson_id AS lessonId, word_id AS wordId, recent, reps FROM word_memory WHERE user_id = ? ORDER BY term_key, direction",
).bind(userId).all<{ termKey: string; direction: string; lessonId: string; wordId: string; recent: string; reps: number }>().then((rows) => rows.results);
// A memory row written directly: `stability` days, last reviewed `daysAgo` days ago, so recall is set by the test.
async function seedMemory(userId: string, courseId: string, lessonId: string, wordId: string, termKey: string, direction: string, stability: number, daysAgo: number, known = false) {
  await env.DB.prepare(
    `INSERT INTO word_memory (user_id, term_key, direction, course_id, lesson_id, word_id, recent, reps, lapses, last_lapse_at, stability, difficulty, last_reviewed_at, known_override)
     VALUES (?, ?, ?, ?, ?, ?, 'g', 1, 0, NULL, ?, 5, ?, ?)`,
  ).bind(userId, termKey, direction, courseId, lessonId, wordId, stability, Date.now() - daysAgo * DAY, known ? 1 : 0).run();
}

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  const hond = word("de hond", { forms: "honden", example: "De hond slaapt." }); const kat = word("de kat");
  const lesson = await addLesson(groupId, course.id, owner, "Animals", { document: documentOf(blocks.vocabulary(hond, kat)) });
  return { ownerId, readerId, groupId, owner, reader, course, path, hond, kat, lesson };
}

beforeEach(resetDatabase);

describe("Word drill access", () => {
  it("refuses anonymous requests and accounts that have not finished onboarding", async () => {
    const { groupId, path, lesson, hond } = await setup();
    expect((await SELF.fetch(`https://wordinator.test/api/groups/${groupId}/word-drill?source=weak`)).status).toBe(401);
    const anonymous = await SELF.fetch(`https://wordinator.test${drillPath(path, lesson.lesson.id, hond.id, "understand")}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ result: "got" }),
    });
    expect(anonymous.status).toBe(401);
    const newcomerId = await seedUser("newcomer"); await join(groupId, newcomerId);
    await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await signIn("newcomer");
    for (const response of [
      await request(`/api/groups/${groupId}/word-drill?source=weak`, newcomer), await grade(path, lesson.lesson.id, hond.id, "understand", "got", newcomer),
    ]) {
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("ONBOARDING_REQUIRED");
    }
    expect(await reviewsOf(newcomerId)).toEqual([]);
  });

  it("refuses invalid settings and grades with 400 INVALID_DRILL", async () => {
    const { groupId, reader, readerId, path, lesson, hond } = await setup();
    for (const query of [
      "", "source=all", "source=lesson", `source=weak&lessonId=${lesson.lesson.id}`, "source=lesson&lessonId=not-an-id", "source=weak&direction=sideways",
    ]) {
      const response = await request(`/api/groups/${groupId}/word-drill?${query}`, reader);
      expect(response.status, query).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_DRILL");
    }
    for (const response of [
      await grade(path, lesson.lesson.id, hond.id, "sideways", "got", reader), await grade(path, lesson.lesson.id, hond.id, "mixed", "got", reader),
      await grade(path, lesson.lesson.id, hond.id, "understand", "maybe", reader), await request(drillPath(path, lesson.lesson.id, hond.id, "produce"), reader, {}, "PUT"),
      await SELF.fetch(`https://wordinator.test${drillPath(path, lesson.lesson.id, hond.id, "produce")}`, { method: "PUT", headers: { cookie: reader }, body: "not json" }),
    ]) {
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_DRILL");
    }
    expect(await reviewsOf(readerId)).toEqual([]);
    expect(await memoryOf(readerId)).toEqual([]);
  });

  it("refuses unpublished, missing, mismatched, and invisible words", async () => {
    const { groupId, owner, ownerId, reader, readerId, course, path, hond } = await setup();
    const draftWord = word("het concept");
    const draft = await addLesson(groupId, course.id, owner, "Draft", { published: false, document: documentOf(blocks.vocabulary(draftWord)) });
    const other = await addLesson(groupId, course.id, owner, "Other", { document: documentOf(blocks.vocabulary(word("het huis"))) });
    for (const response of [
      await grade(path, draft.lesson.id, draftWord.id, "understand", "got", owner), await grade(path, other.lesson.id, crypto.randomUUID(), "understand", "got", reader),
      await grade(path, other.lesson.id, hond.id, "understand", "got", reader),
    ]) {
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("WORD_NOT_FOUND");
    }
    // A draft course is invisible to the reader, like a missing one.
    const hidden = await createCourse(groupId, owner, false, { title: "Hidden", summary: "Not yet." });
    const secret = word("het geheim");
    const hiddenLesson = await addLesson(groupId, hidden.id, owner, "Secret", { document: documentOf(blocks.vocabulary(secret)) });
    const invisible = await grade(coursePath(groupId, hidden.id), hiddenLesson.lesson.id, secret.id, "understand", "got", reader);
    expect(invisible.status).toBe(404);
    expect(await errorCode(invisible)).toBe("COURSE_NOT_FOUND");
    for (const userId of [readerId, ownerId]) {
      expect(await reviewsOf(userId)).toEqual([]);
      expect(await memoryOf(userId)).toEqual([]);
    }
  });

  it("returns 404 for lesson drills of missing, unpublished, and invisible lessons", async () => {
    const { groupId, owner, reader, course } = await setup();
    const draft = await addLesson(groupId, course.id, owner, "Draft", { published: false, document: documentOf(blocks.vocabulary(word("het concept"))) });
    const hidden = await createCourse(groupId, owner, false, { title: "Hidden", summary: "Not yet." });
    const hiddenLesson = await addLesson(groupId, hidden.id, owner, "Secret", { document: documentOf(blocks.vocabulary(word("het geheim"))) });
    for (const lessonId of [crypto.randomUUID(), draft.lesson.id, hiddenLesson.lesson.id]) {
      const response = await request(`/api/groups/${groupId}/word-drill?source=lesson&lessonId=${lessonId}`, reader);
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("LESSON_NOT_FOUND");
    }
    // The owner sees both, but an unpublished lesson has no published words to drill.
    expect(await deck(groupId, owner, `source=lesson&lessonId=${draft.lesson.id}`)).toEqual({ cards: [] });
    expect((await deck(groupId, owner, `source=lesson&lessonId=${hiddenLesson.lesson.id}`)).cards.map((card) => card.word.term)).toEqual(["het geheim"]);
    // Another library's lesson is not reachable.
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId);
    const outsider = await signIn("outsider");
    const betaCourse = await createCourse(otherGroup, outsider);
    const beta = await addLesson(otherGroup, betaCourse.id, outsider, "Beta", { document: documentOf(blocks.vocabulary(word("de fiets"))) });
    expect((await request(`/api/groups/${groupId}/word-drill?source=lesson&lessonId=${beta.lesson.id}`, reader)).status).toBe(404);
    const foreign = await request(`/api/groups/${groupId}/word-drill?source=weak`, outsider);
    expect(foreign.status).toBe(404);
    expect(await errorCode(foreign)).toBe("GROUP_NOT_FOUND");
  });
});

describe("Word drill deck", () => {
  it("drills every published word of a lesson with its course, lesson, and speech", async () => {
    const { groupId, reader, course, lesson, hond, kat } = await setup();
    const { cards } = await deck(groupId, reader, `source=lesson&lessonId=${lesson.lesson.id}&direction=produce`);
    expect(cards.map((card) => card.word.id).sort()).toEqual([hond.id, kat.id].sort());
    expect(cards.every((card) => card.direction === "produce")).toBe(true);
    expect(cards.find((card) => card.word.id === hond.id)).toEqual({
      word: { id: hond.id, lessonId: lesson.lesson.id, term: "de hond", meaning: "meaning of de hond", forms: "honden", example: "De hond slaapt.", note: null, speech: { term: null, example: null } },
      direction: "produce",
      course: { id: course.id, slug: course.slug, title: "Dutch foundations" },
      lesson: { id: lesson.lesson.id, slug: lesson.lesson.slug, title: "Animals" },
    });
    // Mixed is the default direction.
    expect((await deck(groupId, reader, `source=lesson&lessonId=${lesson.lesson.id}`)).cards).toHaveLength(2);
  });

  it("draws weak words from visible bookmarks and remembered terms, and is empty without either", async () => {
    const { groupId, owner, reader, readerId, course, path, lesson, hond, kat } = await setup();
    expect(await deck(groupId, reader, "source=weak")).toEqual({ cards: [] });
    await bookmark(path, lesson.lesson.id, hond.id, reader);
    const travel = await createCourse(groupId, owner, true, { title: "Travel", summary: "On the road." });
    const trein = word("de trein");
    const stations = await addLesson(groupId, travel.id, owner, "Stations", { document: documentOf(blocks.vocabulary(trein)) });
    await bookmark(coursePath(groupId, travel.id), stations.lesson.id, trein.id, reader);
    const terms = async () => (await deck(groupId, reader, "source=weak&direction=understand")).cards.map((card) => card.word.term).sort();
    expect(await terms()).toEqual(["de hond", "de trein"]);
    // Another account's bookmarks and memory are not the reader's weak words.
    await bookmark(path, lesson.lesson.id, kat.id, owner);
    await recent(path, lesson.lesson.id, kat.id, "understand", "again", owner);
    expect(await terms()).toEqual(["de hond", "de trein"]);
    // A drilled word joins without a bookmark.
    await recent(path, lesson.lesson.id, kat.id, "produce", "again", reader);
    expect(await terms()).toEqual(["de hond", "de kat", "de trein"]);
    // An archived course and a word edited out of its lesson leave the deck, though the reader's memory of them stays.
    expect((await request(`${coursePath(groupId, travel.id)}/archive`, owner, {})).status).toBe(200);
    await saveDraft(lesson.path, owner, documentOf(blocks.vocabulary(word("de vis"))), (await readLesson(lesson.path, owner)).draft!.version);
    await publishLesson(lesson.path, owner, (await readLesson(lesson.path, owner)).draft!.version);
    expect(await deck(groupId, reader, "source=weak")).toEqual({ cards: [] });
    expect(await memoryOf(readerId)).toHaveLength(1);
    // A remembered term falls back to another visible occurrence of it.
    const again = word("De  Kat");
    await addLesson(groupId, course.id, owner, "Again", { document: documentOf(blocks.vocabulary(again)) });
    expect((await deck(groupId, reader, "source=weak")).cards.map((card) => card.word.id)).toEqual([again.id]);
  });

  it("orders by recall probability over real rows, capping the session", async () => {
    const { groupId, owner, readerId, reader, course } = await setup();
    const words = Array.from({ length: WORD_DRILL_SESSION_SIZE + 2 }, (_, index) => word(`woord ${String(index).padStart(2, "0")}`));
    const big = await addLesson(groupId, course.id, owner, "Many", { document: documentOf(blocks.vocabulary(...words)) });
    const [faded, fresh, ...rest] = words;
    // Half a day of stability a month ago: recall well under the 0.5 of a never-reviewed word.
    await seedMemory(readerId, course.id, big.lesson.id, faded!.id, faded!.term, "understand", 0.5, 30);
    // The rest are well known, the most recently reviewed best: the last two fall outside the session.
    for (const [index, entry] of rest.entries()) await seedMemory(readerId, course.id, big.lesson.id, entry.id, entry.term, "understand", 30, 30 - index);
    const expected = [faded!, fresh!, ...rest.slice(0, WORD_DRILL_SESSION_SIZE - 2)].map((entry) => entry.id).sort();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { cards } = await deck(groupId, reader, `source=lesson&lessonId=${big.lesson.id}&direction=understand`);
      expect(cards.map((card) => card.word.id).sort()).toEqual(expected);
    }
    // A mixed session picks each word's weaker direction: a faded produce memory beats a solid understand one.
    await env.DB.prepare("UPDATE word_memory SET stability = 100, last_reviewed_at = ? WHERE user_id = ? AND term_key = ?").bind(Date.now(), readerId, faded!.term).run();
    await seedMemory(readerId, course.id, big.lesson.id, faded!.id, faded!.term, "produce", 0.5, 30);
    const mixed = await deck(groupId, reader, `source=lesson&lessonId=${big.lesson.id}&direction=mixed`);
    expect(mixed.cards.find((card) => card.word.id === faded!.id)?.direction).toBe("produce");
    // Words marked known come last, even when faded.
    await env.DB.prepare("UPDATE word_memory SET known_override = 1 WHERE user_id = ? AND term_key = ?").bind(readerId, faded!.term).run();
    const known = await deck(groupId, reader, `source=lesson&lessonId=${big.lesson.id}&direction=understand`);
    expect(known.cards.map((card) => card.word.id)).not.toContain(faded!.id);
  });

  it("never reads another account's memory", async () => {
    const { groupId, owner, ownerId, readerId, reader, course } = await setup();
    const words = Array.from({ length: WORD_DRILL_SESSION_SIZE + 1 }, (_, index) => word(`woord ${String(index).padStart(2, "0")}`));
    const big = await addLesson(groupId, course.id, owner, "Many", { document: documentOf(blocks.vocabulary(...words)) });
    const [untouched, ...drilled] = words;
    // The reader knows every word but one well; the owner has the same words faded. Were the owner's memory read, the
    // reader's never-reviewed word would fall behind twenty faded words and out of the session.
    for (const entry of drilled) {
      await seedMemory(readerId, course.id, big.lesson.id, entry.id, entry.term, "understand", 30, 1);
      await seedMemory(ownerId, course.id, big.lesson.id, entry.id, entry.term, "understand", 0.5, 30);
    }
    const { cards } = await deck(groupId, reader, `source=lesson&lessonId=${big.lesson.id}&direction=understand`);
    expect(cards.map((card) => card.word.id)).toContain(untouched!.id);
  });

  it("holds each term key once, even without a stored key", async () => {
    const { groupId, owner, readerId, reader, course, path, lesson, hond } = await setup();
    const first = word("vrij"); const second = word("Vríj");
    const one = await addLesson(groupId, course.id, owner, "One", { document: documentOf(blocks.vocabulary(first)) });
    const two = await addLesson(groupId, course.id, owner, "Two", { document: documentOf(blocks.vocabulary(second)) });
    for (const [lessonId, wordId] of [[one.lesson.id, first.id], [lesson.lesson.id, hond.id]] as const) {
      expect((await bookmark(path, lessonId, wordId, reader)).status).toBe(200);
    }
    await seedMemory(readerId, course.id, two.lesson.id, second.id, "vrij", "understand", 0.5, 30);
    // A row indexed before search keys existed gets its key before the deck is built.
    await env.DB.prepare("UPDATE course_lesson_words SET term_key = NULL, search_key = NULL WHERE word_id = ?").bind(second.id).run();
    for (const direction of ["mixed", "understand", "produce"]) {
      const { cards } = await deck(groupId, reader, `source=weak&direction=${direction}`);
      const ids = cards.map((card) => card.word.id);
      expect(ids, direction).toHaveLength(2);
      expect(ids).toContain(hond.id);
      // The term's memory is shared, so the bookmarked occurrence wins the tie.
      expect(ids).toContain(first.id);
    }
  });
});

describe("Word drill grades", () => {
  it("appends one review and folds memory per direction, returning the last five results", async () => {
    const { readerId, reader, path, lesson, hond } = await setup();
    const results: WordDrillResult[] = ["got", "got", "again", "got", "again", "got"];
    const seen = [];
    for (const result of results) seen.push(await recent(path, lesson.lesson.id, hond.id, "understand", result, reader));
    expect(seen[0]).toEqual(["got"]);
    expect(seen.at(-1)).toEqual(["got", "again", "got", "again", "got"]);
    expect(await recent(path, lesson.lesson.id, hond.id, "produce", "again", reader)).toEqual(["again"]);
    const reviews = await reviewsOf(readerId);
    expect(reviews).toHaveLength(7);
    expect(reviews[0]).toEqual({ termKey: "de hond", lessonId: lesson.lesson.id, wordId: hond.id, direction: "understand", result: "got", source: "drill" });
    expect(await memoryOf(readerId)).toEqual([
      { termKey: "de hond", direction: "produce", lessonId: lesson.lesson.id, wordId: hond.id, recent: "a", reps: 1 },
      { termKey: "de hond", direction: "understand", lessonId: lesson.lesson.id, wordId: hond.id, recent: "ggagag", reps: 6 },
    ]);
    // The stored row is exactly what rebuilding from the stored reviews gives.
    const stored = await env.DB.prepare(
      `SELECT course_id AS courseId, lesson_id AS lessonId, word_id AS wordId, recent, reps, lapses, last_lapse_at AS lastLapseAt, stability, difficulty,
         last_reviewed_at AS lastReviewedAt, known_override AS knownOverride FROM word_memory WHERE user_id = ? AND direction = 'understand'`,
    ).bind(readerId).first<Record<string, unknown>>();
    const log = await env.DB.prepare(
      `SELECT result, source, seed_box AS seedBox, course_id AS courseId, lesson_id AS lessonId, word_id AS wordId, created_at AS createdAt
       FROM word_reviews WHERE user_id = ? AND direction = 'understand' ORDER BY created_at, id`,
    ).bind(readerId).all<FoldableWordReview>();
    expect({ ...stored, knownOverride: stored?.knownOverride === 1 }).toEqual(rebuildWordMemory(log.results));
    expect(stored).toMatchObject({ lapses: 2 });
  });

  it("keeps one memory per term key across lessons, represented by the latest occurrence", async () => {
    const { groupId, owner, readerId, reader, course, path } = await setup();
    const first = word("vrij"); const second = word("Vríj");
    const one = await addLesson(groupId, course.id, owner, "One", { document: documentOf(blocks.vocabulary(first)) });
    const two = await addLesson(groupId, course.id, owner, "Two", { document: documentOf(blocks.vocabulary(second)) });
    await recent(path, one.lesson.id, first.id, "understand", "got", reader);
    // A row without a stored key is keyed by its term.
    await env.DB.prepare("UPDATE course_lesson_words SET term_key = NULL WHERE word_id = ?").bind(second.id).run();
    expect(await recent(path, two.lesson.id, second.id, "understand", "again", reader)).toEqual(["got", "again"]);
    expect(await memoryOf(readerId)).toEqual([{ termKey: "vrij", direction: "understand", lessonId: two.lesson.id, wordId: second.id, recent: "ga", reps: 2 }]);
  });

  it("never writes another account's reviews or memory", async () => {
    const { ownerId, owner, readerId, reader, path, lesson, hond } = await setup();
    expect(await recent(path, lesson.lesson.id, hond.id, "understand", "got", reader)).toEqual(["got"]);
    expect(await recent(path, lesson.lesson.id, hond.id, "understand", "again", owner)).toEqual(["again"]);
    expect(await recent(path, lesson.lesson.id, hond.id, "understand", "got", owner)).toEqual(["again", "got"]);
    expect((await memoryOf(readerId)).map((row) => row.recent)).toEqual(["g"]);
    expect((await memoryOf(ownerId)).map((row) => row.recent)).toEqual(["ag"]);
    expect(await reviewsOf(readerId)).toHaveLength(1);
    expect(await reviewsOf(ownerId)).toHaveLength(2);
  });

  it("keeps memory after unbookmarking and while the word is edited out", async () => {
    const { owner, readerId, reader, path, lesson, hond, kat } = await setup();
    await bookmark(path, lesson.lesson.id, hond.id, reader);
    await recent(path, lesson.lesson.id, hond.id, "understand", "got", reader);
    expect((await request(`${path}/lessons/${lesson.lesson.id}/words/${hond.id}/bookmark`, reader, undefined, "DELETE")).status).toBe(200);
    expect(await recent(path, lesson.lesson.id, hond.id, "understand", "got", reader)).toEqual(["got", "got"]);
    // Edited out: the grade is refused, memory stays, and it carries on once the word returns.
    await saveDraft(lesson.path, owner, documentOf(blocks.vocabulary(kat)), (await readLesson(lesson.path, owner)).draft!.version);
    await publishLesson(lesson.path, owner, (await readLesson(lesson.path, owner)).draft!.version);
    expect((await grade(path, lesson.lesson.id, hond.id, "understand", "got", reader)).status).toBe(404);
    expect((await memoryOf(readerId)).map((row) => row.reps)).toEqual([2]);
    await saveDraft(lesson.path, owner, documentOf(blocks.vocabulary(hond, kat)), (await readLesson(lesson.path, owner)).draft!.version);
    await publishLesson(lesson.path, owner, (await readLesson(lesson.path, owner)).draft!.version);
    expect(await recent(path, lesson.lesson.id, hond.id, "understand", "again", reader)).toEqual(["got", "got", "again"]);
  });

  it("refuses grades in a course the reader can no longer see", async () => {
    const { owner, readerId, reader, path, lesson, hond } = await setup();
    await recent(path, lesson.lesson.id, hond.id, "understand", "got", reader);
    expect((await request(`${path}/archive`, owner, {})).status).toBe(200);
    const refused = await grade(path, lesson.lesson.id, hond.id, "understand", "got", reader);
    expect(refused.status).toBe(404);
    expect(await errorCode(refused)).toBe("COURSE_NOT_FOUND");
    expect(await reviewsOf(readerId)).toHaveLength(1);
  });

  it("removes a lesson's reviews and attempts with it and rebuilds memory from the reviews left", async () => {
    const { groupId, owner, ownerId, readerId, reader, course, path, lesson, hond, kat } = await setup();
    const again = word("de hond"); const other = word("het huis");
    const kept = await addLesson(groupId, course.id, owner, "Kept", { document: documentOf(blocks.vocabulary(again, other)) });
    await recent(path, kept.lesson.id, again.id, "understand", "again", reader);
    await recent(path, lesson.lesson.id, hond.id, "understand", "got", reader);
    await recent(path, lesson.lesson.id, hond.id, "produce", "got", reader);
    await recent(path, lesson.lesson.id, kat.id, "understand", "got", reader);
    await recent(path, kept.lesson.id, other.id, "understand", "got", reader);
    await recent(path, lesson.lesson.id, kat.id, "understand", "again", owner);
    await env.DB.prepare("UPDATE word_memory SET known_override = 1 WHERE user_id = ? AND term_key = 'de hond' AND direction = 'understand'").bind(readerId).run();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO practice_attempts (id, user_id, course_id, lesson_id, practice_kind, practice_id, item_index, prompt, answer, reference, matched, ai_verdict, ai_note, source, conversation_id, created_at)
         VALUES (?, ?, ?, ?, 'lesson', ?, 0, 'Prompt', 'Answer', NULL, 1, NULL, NULL, 'lesson', NULL, ?)`,
      ).bind(crypto.randomUUID(), readerId, course.id, lesson.lesson.id, crypto.randomUUID(), now),
      env.DB.prepare(
        `INSERT INTO practice_attempts (id, user_id, course_id, lesson_id, practice_kind, practice_id, item_index, prompt, answer, reference, matched, ai_verdict, ai_note, source, conversation_id, created_at)
         VALUES (?, ?, ?, ?, 'lesson', ?, 0, 'Prompt', 'Answer', NULL, 0, NULL, NULL, 'lesson', NULL, ?)`,
      ).bind(crypto.randomUUID(), readerId, course.id, kept.lesson.id, crypto.randomUUID(), now),
      env.DB.prepare(
        `INSERT INTO pronunciation_attempts (id, user_id, surface, reference_text, term_key, lesson_id, word_id, overall, accuracy, fluency, completeness, word_scores, created_at)
         VALUES (?, ?, 'drill', 'de hond', 'de hond', ?, ?, 80, 81, 82, 100, '[]', ?)`,
      ).bind(crypto.randomUUID(), readerId, lesson.lesson.id, hond.id, now),
    ]);

    expect((await request(`${path}/lessons/${lesson.lesson.id}`, owner, undefined, "DELETE")).status).toBe(200);
    // Only the kept lesson's reviews remain, and memory is rebuilt from them: de hond (understand) is known through Kept,
    // with its known mark carried over; de hond (produce) and de kat had reviews only in the deleted lesson.
    expect((await reviewsOf(readerId)).map((row) => row.lessonId)).toEqual([kept.lesson.id, kept.lesson.id]);
    expect(await memoryOf(readerId)).toEqual([
      { termKey: "de hond", direction: "understand", lessonId: kept.lesson.id, wordId: again.id, recent: "a", reps: 1 },
      { termKey: "het huis", direction: "understand", lessonId: kept.lesson.id, wordId: other.id, recent: "g", reps: 1 },
    ]);
    const known = await env.DB.prepare("SELECT known_override AS known FROM word_memory WHERE user_id = ? AND term_key = 'de hond'").bind(readerId).first<{ known: number }>();
    expect(known?.known).toBe(1);
    expect(await reviewsOf(ownerId)).toEqual([]);
    expect(await memoryOf(ownerId)).toEqual([]);
    const attempts = await env.DB.prepare("SELECT lesson_id AS lessonId FROM practice_attempts WHERE user_id = ?").bind(readerId).all<{ lessonId: string }>();
    expect(attempts.results).toEqual([{ lessonId: kept.lesson.id }]);
    const pronunciation = await env.DB.prepare("SELECT lesson_id AS lessonId, word_id AS wordId, term_key AS termKey FROM pronunciation_attempts WHERE user_id = ?").bind(readerId).first();
    expect(pronunciation).toEqual({ lessonId: null, wordId: null, termKey: "de hond" });

    // Courses are archived in the product; a course row removed operationally (after its feed posts) takes its rows with it.
    await env.DB.prepare("DELETE FROM posts WHERE course_id = ?").bind(course.id).run();
    await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(course.id).run();
    expect(await reviewsOf(readerId)).toEqual([]);
    expect(await memoryOf(readerId)).toEqual([]);
  });
});
