import { env, SELF } from "cloudflare:test";
import { WEAK_WORDS_PAGE_SIZE, weakWordsPageSchema, type WeakWordsPage } from "@wordinator/contracts/weak-words";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser,
  signIn, word,
} from "./courseApi";

// The Weak words view and "I know this word" (C14d, docs/words.md#weak-words-view) over real rows.
const DAY = 86_400_000;
const weakPath = (groupId: string, cursor?: string) => `/api/groups/${groupId}/weak-words${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
const knownPath = (groupId: string, termKey: string) => `/api/groups/${groupId}/word-memory/${encodeURIComponent(termKey)}/known`;
async function weak(groupId: string, cookie: string, cursor?: string): Promise<WeakWordsPage> {
  const response = await request(weakPath(groupId, cursor), cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return weakWordsPageSchema.parse(await response.json());
}
const terms = (page: WeakWordsPage) => page.items.map((item) => item.termKey);
const grade = (path: string, lessonId: string, wordId: string, direction: string, result: string, cookie: string) =>
  request(`${path}/lessons/${lessonId}/words/${wordId}/drill/${direction}`, cookie, { result }, "PUT");
// A memory row written directly: `stability` days, last reviewed `daysAgo` days ago, so the ranking is set by the test.
async function seedMemory(userId: string, courseId: string, lessonId: string, wordId: string, termKey: string, direction: string, stability: number, daysAgo: number, known = false) {
  await env.DB.prepare(
    `INSERT INTO word_memory (user_id, term_key, direction, course_id, lesson_id, word_id, recent, reps, lapses, last_lapse_at, stability, difficulty, last_reviewed_at, known_override)
     VALUES (?, ?, ?, ?, ?, ?, 'g', 1, 0, NULL, ?, 5, ?, ?)`,
  ).bind(userId, termKey, direction, courseId, lessonId, wordId, stability, Date.now() - daysAgo * DAY, known ? 1 : 0).run();
}
const knownFlags = (userId: string) => env.DB.prepare("SELECT term_key AS termKey, direction, known_override AS known FROM word_memory WHERE user_id = ? ORDER BY term_key, direction")
  .bind(userId).all<{ termKey: string; direction: string; known: number }>().then((rows) => rows.results);

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  const hond = word("de hond"); const kat = word("de kat"); const vis = word("de vis");
  const lesson = await addLesson(groupId, course.id, owner, "Animals", { document: documentOf(blocks.vocabulary(hond, kat, vis)) });
  return { ownerId, readerId, groupId, owner, reader, course, path, hond, kat, vis, lesson };
}

beforeEach(resetDatabase);

describe("Weak words access", () => {
  it("refuses anonymous requests, other libraries, and malformed cursors and keys", async () => {
    const { groupId, reader } = await setup();
    expect((await SELF.fetch(`https://wordinator.test${weakPath(groupId)}`)).status).toBe(401);
    expect((await SELF.fetch(`https://wordinator.test${knownPath(groupId, "de hond")}`, { method: "PUT" })).status).toBe(401);
    const outsiderId = await seedUser("outsider"); await seedGroup("beta", outsiderId);
    const outsider = await signIn("outsider");
    const foreign = await request(weakPath(groupId), outsider);
    expect(foreign.status).toBe(404);
    expect(await errorCode(foreign)).toBe("GROUP_NOT_FOUND");
    for (const cursor of ["nope", btoa(JSON.stringify([1, 0.5, 1])), btoa(JSON.stringify(["x", 0.5, 1, "a"])), btoa(JSON.stringify([1, 0.5, 1, ""]))]) {
      const response = await request(weakPath(groupId, cursor), reader);
      expect(response.status, cursor).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_CURSOR");
    }
    // A term key is already folded: upper case or doubled spaces are not keys.
    for (const key of ["De hond", "de  hond"]) {
      const response = await request(knownPath(groupId, key), reader, undefined, "PUT");
      expect(response.status, key).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_WORD");
    }
  });
});

