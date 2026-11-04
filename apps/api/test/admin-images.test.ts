import { env } from "cloudflare:test";
import { courseResponseSchema } from "@wordinator/contracts";
import { adminImageFiltersResponseSchema, adminImageReplaceResponseSchema, adminImagesResponseSchema } from "@wordinator/contracts/admin";
import { dialogueScenesResponseSchema, lessonImageUploadResponseSchema } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import { addLesson, blocks, coursePath, createCourse, documentOf, errorCode, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser, signIn } from "./courseApi";
import { fetchWorker } from "./worker";

// The superuser image library (docs/settings-and-administration.md#image-library): listing covers, lesson images, and dialogue
// scene assets with their references, and replacing one image everywhere it is used.

// A 3×2 PNG header is enough for the type sniffing and the reported size.
const png = (width = 3, height = 2) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, width, 0, 0, 0, height]);
async function upload(path: string, cookie: string, bytes: Uint8Array, fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set("image", new File([bytes.slice().buffer as ArrayBuffer], "image.png", { type: "image/png" }));
  return fetchWorker(`https://wordinator.test${path}`, { method: "POST", headers: { cookie }, body: form });
}
const dialogue = (id: string) => ({
  id, type: "dialogue" as const, children: [],
  props: { turns: JSON.stringify([{ speaker: "Anna", text: "Hallo!" }, { speaker: "Bram", text: "Dag Anna." }]) },
});
const objectExists = async (key: string) => (await env.MEDIA.get(key)) !== null;

beforeEach(async () => { await resetDatabase(); });

async function setup() {
  const ownerId = await seedUser("images-owner"); const adminId = await seedUser("images-admin");
  await env.DB.prepare("UPDATE users SET is_superuser = 1, username = 'images_admin' WHERE id = ?").bind(adminId).run();
  await env.DB.prepare("UPDATE users SET username = 'images_owner' WHERE id = ?").bind(ownerId).run();
  const groupId = await seedGroup("images", ownerId);
  const owner = await signIn("images-owner"); const admin = await signIn("images-admin");
  const course = await createCourse(groupId, owner, true, { title: "Picture course", summary: "With images." });
  const cover = await upload(`${coursePath(groupId, course.id)}/cover`, owner, png());
  expect(cover.status).toBe(200);
  const { lesson, path } = await addLesson(groupId, course.id, owner, "Picture lesson", { published: false });
  const image = lessonImageUploadResponseSchema.parse(await (await upload(`${path}/images`, owner, png())).json());
  const unused = lessonImageUploadResponseSchema.parse(await (await upload(`${path}/images`, owner, png())).json());
  const blockId = crypto.randomUUID();
  const draft = await saveDraft(path, owner, documentOf(blocks.heading("At the market"), blocks.image(image.url), dialogue(blockId)), (await readLesson(path, owner)).draft!.version);
  const published = await request(`${path}/publish`, owner, { draftVersion: draft.draftVersion });
  expect(published.status).toBe(200);
  const scene = await upload(`${path}/dialogue-scenes/images`, owner, png(), { blockId, kind: "scene", lineIndex: "1" });
  expect(scene.status).toBe(201);
  const portrait = await upload(`${path}/dialogue-scenes/images`, owner, png(), { blockId, kind: "portrait", speaker: "Anna" });
  expect(portrait.status).toBe(201);
  return { groupId, courseId: course.id, lessonId: lesson.id, path, owner, admin, blockId, image, unused };
}

