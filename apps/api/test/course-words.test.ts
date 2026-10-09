import { env, SELF } from "cloudflare:test";
import { courseWordsResponseSchema, lessonNotReadySchema } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser,
  signIn, word,
} from "./courseApi";

const complete = (path: string, lessonId: string, cookie: string) => request(`${path}/lessons/${lessonId}/completion`, cookie, undefined, "PUT");
const recap = async (path: string, cookie: string) => {
  const response = await request(`${path}/words`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return courseWordsResponseSchema.parse(await response.json()).words;
};
const terms = async (path: string, cookie: string) => (await recap(path, cookie)).map((entry) => entry.term);
const indexed = async (lessonId: string) => (await env.DB.prepare("SELECT word_id AS id, term, position, group_id AS groupId FROM course_lesson_words WHERE lesson_id = ? ORDER BY position")
  .bind(lessonId).all<{ id: string; term: string; position: number; groupId: string }>()).results;

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  const hund = word("der Hund", { forms: "die Hunde", example: "Der Hund bellt.", note: "Masculine." });
  const katze = word("die Katze");
  const first = await addLesson(groupId, course.id, owner, "Animals", {
    document: documentOf(blocks.paragraph("Tiere"), blocks.vocabulary(hund), blocks.example("Die Katze schläft."), blocks.vocabulary(katze)),
  });
  const second = await addLesson(groupId, course.id, owner, "Home", {
    document: documentOf(blocks.vocabulary(word("das Haus"), word(" DER HUND "))),
  });
  return { ownerId, readerId, groupId, owner, reader, course, path, hund, katze, first, second };
}

async function republish(lessonPath: string, cookie: string, document: unknown) {
  await saveDraft(lessonPath, cookie, document, (await readLesson(lessonPath, cookie)).draft!.version);
  return publishLesson(lessonPath, cookie, (await readLesson(lessonPath, cookie)).draft!.version);
}

beforeEach(resetDatabase);

describe("Course word index", () => {
  it("indexes published words in document order and keeps the index in step with the published document", async () => {
    const { groupId, owner, hund, katze, first } = await setup();
    expect(await indexed(first.lesson.id)).toEqual([
      { id: hund.id, term: "der Hund", position: 0, groupId }, { id: katze.id, term: "die Katze", position: 1, groupId },
    ]);
    const row = await env.DB.prepare("SELECT forms, example, note FROM course_lesson_words WHERE word_id = ?").bind(katze.id).first();
    expect(row).toEqual({ forms: null, example: null, note: null });

    // Draft edits leave the index alone until they are published.
    const vogel = word("der Vogel");
    const edited = documentOf(blocks.vocabulary(vogel, katze));
    await saveDraft(first.path, owner, edited, (await readLesson(first.path, owner)).draft!.version);
    expect((await indexed(first.lesson.id)).map((entry) => entry.term)).toEqual(["der Hund", "die Katze"]);
    // A stale publish is refused without touching the index.
    const stale = await request(`${first.path}/publish`, owner, { draftVersion: 1 });
    expect(stale.status).toBe(409);
    expect((await indexed(first.lesson.id)).map((entry) => entry.term)).toEqual(["der Hund", "die Katze"]);
    await publishLesson(first.path, owner, (await readLesson(first.path, owner)).draft!.version);
    expect((await indexed(first.lesson.id)).map((entry) => [entry.term, entry.position])).toEqual([["der Vogel", 0], ["die Katze", 1]]);

    // Discarding keeps the published document, so the index is unchanged.
    await saveDraft(first.path, owner, documentOf(blocks.paragraph("No words")), (await readLesson(first.path, owner)).draft!.version);
    expect((await request(`${first.path}/discard`, owner, {})).status).toBe(200);
    expect(await indexed(first.lesson.id)).toHaveLength(2);

    expect((await request(`${first.path}/unpublish`, owner, {})).status).toBe(200);
    expect(await indexed(first.lesson.id)).toEqual([]);
    await publishLesson(first.path, owner, (await readLesson(first.path, owner)).draft!.version);
    expect(await indexed(first.lesson.id)).toHaveLength(2);
    await republish(first.path, owner, documentOf(blocks.paragraph("No words any more")));
    expect(await indexed(first.lesson.id)).toEqual([]);
  });

  it("removes a deleted lesson's rows", async () => {
    const { owner, path, first } = await setup();
    expect((await request(`${path}/lessons/${first.lesson.id}`, owner, undefined, "DELETE")).status).toBe(200);
    expect(await indexed(first.lesson.id)).toEqual([]);
  });

  it("refuses to publish words without a term or meaning", async () => {
    const { owner, first } = await setup();
    const empty = word(" ", { meaning: "" });
    const block = blocks.vocabulary(word("das Boot"), empty);
    await saveDraft(first.path, owner, documentOf(block), (await readLesson(first.path, owner)).draft!.version);
    const response = await request(`${first.path}/publish`, owner, { draftVersion: (await readLesson(first.path, owner)).draft!.version });
    expect(response.status).toBe(422);
    expect(lessonNotReadySchema.parse(await response.json()).problems).toEqual([{ blockId: block.id, wordId: empty.id, problem: "word-empty" }]);
    expect((await indexed(first.lesson.id)).map((entry) => entry.term)).toEqual(["der Hund", "die Katze"]);
  });
});