describe("Weak words read", () => {
  it("is empty without memory, and lists remembered terms weakest first with their word, place, and last results", async () => {
    const { groupId, readerId, reader, course, path, lesson, hond, kat, vis } = await setup();
    expect(await weak(groupId, reader)).toEqual({ items: [], nextCursor: null, hasMemory: false });
    // de vis is long stable; de kat is fading; de hond was failed moments ago in both directions after earlier successes.
    await seedMemory(readerId, course.id, lesson.lesson.id, vis.id, "de vis", "understand", 365, 1);
    await seedMemory(readerId, course.id, lesson.lesson.id, kat.id, "de kat", "understand", 5, 3);
    for (const [direction, result] of [["understand", "got"], ["produce", "got"], ["understand", "got"], ["produce", "again"], ["understand", "got"], ["understand", "again"]]) {
      expect((await grade(path, lesson.lesson.id, hond.id, direction!, result!, reader)).status).toBe(200);
    }
    const page = await weak(groupId, reader);
    expect(page.hasMemory).toBe(true);
    expect(page.nextCursor).toBeNull();
    expect(terms(page)).toEqual(["de hond", "de kat", "de vis"]);
    // The last five results across both directions, oldest first; rows seeded without reviews have none.
    expect(page.items[0]).toEqual({
      word: { id: hond.id, lessonId: lesson.lesson.id, term: "de hond", meaning: "meaning of de hond", forms: null, example: null, note: null, speech: { term: null, example: null } },
      termKey: "de hond", recent: ["got", "got", "again", "got", "again"],
      course: { id: course.id, slug: course.slug, title: "Dutch foundations" }, lesson: { id: lesson.lesson.id, slug: lesson.lesson.slug, title: "Animals" },
    });
    expect(page.items[1]!.recent).toEqual([]);
  });

  it("ranks a word failed moments ago before a fading one whose recall now is lower", async () => {
    const { groupId, readerId, reader, course, path, lesson, hond, kat } = await setup();
    // de kat: recall now about 0.68 (a 1-day memory reviewed a day and a half ago) but 0.47 a week ahead; de hond: failed just now.
    await seedMemory(readerId, course.id, lesson.lesson.id, kat.id, "de kat", "understand", 1, 1.5);
    expect((await grade(path, lesson.lesson.id, hond.id, "understand", "again", reader)).status).toBe(200);
    expect(terms(await weak(groupId, reader))).toEqual(["de hond", "de kat"]);
  });

  it("pages twenty at a time and pins the order to the first page's time", async () => {
    const { groupId, owner, readerId, reader, course } = await setup();
    const fillers = Array.from({ length: WEAK_WORDS_PAGE_SIZE }, (_, index) => word(`woord ${String(index).padStart(2, "0")}`));
    const x = word("woord x"); const y = word("woord y");
    const many = await addLesson(groupId, course.id, owner, "Many", { document: documentOf(blocks.vocabulary(...fillers, x, y)) });
    // The fillers are far weaker than x and y. Now, y (long stable but long unseen) is weaker than x (short stable, just seen);
    // five days on, x has decayed past y.
    for (const [index, filler] of fillers.entries()) await seedMemory(readerId, course.id, many.lesson.id, filler.id, filler.term, "understand", 0.2, 30 + index);
    await seedMemory(readerId, course.id, many.lesson.id, x.id, x.term, "understand", 1, 0);
    await seedMemory(readerId, course.id, many.lesson.id, y.id, y.term, "understand", 100, 900);
    const first = await weak(groupId, reader);
    expect(terms(first)).toEqual([...fillers].reverse().map((filler) => filler.term));
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await weak(groupId, reader, first.nextCursor!);
    expect(terms(second)).toEqual(["woord y", "woord x"]);
    expect(second.nextCursor).toBeNull();
    // The cursor carries its time: the same place five days later ranks x first.
    const [at, ...rest] = JSON.parse(atob(first.nextCursor!)) as [number, ...unknown[]];
    expect(terms(await weak(groupId, reader, btoa(JSON.stringify([at + 5 * DAY, ...rest]))))).toEqual(["woord x", "woord y"]);
  });

  it("shows a visible occurrence, falling back from a hidden one, and leaves out terms with none", async () => {
    const { groupId, owner, readerId, reader, course, path, lesson, hond, kat, vis } = await setup();
    expect((await grade(path, lesson.lesson.id, hond.id, "understand", "again", reader)).status).toBe(200);
    expect((await grade(path, lesson.lesson.id, kat.id, "understand", "again", reader)).status).toBe(200);
    // de hond also appears in a later lesson; de vis only in a draft course the reader cannot see.
    const again = word("De  Hond");
    const later = await addLesson(groupId, course.id, owner, "Later", { document: documentOf(blocks.vocabulary(again)) });
    const hidden = await createCourse(groupId, owner, false, { title: "Hidden", summary: "Not yet." });
    const secret = word("de vis");
    const secretLesson = await addLesson(groupId, hidden.id, owner, "Secret", { document: documentOf(blocks.vocabulary(secret)) });
    await seedMemory(readerId, hidden.id, secretLesson.lesson.id, secret.id, "de vis", "understand", 0.1, 30);
    // The draft lesson's word is not visible, though de vis also sits in Animals: that occurrence represents it.
    let page = await weak(groupId, reader);
    expect(page.items.map((item) => [item.termKey, item.word.id])).toEqual(expect.arrayContaining([["de hond", hond.id], ["de kat", kat.id], ["de vis", vis.id]]));
    // Edit de hond and de vis out of Animals: de hond falls back to Later, and de vis is left out.
    await saveDraft(lesson.path, owner, documentOf(blocks.vocabulary(kat)), (await readLesson(lesson.path, owner)).draft!.version);
    await publishLesson(lesson.path, owner, (await readLesson(lesson.path, owner)).draft!.version);
    page = await weak(groupId, reader);
    expect(page.items.map((item) => [item.termKey, item.word.id, item.lesson.title]).sort()).toEqual([["de hond", again.id, "Later"], ["de kat", kat.id, "Animals"]]);
    // An archived course hides its words too; with nothing visible left, there is no memory to drill.
    expect((await request(`${path}/archive`, owner, {})).status).toBe(200);
    expect(await weak(groupId, reader)).toEqual({ items: [], nextCursor: null, hasMemory: false });
    expect(later.lesson.id).toBeTruthy();
  });

  it("never reads another account's memory", async () => {
    const { groupId, ownerId, owner, reader, readerId, course, path, lesson, hond, kat } = await setup();
    await seedMemory(ownerId, course.id, lesson.lesson.id, kat.id, "de kat", "understand", 0.1, 30);
    expect((await grade(path, lesson.lesson.id, kat.id, "produce", "again", owner)).status).toBe(200);
    expect(await weak(groupId, reader)).toEqual({ items: [], nextCursor: null, hasMemory: false });
    expect((await grade(path, lesson.lesson.id, hond.id, "understand", "got", reader)).status).toBe(200);
    const page = await weak(groupId, reader);
    expect(terms(page)).toEqual(["de hond"]);
    expect(page.items[0]!.recent).toEqual(["got"]);
    expect(terms(await weak(groupId, owner))).toEqual(["de kat"]);
    expect(await knownFlags(readerId)).toHaveLength(1);
  });
});

