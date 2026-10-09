import { env, SELF } from "cloudflare:test";
import { WORD_BOOKMARKS_MAX } from "@wordinator/contracts";
import { wordBookmarkKeysResponseSchema, wordBookmarkPageSchema } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser,
  signIn, word,
} from "./courseApi";

const bookmarkPath = (path: string, lessonId: string, wordId: string) => `${path}/lessons/${lessonId}/words/${wordId}/bookmark`;
const bookmark = (path: string, lessonId: string, wordId: string, cookie: string) => request(bookmarkPath(path, lessonId, wordId), cookie, undefined, "PUT");
const unbookmark = (path: string, lessonId: string, wordId: string, cookie: string) => request(bookmarkPath(path, lessonId, wordId), cookie, undefined, "DELETE");
async function keys(groupId: string, cookie: string) {
  const response = await request(`/api/groups/${groupId}/word-bookmarks/keys`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return wordBookmarkKeysResponseSchema.parse(await response.json()).keys;
}
async function list(groupId: string, cookie: string, query = "") {
  const response = await request(`/api/groups/${groupId}/word-bookmarks${query}`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return wordBookmarkPageSchema.parse(await response.json());
}
const terms = async (groupId: string, cookie: string) => (await list(groupId, cookie)).items.map((item) => item.word.term);

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  const hund = word("der Hund", { forms: "die Hunde" }); const katze = word("die Katze");
  const lesson = await addLesson(groupId, course.id, owner, "Animals", { document: documentOf(blocks.vocabulary(hund, katze), blocks.paragraph("Tiere")) });
  return { ownerId, readerId, groupId, owner, reader, course, path, hund, katze, lesson };
}

async function republish(lessonPath: string, cookie: string, document: unknown) {
  await saveDraft(lessonPath, cookie, document, (await readLesson(lessonPath, cookie)).draft!.version);
  return publishLesson(lessonPath, cookie, (await readLesson(lessonPath, cookie)).draft!.version);
}

beforeEach(resetDatabase);

describe("Word bookmarks", () => {
  it("bookmarks published words without finishing the lesson, idempotently, newest first", async () => {
    const { groupId, reader, owner, course, path, hund, katze, lesson } = await setup();
    expect((await bookmark(path, lesson.lesson.id, hund.id, reader)).status).toBe(200);
    const first = await env.DB.prepare("SELECT created_at AS createdAt FROM course_word_bookmarks WHERE word_id = ?").bind(hund.id).first<{ createdAt: number }>();
    expect((await bookmark(path, lesson.lesson.id, hund.id, reader)).status).toBe(200);
    // Bookmarking again keeps the first timestamp.
    expect(await env.DB.prepare("SELECT created_at AS createdAt FROM course_word_bookmarks WHERE word_id = ?").bind(hund.id).first()).toEqual(first);
    await env.DB.prepare("UPDATE course_word_bookmarks SET created_at = created_at - 1000 WHERE word_id = ?").bind(hund.id).run();
    await bookmark(path, lesson.lesson.id, katze.id, reader);

    expect(await keys(groupId, reader)).toEqual([{ lessonId: lesson.lesson.id, wordId: katze.id }, { lessonId: lesson.lesson.id, wordId: hund.id }]);
    const page = await list(groupId, reader);
    expect(page.items.map((item) => item.word.term)).toEqual(["die Katze", "der Hund"]);
    expect(page.items[1]).toMatchObject({
      word: { id: hund.id, lessonId: lesson.lesson.id, term: "der Hund", forms: "die Hunde", example: null, note: null },
      course: { id: course.id, title: "Dutch foundations" }, lesson: { id: lesson.lesson.id, title: "Animals" },
    });
    // Bookmarks are private to the member.
    expect(await keys(groupId, owner)).toEqual([]);
    expect((await list(groupId, owner)).items).toEqual([]);

    expect((await unbookmark(path, lesson.lesson.id, katze.id, reader)).status).toBe(200);
    expect((await unbookmark(path, lesson.lesson.id, katze.id, reader)).status).toBe(200);
    expect(await terms(groupId, reader)).toEqual(["der Hund"]);
  });

  it("pages newest first with a stable cursor", async () => {
    const { groupId, owner, reader, course, path, lesson, hund, katze } = await setup();
    const more = Array.from({ length: 3 }, (_, index) => word(`woord ${index}`));
    const second = await addLesson(groupId, course.id, owner, "More", { document: documentOf(blocks.vocabulary(...more)) });
    for (const entry of [hund, katze]) await bookmark(path, lesson.lesson.id, entry.id, reader);
    for (const entry of more) await bookmark(path, second.lesson.id, entry.id, reader);
    // Equal timestamps fall back to the lesson and word IDs, so no bookmark is skipped or repeated.
    await env.DB.prepare("UPDATE course_word_bookmarks SET created_at = 1000").run();
    const seen: string[] = []; let cursor: string | null = null;
    do {
      const page = await list(groupId, reader, `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => `${item.lesson.id} ${item.word.id}`));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(seen).toEqual([...seen].sort().reverse());
    expect((await request(`/api/groups/${groupId}/word-bookmarks?cursor=nonsense`, reader)).status).toBe(400);
  });

  it("refuses unpublished, missing, and mismatched words", async () => {
    const { groupId, owner, reader, course, path, hund, lesson } = await setup();
    const draftWord = word("der Entwurf");
    const draft = await addLesson(groupId, course.id, owner, "Draft", { published: false, document: documentOf(blocks.vocabulary(draftWord)) });
    const refused = await bookmark(path, draft.lesson.id, draftWord.id, owner);
    expect(refused.status).toBe(404);
    expect(await errorCode(refused)).toBe("WORD_NOT_FOUND");
    expect((await bookmark(path, lesson.lesson.id, crypto.randomUUID(), reader)).status).toBe(404);
    // A word must belong to the lesson named in the path.
    const other = await addLesson(groupId, course.id, owner, "Other", { document: documentOf(blocks.vocabulary(word("das Haus"))) });
    expect((await bookmark(path, other.lesson.id, hund.id, reader)).status).toBe(404);
    expect(await keys(groupId, reader)).toEqual([]);
  });

  it("hides a word while it is not published and shows the author's edits", async () => {
    const { groupId, owner, reader, path, hund, katze, lesson } = await setup();
    await bookmark(path, lesson.lesson.id, hund.id, reader); await bookmark(path, lesson.lesson.id, katze.id, reader);

    await republish(lesson.path, owner, documentOf(blocks.vocabulary({ ...hund, meaning: "the hound" })));
    const page = await list(groupId, reader);
    expect(page.items.map((item) => [item.word.term, item.word.meaning])).toEqual([["der Hund", "the hound"]]);
    // The hidden word keeps its key, so toggles still show it as bookmarked.
    expect(await keys(groupId, reader)).toHaveLength(2);

    expect((await request(`${lesson.path}/unpublish`, owner, {})).status).toBe(200);
    expect(await terms(groupId, reader)).toEqual([]);
    await publishLesson(lesson.path, owner, (await readLesson(lesson.path, owner)).draft!.version);
    await republish(lesson.path, owner, documentOf(blocks.vocabulary(hund, katze)));
    expect((await terms(groupId, reader)).sort()).toEqual(["der Hund", "die Katze"]);
  });

  it("follows course visibility and removes bookmarks with their lesson", async () => {
    const { groupId, owner, reader, path, hund, lesson } = await setup();
    await bookmark(path, lesson.lesson.id, hund.id, reader);
    expect((await request(`${path}/archive`, owner, {})).status).toBe(200);
    expect(await terms(groupId, reader)).toEqual([]);
    expect((await bookmark(path, lesson.lesson.id, hund.id, reader)).status).toBe(404);
    // A restored course returns as a draft, hidden from the reader until it is published again.
    expect((await request(`${path}/restore`, owner, {})).status).toBe(200);
    expect(await terms(groupId, reader)).toEqual([]);
    expect((await request(`${path}/visibility`, owner, { status: "published" })).status).toBe(200);
    expect(await terms(groupId, reader)).toEqual(["der Hund"]);

    expect((await request(`${path}/lessons/${lesson.lesson.id}`, owner, undefined, "DELETE")).status).toBe(200);
    expect(await keys(groupId, reader)).toEqual([]);
  });

  it("refuses a bookmark beyond the limit", async () => {
    const { groupId, readerId, reader, course, path, hund, katze, lesson } = await setup();
    await bookmark(path, lesson.lesson.id, hund.id, reader);
    // Fill the rest of the allowance directly; the keys need not name indexed words.
    const now = Date.now();
    const rows = Array.from({ length: WORD_BOOKMARKS_MAX - 1 }, () => [groupId, course.id, lesson.lesson.id, crypto.randomUUID(), readerId, now]);
    for (let start = 0; start < rows.length; start += 500) {
      await env.DB.batch(rows.slice(start, start + 500).map((row) => env.DB.prepare(
        "INSERT INTO course_word_bookmarks (group_id, course_id, lesson_id, word_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(...row)));
    }
    const full = await bookmark(path, lesson.lesson.id, katze.id, reader);
    expect(full.status).toBe(409);
    expect(await errorCode(full)).toBe("WORD_BOOKMARKS_FULL");
    // An existing bookmark is still fine at the limit.
    expect((await bookmark(path, lesson.lesson.id, hund.id, reader)).status).toBe(200);
    expect(await keys(groupId, reader)).toHaveLength(WORD_BOOKMARKS_MAX);
  });

  it("denies non-members, former members, other groups, and anonymous requests", async () => {
    const { readerId, groupId, reader, course, path, hund, lesson } = await setup();
    await bookmark(path, lesson.lesson.id, hund.id, reader);
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId);
    const outsider = await signIn("outsider");
    for (const response of [
      await bookmark(path, lesson.lesson.id, hund.id, outsider), await unbookmark(path, lesson.lesson.id, hund.id, outsider),
      await request(`/api/groups/${groupId}/word-bookmarks/keys`, outsider), await request(`/api/groups/${groupId}/word-bookmarks`, outsider),
    ]) {
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("GROUP_NOT_FOUND");
    }
    // Alpha's course, lesson, and word IDs are not reachable through the outsider's own group.
    const nested = await bookmark(coursePath(otherGroup, course.id), lesson.lesson.id, hund.id, outsider);
    expect(nested.status).toBe(404);
    expect(await errorCode(nested)).toBe("COURSE_NOT_FOUND");
    expect((await unbookmark(coursePath(otherGroup, course.id), lesson.lesson.id, hund.id, outsider)).status).toBe(404);
    // A word of beta's own lesson cannot be bookmarked through an alpha course path, and beta's lists never show alpha's rows.
    const betaCourse = await createCourse(otherGroup, outsider);
    const fiets = word("de fiets");
    const betaLesson = await addLesson(otherGroup, betaCourse.id, outsider, "Beta", { document: documentOf(blocks.vocabulary(fiets)) });
    expect((await bookmark(path, betaLesson.lesson.id, fiets.id, reader)).status).toBe(404);
    expect((await bookmark(coursePath(groupId, betaCourse.id), betaLesson.lesson.id, fiets.id, reader)).status).toBe(404);
    await bookmark(coursePath(otherGroup, betaCourse.id), betaLesson.lesson.id, fiets.id, outsider);
    expect(await terms(otherGroup, outsider)).toEqual(["de fiets"]);
    expect(await terms(groupId, reader)).toEqual(["der Hund"]);
    expect((await SELF.fetch(`https://wordinator.test/api/groups/${groupId}/word-bookmarks/keys`)).status).toBe(401);
    expect((await SELF.fetch(`https://wordinator.test${bookmarkPath(path, lesson.lesson.id, hund.id)}`, { method: "PUT" })).status).toBe(401);
    // A former member keeps the rows but cannot read or change them.
    await env.DB.prepare("UPDATE memberships SET state = 'left' WHERE group_id = ? AND user_id = ?").bind(groupId, readerId).run();
    expect((await request(`/api/groups/${groupId}/word-bookmarks`, reader)).status).toBe(404);
    expect((await unbookmark(path, lesson.lesson.id, hund.id, reader)).status).toBe(404);
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM course_word_bookmarks WHERE user_id = ?").bind(readerId).first()).toEqual({ total: 1 });
  });
});
