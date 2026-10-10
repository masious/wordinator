import { env, SELF } from "cloudflare:test";
import { wordSearchPageSchema } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser, signIn, word,
} from "./courseApi";

const searchPath = (groupId: string, query: string, extra = "") => `/api/groups/${groupId}/word-search?q=${encodeURIComponent(query)}${extra}`;
async function search(groupId: string, cookie: string, query: string, extra = "") {
  const response = await request(searchPath(groupId, query, extra), cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return wordSearchPageSchema.parse(await response.json());
}
const terms = async (groupId: string, cookie: string, query: string) => (await search(groupId, cookie, query)).items.map((item) => item.word.term);

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const hund = word("der Hund", { meaning: "the dog", forms: "die Hunde" }); const ueber = word("über", { meaning: "over, above" });
  const hundert = word("hundert", { meaning: "a hundred" });
  const lesson = await addLesson(groupId, course.id, owner, "Animals", { document: documentOf(blocks.vocabulary(hund, ueber, hundert), blocks.paragraph("Tiere")) });
  return { ownerId, readerId, groupId, owner, reader, course, hund, ueber, hundert, lesson };
}

beforeEach(resetDatabase);

describe("Library word search", () => {
  it("matches terms, forms, and meanings case- and diacritic-insensitively, term prefixes first", async () => {
    const { groupId, reader, course, lesson, hund } = await setup();
    const page = await search(groupId, reader, "HUND");
    // "hundert" starts with the query; "der Hund" only contains it; "a hundred" matches by meaning but is the same word as hundert.
    expect(page.items.map((item) => item.word.term)).toEqual(["hundert", "der Hund"]);
    expect(page.items[1]).toMatchObject({
      word: { id: hund.id, lessonId: lesson.lesson.id, term: "der Hund", meaning: "the dog", forms: "die Hunde", speech: { term: null, example: null } },
      course: { id: course.id, slug: course.slug, title: "Dutch foundations" }, lesson: { id: lesson.lesson.id, slug: lesson.lesson.slug, title: "Animals" },
    });
    expect(page.nextCursor).toBeNull();
    expect(await terms(groupId, reader, "uber")).toEqual(["über"]);
    expect(await terms(groupId, reader, "  ÜBER ")).toEqual(["über"]);
    expect(await terms(groupId, reader, "dog")).toEqual(["der Hund"]);
    expect(await terms(groupId, reader, "die hunde")).toEqual(["der Hund"]);
    // LIKE wildcards in the query are literal.
    expect(await terms(groupId, reader, "%")).toEqual([]);
    expect(await terms(groupId, reader, "h_nd")).toEqual([]);
    expect(await terms(groupId, reader, "katze")).toEqual([]);
  });

  it("pages with a stable cursor and validates the query", async () => {
    const { groupId, owner, reader, course } = await setup();
    const many = Array.from({ length: 5 }, (_, index) => word(`haus ${index}`));
    await addLesson(groupId, course.id, owner, "Houses", { document: documentOf(blocks.vocabulary(...many)) });
    const seen: string[] = []; let cursor: string | null = null;
    do {
      const page = await search(groupId, reader, "haus", `&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.word.term));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(["haus 0", "haus 1", "haus 2", "haus 3", "haus 4"]);
    for (const path of [`/api/groups/${groupId}/word-search`, searchPath(groupId, "   "), searchPath(groupId, "x".repeat(101)), searchPath(groupId, "haus", "&limit=51")]) {
      const response = await request(path, reader);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_SEARCH");
    }
    const bad = await request(searchPath(groupId, "haus", "&cursor=nonsense"), reader);
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe("INVALID_CURSOR");
  });

  it("hides unpublished lessons, draft and archived courses, and follows republishing", async () => {
    const { groupId, owner, reader, course, lesson, hund } = await setup();
    await addLesson(groupId, course.id, owner, "Draft lesson", { published: false, document: documentOf(blocks.vocabulary(word("der Entwurf"))) });
    expect(await terms(groupId, owner, "entwurf")).toEqual([]);
    // A draft course is visible to its owner only.
    const draftCourse = await createCourse(groupId, owner, false);
    await addLesson(groupId, draftCourse.id, owner, "Secret", { document: documentOf(blocks.vocabulary(word("das Geheimnis"))) });
    expect(await terms(groupId, reader, "geheimnis")).toEqual([]);
    expect(await terms(groupId, owner, "geheimnis")).toEqual(["das Geheimnis"]);
    // Republishing replaces the indexed words and their keys.
    await saveDraft(lesson.path, owner, documentOf(blocks.vocabulary({ ...hund, meaning: "the hound" })), (await readLesson(lesson.path, owner)).draft!.version);
    expect((await request(`${lesson.path}/publish`, owner, { draftVersion: (await readLesson(lesson.path, owner)).draft!.version })).status).toBe(200);
    expect(await terms(groupId, reader, "hound")).toEqual(["der Hund"]);
    expect(await terms(groupId, reader, "dog")).toEqual([]);
    expect((await request(`${lesson.path}/unpublish`, owner, {})).status).toBe(200);
    expect(await terms(groupId, reader, "hund")).toEqual([]);
    await addLesson(groupId, course.id, owner, "Again", { document: documentOf(blocks.vocabulary(word("der Hund"))) });
    expect(await terms(groupId, reader, "hund")).toEqual(["der Hund"]);
    // Archived courses are left out for everyone, the owner included.
    expect((await request(`${coursePath(groupId, course.id)}/archive`, owner, {})).status).toBe(200);
    expect(await terms(groupId, reader, "hund")).toEqual([]);
    expect(await terms(groupId, owner, "hund")).toEqual([]);
  });

  it("fills the keys of words indexed before the search keys existed", async () => {
    const { groupId, reader } = await setup();
    await env.DB.prepare("UPDATE course_lesson_words SET term_key = NULL, search_key = NULL").run();
    expect(await terms(groupId, reader, "UBER")).toEqual(["über"]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM course_lesson_words WHERE term_key IS NULL OR search_key IS NULL").first()).toEqual({ total: 0 });
  });

  it("denies anonymous requests, non-members, former members, and other groups", async () => {
    const { groupId, readerId, reader } = await setup();
    expect((await SELF.fetch(`https://wordinator.test${searchPath(groupId, "hund")}`)).status).toBe(401);
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId);
    const outsider = await signIn("outsider");
    const denied = await request(searchPath(groupId, "hund"), outsider);
    expect(denied.status).toBe(404);
    expect(await errorCode(denied)).toBe("GROUP_NOT_FOUND");
    // Alpha's words never appear through another group.
    expect(await terms(otherGroup, outsider, "hund")).toEqual([]);
    await env.DB.prepare("UPDATE memberships SET state = 'left' WHERE group_id = ? AND user_id = ?").bind(groupId, readerId).run();
    expect((await request(searchPath(groupId, "hund"), reader)).status).toBe(404);
  });
});