describe("I know this word", () => {
  it("marks both directions, hides the term, is idempotent, and clears", async () => {
    const { groupId, readerId, reader, path, lesson, hond, kat } = await setup();
    for (const direction of ["understand", "produce"]) expect((await grade(path, lesson.lesson.id, hond.id, direction, "again", reader)).status).toBe(200);
    expect((await grade(path, lesson.lesson.id, kat.id, "understand", "again", reader)).status).toBe(200);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(knownPath(groupId, "de hond"), reader, undefined, "PUT");
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
    expect(await knownFlags(readerId)).toEqual([
      { termKey: "de hond", direction: "produce", known: 1 }, { termKey: "de hond", direction: "understand", known: 1 }, { termKey: "de kat", direction: "understand", known: 0 },
    ]);
    const page = await weak(groupId, reader);
    expect(terms(page)).toEqual(["de kat"]);
    // Known words still count as memory for the drill setup.
    expect((await request(knownPath(groupId, "de kat"), reader, undefined, "PUT")).status).toBe(200);
    expect(await weak(groupId, reader)).toEqual({ items: [], nextCursor: null, hasMemory: true });
    for (let attempt = 0; attempt < 2; attempt += 1) expect((await request(knownPath(groupId, "de hond"), reader, undefined, "DELETE")).status).toBe(200);
    expect(terms(await weak(groupId, reader))).toEqual(["de hond"]);
  });

  it("is cleared by a later Again in either direction, but not by Got it", async () => {
    const { groupId, readerId, reader, path, lesson, hond } = await setup();
    expect((await grade(path, lesson.lesson.id, hond.id, "understand", "got", reader)).status).toBe(200);
    expect((await grade(path, lesson.lesson.id, hond.id, "produce", "got", reader)).status).toBe(200);
    expect((await request(knownPath(groupId, "de hond"), reader, undefined, "PUT")).status).toBe(200);
    expect((await grade(path, lesson.lesson.id, hond.id, "understand", "got", reader)).status).toBe(200);
    expect(terms(await weak(groupId, reader))).toEqual([]);
    expect(await knownFlags(readerId)).toEqual([{ termKey: "de hond", direction: "produce", known: 1 }, { termKey: "de hond", direction: "understand", known: 1 }]);
    // An Again in one direction clears the term's mark in both, so the word is listed again.
    expect((await grade(path, lesson.lesson.id, hond.id, "produce", "again", reader)).status).toBe(200);
    expect(await knownFlags(readerId)).toEqual([{ termKey: "de hond", direction: "produce", known: 0 }, { termKey: "de hond", direction: "understand", known: 0 }]);
    expect(terms(await weak(groupId, reader))).toEqual(["de hond"]);
  });

  it("refuses a term without memory and never touches another account's rows", async () => {
    const { groupId, ownerId, owner, readerId, reader, path, lesson, hond } = await setup();
    expect((await grade(path, lesson.lesson.id, hond.id, "understand", "again", owner)).status).toBe(200);
    const missing = await request(knownPath(groupId, "de hond"), reader, undefined, "PUT");
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("WORD_NOT_FOUND");
    expect((await request(knownPath(groupId, "de hond"), reader, undefined, "DELETE")).status).toBe(200);
    expect(await knownFlags(ownerId)).toEqual([{ termKey: "de hond", direction: "understand", known: 0 }]);
    expect(await knownFlags(readerId)).toEqual([]);
  });
});