const list = async (cookie: string, query = "") => {
  const response = await request(`/api/admin/images${query}`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return adminImagesResponseSchema.parse(await response.json());
};

describe("superuser image library access", () => {
  it("refuses anonymous requests and accounts without the superuser flag", async () => {
    const { owner } = await setup();
    for (const path of ["/api/admin/images", "/api/admin/images/filters"]) {
      expect((await fetchWorker(`https://wordinator.test${path}`)).status).toBe(401);
      const refused = await request(path, owner);
      expect(refused.status).toBe(403);
      expect(await errorCode(refused)).toBe("SUPERUSER_REQUIRED");
    }
    expect((await upload("/api/admin/images/replace", owner, png(), { key: "courses/anything.png" })).status).toBe(403);
  });
});

describe("listing images", () => {
  it("lists covers, lesson images, and dialogue assets with their references and usage", async () => {
    const { admin, courseId, lessonId, blockId, image, unused } = await setup();
    const { images, nextCursor } = await list(admin);
    expect(nextCursor).toBeNull();
    expect(images.map((item) => item.kind).sort()).toEqual(["cover", "lesson", "lesson", "portrait", "scene"]);
    const cover = images.find((item) => item.kind === "cover")!;
    expect(cover).toMatchObject({ course: { id: courseId, title: "Picture course", status: "published" }, lesson: null, dialogue: null, usedInPublished: true });
    expect(images.find((item) => item.key === image.key)).toMatchObject({ lesson: { id: lessonId, title: "Picture lesson" }, usedInDraft: true, usedInPublished: true });
    expect(images.find((item) => item.key === unused.key)).toMatchObject({ usedInDraft: false, usedInPublished: false });
    expect(images.find((item) => item.kind === "scene")).toMatchObject({
      width: 3, height: 2, dialogue: { blockId, lineIndex: 1, speaker: null, section: "At the market", line: { speaker: "Bram", text: "Dag Anna." } },
    });
    expect(images.find((item) => item.kind === "portrait")!.dialogue).toMatchObject({ speaker: "Anna", line: null });
    expect(images.every((item) => item.url.endsWith(item.key.split("/").at(-1)!))).toBe(true);
  });

  it("shows details for a dialogue added only to a newer draft", async () => {
    const { admin, owner, path } = await setup();
    const draftId = crypto.randomUUID();
    await saveDraft(path, owner, documentOf(blocks.heading("Work in progress"), dialogue(draftId)), (await readLesson(path, owner)).draft!.version);
    expect((await upload(`${path}/dialogue-scenes/images`, owner, png(), { blockId: draftId, kind: "scene", lineIndex: "0" })).status).toBe(201);
    const image = (await list(admin, "?kind=dialogue")).images.find((item) => item.dialogue?.blockId === draftId);
    expect(image).toMatchObject({ usedInDraft: true, usedInPublished: false, dialogue: {
      section: "Work in progress", line: { speaker: "Anna", text: "Hallo!" },
    } });
  });

  it("filters by kind, course, lesson, and usage, and refuses invalid filters", async () => {
    const { admin, courseId, lessonId, unused } = await setup();
    expect((await list(admin, "?kind=dialogue")).images.map((item) => item.kind).sort()).toEqual(["portrait", "scene"]);
    expect((await list(admin, "?kind=cover")).images).toHaveLength(1);
    expect((await list(admin, `?lessonId=${lessonId}`)).images).toHaveLength(4);
    expect((await list(admin, `?courseId=${courseId}`)).images).toHaveLength(5);
    expect((await list(admin, "?courseId=missing")).images).toHaveLength(0);
    expect((await list(admin, "?usage=unused")).images.map((item) => item.key)).toEqual([unused.key]);
    expect((await list(admin, "?usage=used")).images).toHaveLength(4);
    expect((await request("/api/admin/images?kind=banner", admin)).status).toBe(400);
    expect((await request("/api/admin/images?cursor=nonsense", admin)).status).toBe(400);
  });

  it("pages newest first with a cursor", async () => {
    const { admin, lessonId } = await setup();
    const base = Date.now() - 100_000;
    await env.DB.batch(Array.from({ length: 62 }, (_, index) => env.DB.prepare("INSERT INTO course_media (key, group_id, course_id, lesson_id, created_by, created_at) SELECT ?, group_id, course_id, id, created_by, ? FROM course_lessons WHERE id = ?")
      .bind(`courses/x/lessons/y/${String(index).padStart(3, "0")}.jpg`, base + index, lessonId)));
    const first = await list(admin);
    expect(first.images).toHaveLength(60);
    expect(first.nextCursor).not.toBeNull();
    const second = await list(admin, `?cursor=${encodeURIComponent(first.nextCursor!)}`);
    expect(second.images).toHaveLength(67 - 60);
    expect(second.nextCursor).toBeNull();
    const keys = [...first.images, ...second.images].map((item) => item.key);
    expect(new Set(keys).size).toBe(67);
    const times = [...first.images, ...second.images].map((item) => item.createdAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("lists courses and lessons for the filters", async () => {
    const { admin, courseId, lessonId } = await setup();
    const response = await request("/api/admin/images/filters", admin);
    expect(adminImageFiltersResponseSchema.parse(await response.json())).toEqual({
      courses: [{ id: courseId, title: "Picture course", lessons: [{ id: lessonId, title: "Picture lesson", position: expect.any(Number) }] }],
    });
  });
});

describe("replacing images", () => {
  const replace = async (cookie: string, key: string, bytes = png(4, 4)) => upload("/api/admin/images/replace", cookie, bytes, { key });

  it("swaps a lesson image in both documents, bumps the draft version, and deletes the old object", async () => {
    const { admin, owner, path, image } = await setup();
    const before = await readLesson(path, owner);
    const response = await replace(admin, image.key);
    expect(response.status, await response.clone().text()).toBe(200);
    const result = adminImageReplaceResponseSchema.parse(await response.json());
    expect(result.previousKey).toBe(image.key);
    expect(result.image).toMatchObject({ kind: "lesson", usedInDraft: true, usedInPublished: true });
    expect(result.image.key).toMatch(new RegExp(`^${image.key.split("/").slice(0, -1).join("/")}/`));
    expect(await objectExists(image.key)).toBe(false);
    expect(await objectExists(result.image.key)).toBe(true);
    const after = await readLesson(path, owner);
    expect(after.draft!.version).toBe(before.draft!.version + 1);
    expect(after.changed).toBe(false);
    const stored = await env.DB.prepare("SELECT draft_doc AS draft, published_doc AS published FROM course_lessons WHERE id = ?").bind(after.id).first<{ draft: string; published: string }>();
    for (const doc of [stored!.draft, stored!.published]) { expect(doc).toContain(result.image.key); expect(doc).not.toContain(image.key); }
    expect(await env.DB.prepare("SELECT key FROM course_media WHERE key IN (?, ?)").bind(image.key, result.image.key).all()).toMatchObject({ results: [{ key: result.image.key }] });
    // The previous draft version now conflicts instead of saving the old key back.
    const stale = await request(`${path}/draft`, owner, { document: documentOf(blocks.image(image.url)), draftVersion: before.draft!.version }, "PUT");
    expect(stale.status).toBe(409);
  });

  it("replaces a cover and a dialogue asset in place of their old keys", async () => {
    const { admin, owner, groupId, courseId, path, blockId } = await setup();
    const { images } = await list(admin);
    const cover = images.find((item) => item.kind === "cover")!;
    const replacedCover = adminImageReplaceResponseSchema.parse(await (await replace(admin, cover.key)).json()).image;
    const course = courseResponseSchema.parse(await (await request(coursePath(groupId, courseId), owner)).json()).course;
    expect(course.coverUrl).toBe(replacedCover.url);
    expect(await objectExists(cover.key)).toBe(false);

    const scene = images.find((item) => item.kind === "scene")!;
    const replacedScene = adminImageReplaceResponseSchema.parse(await (await replace(admin, scene.key)).json()).image;
    expect(replacedScene).toMatchObject({ kind: "scene", width: 4, height: 4, createdAt: scene.createdAt, dialogue: { blockId, lineIndex: 1 } });
    expect(replacedScene.key).toContain(`/dialogues/${blockId}/scene/`);
    const scenes = dialogueScenesResponseSchema.parse(await (await request(`${path}/dialogue-scenes`, owner)).json()).scenes;
    expect(scenes[0]!.lineScenes[1]!.sceneUrl).toBe(replacedScene.url);
    expect(await objectExists(scene.key)).toBe(false);
  });

  it("refuses unknown keys and invalid images without changing anything", async () => {
    const { admin, image } = await setup();
    const missing = await replace(admin, "courses/none.png");
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("IMAGE_NOT_FOUND");
    const invalid = await replace(admin, image.key, new Uint8Array([1, 2, 3]));
    expect(invalid.status).toBe(400);
    expect(await errorCode(invalid)).toBe("IMAGE_TYPE_INVALID");
    expect(await objectExists(image.key)).toBe(true);
    const noKey = await upload("/api/admin/images/replace", admin, png());
    expect(noKey.status).toBe(400);
  });
});
