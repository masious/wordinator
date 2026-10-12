import { env, SELF } from "cloudflare:test";
import { WORD_DRILL_SESSION_SIZE, wordDrillDeckSchema, wordDrillGradeResponseSchema, type WordDrillDeck } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser,
  signIn, word,
} from "./courseApi";

// Drill API (C12d, docs/words.md#drill): the deck read and the first-grade write, over real rows.
const drillPath = (path: string, lessonId: string, wordId: string, direction: string) => `${path}/lessons/${lessonId}/words/${wordId}/drill/${direction}`;
const grade = (path: string, lessonId: string, wordId: string, direction: string, result: unknown, cookie: string) =>
  request(drillPath(path, lessonId, wordId, direction), cookie, { result }, "PUT");
const bookmark = (path: string, lessonId: string, wordId: string, cookie: string) => request(`${path}/lessons/${lessonId}/words/${wordId}/bookmark`, cookie, undefined, "PUT");
async function deck(groupId: string, cookie: string, query: string): Promise<WordDrillDeck> {
  const response = await request(`/api/groups/${groupId}/word-drill?${query}`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return wordDrillDeckSchema.parse(await response.json());
}
async function box(path: string, lessonId: string, wordId: string, direction: string, result: string, cookie: string) {
  const response = await grade(path, lessonId, wordId, direction, result, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return wordDrillGradeResponseSchema.parse(await response.json()).box;
}
const statesOf = (userId: string) => env.DB.prepare(
  "SELECT word_id AS wordId, direction, box, last_result AS lastResult FROM course_word_drill_states WHERE user_id = ? ORDER BY word_id, direction",
).bind(userId).all<{ wordId: string; direction: string; box: number; lastResult: string }>().then((rows) => rows.results);
async function seedState(userId: string, courseId: string, lessonId: string, wordId: string, direction: string, stateBox: number, lastDrilledAt: number) {
  await env.DB.prepare(
    "INSERT INTO course_word_drill_states (user_id, course_id, lesson_id, word_id, direction, box, last_result, last_drilled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(userId, courseId, lessonId, wordId, direction, stateBox, stateBox === 1 ? "again" : "got", lastDrilledAt).run();
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
    expect(await statesOf(newcomerId)).toEqual([]);
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
    expect(await statesOf(readerId)).toEqual([]);
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
    expect(await statesOf(readerId)).toEqual([]);
    expect(await statesOf(ownerId)).toEqual([]);
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

  it("draws weak words from visible bookmarks only and is empty without them", async () => {
    const { groupId, owner, reader, course, path, lesson, hond, kat } = await setup();
    expect(await deck(groupId, reader, "source=weak")).toEqual({ cards: [] });
    await bookmark(path, lesson.lesson.id, hond.id, reader);
    const travel = await createCourse(groupId, owner, true, { title: "Travel", summary: "On the road." });
    const trein = word("de trein");
    const stations = await addLesson(groupId, travel.id, owner, "Stations", { document: documentOf(blocks.vocabulary(trein)) });
    await bookmark(coursePath(groupId, travel.id), stations.lesson.id, trein.id, reader);
    const terms = async () => (await deck(groupId, reader, "source=weak&direction=understand")).cards.map((card) => card.word.term).sort();
    expect(await terms()).toEqual(["de hond", "de trein"]);
    // Another account's bookmarks are not the reader's weak words.
    await bookmark(path, lesson.lesson.id, kat.id, owner);
    expect(await terms()).toEqual(["de hond", "de trein"]);
    // An archived course and a word edited out of its lesson leave the deck.
    expect((await request(`${coursePath(groupId, travel.id)}/archive`, owner, {})).status).toBe(200);
    await saveDraft(lesson.path, owner, documentOf(blocks.vocabulary(kat)), (await readLesson(lesson.path, owner)).draft!.version);
    await publishLesson(lesson.path, owner, (await readLesson(lesson.path, owner)).draft!.version);
    expect(await deck(groupId, reader, "source=weak")).toEqual({ cards: [] });
    expect(course.id).toBeTruthy();
  });

  it("orders by tier and age over real rows, capping the session", async () => {
    const { groupId, owner, readerId, reader, course } = await setup();
    const words = Array.from({ length: WORD_DRILL_SESSION_SIZE + 2 }, (_, index) => word(`woord ${String(index).padStart(2, "0")}`));
    const big = await addLesson(groupId, course.id, owner, "Many", { document: documentOf(blocks.vocabulary(...words)) });
    const [again, fresh, ...rest] = words;
    await seedState(readerId, course.id, big.lesson.id, again!.id, "understand", 1, 5_000);
    // The rest sit in box 3, drilled at increasing times: the two most recent fall outside the session.
    for (const [index, entry] of rest.entries()) await seedState(readerId, course.id, big.lesson.id, entry.id, "understand", 3, 1_000 + index);
    const expected = [again!, fresh!, ...rest.slice(0, WORD_DRILL_SESSION_SIZE - 2)].map((entry) => entry.id).sort();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { cards } = await deck(groupId, reader, `source=lesson&lessonId=${big.lesson.id}&direction=understand`);
      expect(cards.map((card) => card.word.id).sort()).toEqual(expected);
    }
    // A mixed session picks each word's weaker direction: produce box 1 beats understand box 5.
    await env.DB.prepare("UPDATE course_word_drill_states SET box = 5 WHERE user_id = ? AND word_id = ?").bind(readerId, again!.id).run();
    await seedState(readerId, course.id, big.lesson.id, again!.id, "produce", 1, 9_000);
    const mixed = await deck(groupId, reader, `source=lesson&lessonId=${big.lesson.id}&direction=mixed`);
    expect(mixed.cards.find((card) => card.word.id === again!.id)?.direction).toBe("produce");
  });

  it("never reads another account's states", async () => {
    const { groupId, owner, ownerId, readerId, reader, course } = await setup();
    const words = Array.from({ length: WORD_DRILL_SESSION_SIZE + 1 }, (_, index) => word(`woord ${String(index).padStart(2, "0")}`));
    const big = await addLesson(groupId, course.id, owner, "Many", { document: documentOf(blocks.vocabulary(...words)) });
    const [untouched, ...drilled] = words;
    // The reader knows every word but one well; the owner has the same words at box 1. Were the owner's states read, the
    // reader's never-drilled word would fall behind twenty box-1 words and out of the session.
    for (const entry of drilled) {
      await seedState(readerId, course.id, big.lesson.id, entry.id, "understand", 5, 1_000);
      await seedState(ownerId, course.id, big.lesson.id, entry.id, "understand", 1, 1_000);
    }
    const { cards } = await deck(groupId, reader, `source=lesson&lessonId=${big.lesson.id}&direction=understand`);
    expect(cards.map((card) => card.word.id)).toContain(untouched!.id);
  });

  it("holds each term key once, keeping the weakest, even without a stored key", async () => {
    const { groupId, owner, readerId, reader, course, path, lesson, hond } = await setup();
    const first = word("vrij"); const second = word("Vríj");
    const one = await addLesson(groupId, course.id, owner, "One", { document: documentOf(blocks.vocabulary(first)) });
    const two = await addLesson(groupId, course.id, owner, "Two", { document: documentOf(blocks.vocabulary(second)) });
    for (const [lessonId, wordId] of [[one.lesson.id, first.id], [two.lesson.id, second.id], [lesson.lesson.id, hond.id]] as const) {
      expect((await bookmark(path, lessonId, wordId, reader)).status).toBe(200);
    }
    await seedState(readerId, course.id, one.lesson.id, first.id, "understand", 4, 1_000);
    await seedState(readerId, course.id, one.lesson.id, first.id, "produce", 4, 1_000);
    await seedState(readerId, course.id, two.lesson.id, second.id, "understand", 1, 1_000);
    // A row indexed before search keys existed falls back to the term's key.
    await env.DB.prepare("UPDATE course_lesson_words SET term_key = NULL WHERE word_id = ?").bind(second.id).run();
    for (const direction of ["mixed", "understand", "produce"]) {
      const { cards } = await deck(groupId, reader, `source=weak&direction=${direction}`);
      expect(cards.map((card) => card.word.id).sort(), direction).toEqual([hond.id, second.id].sort());
      expect(new Set(cards.map((card) => card.word.id)).size).toBe(cards.length);
    }
  });
});

describe("Word drill grades", () => {
  it("moves Leitner boxes per direction through the route", async () => {
    const { readerId, reader, path, lesson, hond } = await setup();
    const steps: Array<[string, string, number]> = [
      ["understand", "got", 2], ["understand", "got", 3], ["understand", "got", 4], ["understand", "got", 5], ["understand", "got", 5],
      ["understand", "again", 1], ["understand", "got", 2], ["produce", "again", 1], ["produce", "again", 1], ["produce", "got", 2],
    ];
    for (const [direction, result, expected] of steps) expect(await box(path, lesson.lesson.id, hond.id, direction, result, reader), `${direction} ${result}`).toBe(expected);
    expect(await statesOf(readerId)).toEqual([
      { wordId: hond.id, direction: "produce", box: 2, lastResult: "got" }, { wordId: hond.id, direction: "understand", box: 2, lastResult: "got" },
    ]);
    // A first Again on a new word lands in box 1.
    const katStart = await box(path, lesson.lesson.id, (await env.DB.prepare("SELECT word_id AS id FROM course_lesson_words WHERE term = 'de kat'").first<{ id: string }>())!.id, "understand", "again", reader);
    expect(katStart).toBe(1);
  });

  it("never writes another account's states", async () => {
    const { ownerId, owner, readerId, reader, path, lesson, hond } = await setup();
    expect(await box(path, lesson.lesson.id, hond.id, "understand", "got", reader)).toBe(2);
    expect(await box(path, lesson.lesson.id, hond.id, "understand", "again", owner)).toBe(1);
    expect(await box(path, lesson.lesson.id, hond.id, "understand", "got", owner)).toBe(2);
    expect(await statesOf(readerId)).toEqual([{ wordId: hond.id, direction: "understand", box: 2, lastResult: "got" }]);
    expect(await statesOf(ownerId)).toEqual([{ wordId: hond.id, direction: "understand", box: 2, lastResult: "got" }]);
  });

  it("keeps state after unbookmarking and while the word is edited out", async () => {
    const { owner, readerId, reader, path, lesson, hond, kat } = await setup();
    await bookmark(path, lesson.lesson.id, hond.id, reader);
    expect(await box(path, lesson.lesson.id, hond.id, "understand", "got", reader)).toBe(2);
    expect((await request(`${path}/lessons/${lesson.lesson.id}/words/${hond.id}/bookmark`, reader, undefined, "DELETE")).status).toBe(200);
    expect(await statesOf(readerId)).toHaveLength(1);
    expect(await box(path, lesson.lesson.id, hond.id, "understand", "got", reader)).toBe(3);
    // Edited out: the grade is refused, the state stays, and it carries on once the word returns.
    await saveDraft(lesson.path, owner, documentOf(blocks.vocabulary(kat)), (await readLesson(lesson.path, owner)).draft!.version);
    await publishLesson(lesson.path, owner, (await readLesson(lesson.path, owner)).draft!.version);
    expect((await grade(path, lesson.lesson.id, hond.id, "understand", "got", reader)).status).toBe(404);
    expect(await statesOf(readerId)).toEqual([{ wordId: hond.id, direction: "understand", box: 3, lastResult: "got" }]);
    await saveDraft(lesson.path, owner, documentOf(blocks.vocabulary(hond, kat)), (await readLesson(lesson.path, owner)).draft!.version);
    await publishLesson(lesson.path, owner, (await readLesson(lesson.path, owner)).draft!.version);
    expect(await box(path, lesson.lesson.id, hond.id, "understand", "got", reader)).toBe(4);
  });

  it("refuses grades in a course the reader can no longer see", async () => {
    const { owner, readerId, reader, path, lesson, hond } = await setup();
    expect(await box(path, lesson.lesson.id, hond.id, "understand", "got", reader)).toBe(2);
    expect((await request(`${path}/archive`, owner, {})).status).toBe(200);
    const refused = await grade(path, lesson.lesson.id, hond.id, "understand", "got", reader);
    expect(refused.status).toBe(404);
    expect(await errorCode(refused)).toBe("COURSE_NOT_FOUND");
    expect(await statesOf(readerId)).toEqual([{ wordId: hond.id, direction: "understand", box: 2, lastResult: "got" }]);
  });

  it("removes states with their lesson and their course", async () => {
    const { groupId, owner, readerId, reader, course, path, lesson, hond } = await setup();
    const other = word("het huis");
    const kept = await addLesson(groupId, course.id, owner, "Kept", { document: documentOf(blocks.vocabulary(other)) });
    await box(path, lesson.lesson.id, hond.id, "understand", "got", reader);
    await box(path, lesson.lesson.id, hond.id, "produce", "again", reader);
    await box(path, kept.lesson.id, other.id, "understand", "got", reader);
    expect((await request(`${path}/lessons/${lesson.lesson.id}`, owner, undefined, "DELETE")).status).toBe(200);
    expect(await statesOf(readerId)).toEqual([{ wordId: other.id, direction: "understand", box: 2, lastResult: "got" }]);
    // Courses are archived in the product; a course row removed operationally (after its feed posts) takes its states with it.
    await env.DB.prepare("DELETE FROM posts WHERE course_id = ?").bind(course.id).run();
    await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(course.id).run();
    expect(await statesOf(readerId)).toEqual([]);
  });
});
