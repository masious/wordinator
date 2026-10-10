import { env, SELF } from "cloudflare:test";
import { outlineResponseSchema } from "@wordinator/contracts";
import { courseDetailResponseSchema, lessonImageUploadResponseSchema } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser,
  signIn, word,
} from "./courseApi";

// The course page's per-lesson actions (Review words, Practise again) are offered from counts in the outline, so learners never
// load a lesson just to find out it has nothing to review.
const practice = { instruction: "Vertaal.", items: [{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] }, { prompt: "No." }] };
const columns = (...children: unknown[][]) => ({
  id: crypto.randomUUID(), type: "columnList", props: {},
  children: children.map((column) => ({ id: crypto.randomUUID(), type: "column", props: { width: 1 }, children: column })),
});
const counts = (outline: { title: string; wordCount: number; practiceCount: number }[]) =>
  outline.map(({ title, wordCount, practiceCount }) => [title, wordCount, practiceCount]);

async function readCourse(path: string, cookie: string) {
  const response = await request(path, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return courseDetailResponseSchema.parse(await response.json());
}

// A 3×2 PNG header is enough for the upload's type sniffing.
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 3, 0, 0, 0, 2]);
async function uploadImage(lessonPathValue: string, cookie: string) {
  const form = new FormData(); form.set("image", new File([png.slice().buffer as ArrayBuffer], "picture.png", { type: "image/png" }));
  const response = await SELF.fetch(`https://wordinator.test${lessonPathValue}/images`, { method: "POST", headers: { cookie }, body: form });
  expect(response.status).toBe(201);
  return lessonImageUploadResponseSchema.parse(await response.json());
}
const images = (outline: { title: string; imageUrl: string | null }[]) => outline.map(({ title, imageUrl }) => [title, imageUrl]);

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  const rich = await addLesson(groupId, course.id, owner, "Rich", {
    document: documentOf(
      blocks.paragraph("Thuis"), blocks.vocabulary(word("het huis"), word("de tuin")), blocks.practice(practice),
      columns([blocks.paragraph("Links")], [blocks.practice(practice), blocks.vocabulary(word("het balkon"))]),
    ),
  });
  const plain = await addLesson(groupId, course.id, owner, "Plain", { document: documentOf(blocks.paragraph("Alleen tekst.")) });
  const draft = await addLesson(groupId, course.id, owner, "Draft", { published: false, document: documentOf(blocks.vocabulary(word("de kat")), blocks.practice(practice)) });
  return { readerId, groupId, owner, reader, course, path, rich, plain, draft };
}

beforeEach(resetDatabase);