describe("Course word recap", () => {
  it("lists words of finished, currently published lessons in lesson and document order without repeated terms", async () => {
    const { owner, reader, groupId, course, path, hund, first, second } = await setup();
    expect(await recap(path, reader)).toEqual([]);
    await complete(path, second.lesson.id, reader);
    expect(await terms(path, reader)).toEqual(["das Haus", "DER HUND"]);
    await complete(path, first.lesson.id, reader);
    const words = await recap(path, reader);
    // " DER HUND " repeats "der Hund" (trimmed, case-insensitive), so only the first lesson's entry is kept.
    expect(words.map((entry) => entry.term)).toEqual(["der Hund", "die Katze", "das Haus"]);
    expect(words[0]).toEqual({ id: hund.id, lessonId: first.lesson.id, term: "der Hund", meaning: "meaning of der Hund", forms: "die Hunde", example: "Der Hund bellt.", note: "Masculine.", speech: { term: null, example: null } });
    // Lesson order follows the outline.
    expect((await request(`${path}/lessons/order`, owner, { ids: [second.lesson.id, first.lesson.id] }, "PUT")).status).toBe(200);
    expect(await terms(path, reader)).toEqual(["das Haus", "DER HUND", "die Katze"]);
    // Recap is per viewer: the owner has finished nothing.
    expect(await recap(path, owner)).toEqual([]);
    // Unpublished lessons drop out and return on republishing, with their latest published words.
    await request(`${path}/lessons/${second.lesson.id}/unpublish`, owner, {});
    expect(await terms(path, reader)).toEqual(["der Hund", "die Katze"]);
    await publishLesson(second.path, owner, (await readLesson(second.path, owner)).draft!.version);
    expect(await terms(path, reader)).toEqual(["das Haus", "DER HUND", "die Katze"]);
    await republish(second.path, owner, documentOf(blocks.vocabulary(word("der Garten"))));
    expect(await terms(path, reader)).toEqual(["der Garten", "der Hund", "die Katze"]);
    // A lesson the reader has not finished never contributes.
    await addLesson(groupId, course.id, owner, "Unfinished", { document: documentOf(blocks.vocabulary(word("das Auto"))) });
    expect(await terms(path, reader)).not.toContain("das Auto");
  });

  it("follows course visibility for drafts and archived courses", async () => {
    const { groupId, owner, reader, path, first } = await setup();
    await complete(path, first.lesson.id, reader); await complete(path, first.lesson.id, owner);
    await request(`${path}/archive`, owner, {});
    expect((await request(`${path}/words`, reader)).status).toBe(404);
    // The owner, who is also the group creator here, can still see the archived course and its recap.
    expect(await terms(path, owner)).toEqual(["der Hund", "die Katze"]);
    const draftCourse = await createCourse(groupId, owner, false);
    expect((await request(`${coursePath(groupId, draftCourse.id)}/words`, reader)).status).toBe(404);
  });

  it("denies non-members, former members, other groups, and anonymous requests", async () => {
    const { readerId, groupId, reader, course, path, first } = await setup();
    await complete(path, first.lesson.id, reader);
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId);
    const outsider = await signIn("outsider");
    const denied = await request(`${path}/words`, outsider);
    expect(denied.status).toBe(404);
    expect(await errorCode(denied)).toBe("GROUP_NOT_FOUND");
    // A course ID from another group is not reachable through the outsider's own group.
    const nested = await request(`${coursePath(otherGroup, course.id)}/words`, outsider);
    expect(nested.status).toBe(404);
    expect(await errorCode(nested)).toBe("COURSE_NOT_FOUND");
    // Another group's own course with a finished lesson never leaks alpha's words.
    const betaCourse = await createCourse(otherGroup, outsider);
    const betaLesson = await addLesson(otherGroup, betaCourse.id, outsider, "Beta", { document: documentOf(blocks.vocabulary(word("het fiets"))) });
    await complete(coursePath(otherGroup, betaCourse.id), betaLesson.lesson.id, outsider);
    expect(await terms(coursePath(otherGroup, betaCourse.id), outsider)).toEqual(["het fiets"]);
    expect(await terms(path, reader)).toEqual(["der Hund", "die Katze"]);
    expect((await request(`${coursePath(groupId, betaCourse.id)}/words`, reader)).status).toBe(404);
    expect((await SELF.fetch(`https://wordinator.test${path}/words`)).status).toBe(401);
    await env.DB.prepare("UPDATE memberships SET state = 'left' WHERE group_id = ? AND user_id = ?").bind(groupId, readerId).run();
    expect((await request(`${path}/words`, reader)).status).toBe(404);
  });
});