describe("Lesson action counts", () => {
  it("counts the published document's words and practices, including those inside columns", async () => {
    const { path, reader, owner } = await setup();
    // Readers see only published lessons.
    expect(counts((await readCourse(path, reader)).outline)).toEqual([["Rich", 3, 2], ["Plain", 0, 0]]);
    // Editors also see the unpublished lesson, which offers nothing to review until it is published.
    expect(counts((await readCourse(path, owner)).outline)).toEqual([["Rich", 3, 2], ["Plain", 0, 0], ["Draft", 0, 0]]);
  });

  it("follows publishing, not draft edits, and carries the counts on lesson reads and reorders", async () => {
    const { path, owner, reader, rich, plain, draft } = await setup();
    // A saved draft with more words changes nothing until it is published.
    await saveDraft(plain.path, owner, documentOf(blocks.vocabulary(word("het raam")), blocks.practice(practice)), (await readLesson(plain.path, owner)).draft!.version);
    expect(counts((await readCourse(path, reader)).outline)).toEqual([["Rich", 3, 2], ["Plain", 0, 0]]);
    await publishLesson(plain.path, owner, (await readLesson(plain.path, owner)).draft!.version);
    await publishLesson(draft.path, owner, (await readLesson(draft.path, owner)).draft!.version);
    expect(counts((await readCourse(path, reader)).outline)).toEqual([["Rich", 3, 2], ["Plain", 1, 1], ["Draft", 1, 1]]);
    // A lesson read by ID carries the same counts.
    const read = await readLesson(rich.path, reader);
    expect([read.wordCount, read.practiceCount]).toEqual([3, 2]);
    // Unpublishing removes them again.
    expect((await request(`${rich.path}/unpublish`, owner, {})).status).toBe(200);
    const reordered = await request(`${path}/lessons/order`, owner, { ids: [draft.lesson.id, plain.lesson.id, rich.lesson.id] }, "PUT");
    expect(reordered.status).toBe(200);
    expect(counts(outlineResponseSchema.parse(await reordered.json()).outline)).toEqual([["Draft", 1, 1], ["Plain", 1, 1], ["Rich", 0, 0]]);
  });

  it("never exposes another group's counts and denies outsiders, former members, and anonymous readers", async () => {
    const { readerId, groupId, reader, course, path } = await setup();
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId);
    const outsider = await signIn("outsider");
    const denied = await request(path, outsider);
    expect(denied.status).toBe(404);
    expect(await errorCode(denied)).toBe("GROUP_NOT_FOUND");
    const nested = await request(coursePath(otherGroup, course.id), outsider);
    expect(nested.status).toBe(404);
    expect(await errorCode(nested)).toBe("COURSE_NOT_FOUND");
    // A course in another group counts only its own lessons.
    const betaCourse = await createCourse(otherGroup, outsider);
    await addLesson(otherGroup, betaCourse.id, outsider, "Beta", { document: documentOf(blocks.vocabulary(word("de fiets"))) });
    expect(counts((await readCourse(coursePath(otherGroup, betaCourse.id), outsider)).outline)).toEqual([["Beta", 1, 0]]);
    expect(counts((await readCourse(path, reader)).outline)).toEqual([["Rich", 3, 2], ["Plain", 0, 0]]);
    expect((await request(coursePath(groupId, betaCourse.id), reader)).status).toBe(404);
    expect((await SELF.fetch(`https://wordinator.test${path}`)).status).toBe(401);
    await env.DB.prepare("UPDATE memberships SET state = 'left' WHERE group_id = ? AND user_id = ?").bind(groupId, readerId).run();
    expect((await request(path, reader)).status).toBe(404);
  });

  it("hides an archived course's counts from readers", async () => {
    const { path, owner, reader } = await setup();
    expect((await request(`${path}/archive`, owner, {})).status).toBe(200);
    expect((await request(path, reader)).status).toBe(404);
    expect(counts((await readCourse(path, owner)).outline)).toEqual([["Rich", 3, 2], ["Plain", 0, 0], ["Draft", 0, 0]]);
  });

  it("offers the first uploaded image of the published document, or of an unpublished lesson's draft to editors", async () => {
    const { path, owner, reader, plain, draft } = await setup();
    const first = await uploadImage(plain.path, owner); const second = await uploadImage(plain.path, owner);
    const drafted = await uploadImage(draft.path, owner);
    // Document order at any depth: the image inside the columns comes before the later top-level one.
    await saveDraft(plain.path, owner, documentOf(blocks.paragraph("Tekst"), columns([blocks.image(first.url, "De tuin")], [blocks.paragraph("Rechts")]), blocks.image(second.url)),
      (await readLesson(plain.path, owner)).draft!.version);
    await saveDraft(draft.path, owner, documentOf(blocks.image("", ""), blocks.image(drafted.url, "De kat")), (await readLesson(draft.path, owner)).draft!.version);
    // A draft image of a published lesson is not shown until it is published. The draft's unfinished upload is skipped.
    expect(images((await readCourse(path, reader)).outline)).toEqual([["Rich", null], ["Plain", null]]);
    expect(images((await readCourse(path, owner)).outline)).toEqual([["Rich", null], ["Plain", null], ["Draft", drafted.url]]);
    await publishLesson(plain.path, owner, (await readLesson(plain.path, owner)).draft!.version);
    expect(images((await readCourse(path, reader)).outline)).toEqual([["Rich", null], ["Plain", first.url]]);
    expect((await readLesson(plain.path, reader)).imageUrl).toEqual(first.url);
  });
});
