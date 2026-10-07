import { env, SELF } from "cloudflare:test";
import { courseResponseSchema } from "@wordinator/contracts";
import { lessonImageUploadResponseSchema, lessonResponseSchema } from "@wordinator/contracts/lesson-document";
import { beforeAll, describe, expect, it } from "vitest";
import { sweepLessonMedia } from "../src/app";
import { hashPassword } from "../src/auth";

const PASSWORD = "course-media-password"; let passwordHash: string;
async function signIn(email: string) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}
async function coverRequest(path: string, cookie: string, bytes: Uint8Array) {
  const form = new FormData(); form.set("image", new File([bytes.slice().buffer as ArrayBuffer], "cover.png", { type: "image/png" }));
  return SELF.fetch(`https://wordinator.test${path}`, { method: "POST", headers: { cookie }, body: form });
}
beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });

describe("Course cover media", () => {
  it("stores covers under courses/, limits uploads to the owner, and cleans superseded covers", async () => {
    const ownerId = crypto.randomUUID(); const memberId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const courseId = crypto.randomUUID(); const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, 'cover-owner@test.local', 'cover-owner@test.local', ?, 'Cover owner', 0, ?, ?)").bind(ownerId, passwordHash, now, now),
      env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, 'cover-member@test.local', 'cover-member@test.local', ?, 'Cover member', 0, ?, ?)").bind(memberId, passwordHash, now, now),
      env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Cover group', 'nl', ?, ?, ?)").bind(groupId, ownerId, "c".repeat(40), now, now),
      env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Cover owner', ?)").bind(groupId, ownerId, now, now, now),
      env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Cover member', ?)").bind(groupId, memberId, now, now, now),
      env.DB.prepare("INSERT INTO courses (id, group_id, owner_id, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, 'Course', 'Summary', 'published', ?, ?)").bind(courseId, groupId, ownerId, now, now),
    ]);
    const owner = await signIn("cover-owner@test.local"); const member = await signIn("cover-member@test.local");
    const path = `/api/groups/${groupId}/courses/${courseId}/cover`;
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82]);
    expect((await coverRequest(path, member, png)).status).toBe(403);
    expect((await coverRequest(path, owner, new Uint8Array([1, 2, 3]))).status).toBe(400);
    const first = await coverRequest(path, owner, png); expect(first.status).toBe(200);
    const firstUrl = (await first.json<{ url: string }>()).url;
    expect(firstUrl).toContain("/api/media/courses/");
    expect((await SELF.fetch(firstUrl)).status).toBe(200);
    const second = await coverRequest(path, owner, new Uint8Array([...png, 1])); expect(second.status).toBe(200);
    expect((await SELF.fetch(firstUrl)).status).toBe(404);
    const course = courseResponseSchema.parse(await (await SELF.fetch(`https://wordinator.test/api/groups/${groupId}/courses/${courseId}`, { headers: { cookie: member } })).json()).course;
    expect(course.coverUrl).toBe((await second.json<{ url: string }>()).url);
    expect((await SELF.fetch(`https://wordinator.test${path}`, { method: "DELETE", headers: { cookie: owner } })).status).toBe(200);
    expect((await SELF.fetch(course.coverUrl!)).status).toBe(404);
  });

  it("uploads lesson images per lesson, accepts only this lesson's keys, and cleans up unreferenced images", async () => {
    const ownerId = crypto.randomUUID(); const readerId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const courseId = crypto.randomUUID(); const now = Date.now();
    const lessonIds = [crypto.randomUUID(), crypto.randomUUID()];
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, 'lesson-owner@test.local', 'lesson-owner@test.local', ?, 'Lesson owner', 0, ?, ?)").bind(ownerId, passwordHash, now, now),
      env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, 'lesson-reader@test.local', 'lesson-reader@test.local', ?, 'Lesson reader', 0, ?, ?)").bind(readerId, passwordHash, now, now),
      env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Lesson group', 'nl', ?, ?, ?)").bind(groupId, ownerId, "l".repeat(40), now, now),
      env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Lesson owner', ?)").bind(groupId, ownerId, now, now, now),
      env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Lesson reader', ?)").bind(groupId, readerId, now, now, now),
      env.DB.prepare("INSERT INTO courses (id, group_id, owner_id, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, 'Course', 'Summary', 'published', ?, ?)").bind(courseId, groupId, ownerId, now, now),
      ...lessonIds.map((id, position) => env.DB.prepare("INSERT INTO course_lessons (id, group_id, course_id, title, position, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 'Lesson', ?, ?, ?, ?, ?)")
        .bind(id, groupId, courseId, position, ownerId, ownerId, now, now)),
    ]);
    const owner = await signIn("lesson-owner@test.local"); const reader = await signIn("lesson-reader@test.local");
    const lessonPath = (lessonId: string) => `/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId}`;
    const path = lessonPath(lessonIds[0]!);
    const send = (url: string, body: unknown, method = "POST") => SELF.fetch(`https://wordinator.test${url}`, { method, headers: { cookie: owner, "content-type": "application/json" }, body: JSON.stringify(body) });
    // A 3×2 PNG header is enough for the type sniffing and the reported size.
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 3, 0, 0, 0, 2]);
    expect((await coverRequest(`${path}/images`, reader, png)).status).toBe(403);
    expect((await coverRequest(`${path}/images`, owner, new Uint8Array([1, 2, 3]))).status).toBe(400);
    const upload = async (lessonPathValue: string) => {
      const response = await coverRequest(`${lessonPathValue}/images`, owner, png);
      expect(response.status).toBe(201);
      return lessonImageUploadResponseSchema.parse(await response.json());
    };
    const kept = await upload(path); const dropped = await upload(path); const foreign = await upload(lessonPath(lessonIds[1]!));
    expect(kept).toMatchObject({ width: 3, height: 2 });
    expect(kept.key).toMatch(new RegExp(`^courses/${courseId}/lessons/${lessonIds[0]}/`));

    const image = (url: string) => ({
      id: crypto.randomUUID(), type: "image", props: { textAlignment: "left", backgroundColor: "default", name: "Alt", url, caption: "", showPreview: true }, children: [],
    });
    const document = (...urls: string[]) => ({ schemaVersion: 2, blocks: urls.map(image) });
    // Another lesson's upload and a URL outside the media base are refused.
    expect((await send(`${path}/draft`, { document: document(foreign.url), draftVersion: 1 }, "PUT")).status).toBe(400);
    expect((await send(`${path}/draft`, { document: document(kept.url.replace("/api/media/", "/elsewhere/")), draftVersion: 1 }, "PUT")).status).toBe(400);
    expect((await send(`${path}/draft`, { document: document(kept.url, dropped.url), draftVersion: 1 }, "PUT")).status).toBe(200);
    // Documents store keys and return URLs.
    const stored = await env.DB.prepare("SELECT draft_doc AS draftDoc FROM course_lessons WHERE id = ?").bind(lessonIds[0]).first<{ draftDoc: string }>();
    expect(stored!.draftDoc).toContain(`"url":"${kept.key}"`);
    expect((await send(`${path}/draft`, { document: document(kept.url), draftVersion: 2 }, "PUT")).status).toBe(200);

    // Publishing keeps recent uploads (they may belong to an editor's unsaved change) and removes older unreferenced ones.
    expect((await send(`${path}/publish`, { draftVersion: 3 })).status).toBe(200);
    expect((await SELF.fetch(dropped.url)).status).toBe(200);
    await env.DB.prepare("UPDATE course_media SET created_at = ? WHERE lesson_id = ?").bind(now - 2 * 24 * 60 * 60 * 1000, lessonIds[0]).run();
    expect((await send(`${path}/draft`, { document: document(kept.url, dropped.url), draftVersion: 3 }, "PUT")).status).toBe(200);
    expect((await send(`${path}/discard`, {})).status).toBe(200);
    expect((await SELF.fetch(dropped.url)).status).toBe(404);
    expect((await SELF.fetch(kept.url)).status).toBe(200);
    const read = lessonResponseSchema.parse(await (await SELF.fetch(`https://wordinator.test${path}`, { headers: { cookie: reader } })).json()).lesson;
    expect(read.document!.blocks[0]).toMatchObject({ type: "image", props: { url: kept.url } });
    const keys = await env.DB.prepare("SELECT key FROM course_media WHERE lesson_id = ?").bind(lessonIds[0]).all<{ key: string }>();
    expect(keys.results.map((row) => row.key)).toEqual([kept.key]);

    // Deleting the lesson deletes its images.
    expect((await SELF.fetch(`https://wordinator.test${path}`, { method: "DELETE", headers: { cookie: owner } })).status).toBe(200);
    expect((await SELF.fetch(kept.url)).status).toBe(404);
  });

  it("sweeps old lesson images that neither document references", async () => {
    const ownerId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const courseId = crypto.randomUUID(); const lessonId = crypto.randomUUID(); const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, 'sweep-owner@test.local', 'sweep-owner@test.local', ?, 'Sweep owner', 0, ?, ?)").bind(ownerId, passwordHash, now, now),
      env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Sweep group', 'nl', ?, ?, ?)").bind(groupId, ownerId, "s".repeat(40), now, now),
      env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Sweep owner', ?)").bind(groupId, ownerId, now, now, now),
      env.DB.prepare("INSERT INTO courses (id, group_id, owner_id, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, 'Course', 'Summary', 'published', ?, ?)").bind(courseId, groupId, ownerId, now, now),
      env.DB.prepare("INSERT INTO course_lessons (id, group_id, course_id, title, position, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 'Lesson', 0, ?, ?, ?, ?)").bind(lessonId, groupId, courseId, ownerId, ownerId, now, now),
    ]);
    const owner = await signIn("sweep-owner@test.local");
    const path = `/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId}`;
    const send = (url: string, body: unknown, method = "POST") => SELF.fetch(`https://wordinator.test${url}`, { method, headers: { cookie: owner, "content-type": "application/json" }, body: JSON.stringify(body) });
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 3, 0, 0, 0, 2]);
    const upload = async () => lessonImageUploadResponseSchema.parse(await (await coverRequest(`${path}/images`, owner, png)).json());
    const published = await upload(); const drafted = await upload(); const removed = await upload(); const fresh = await upload();
    const image = (url: string) => ({
      id: crypto.randomUUID(), type: "image", props: { textAlignment: "left", backgroundColor: "default", name: "Alt", url, caption: "", showPreview: true }, children: [],
    });
    const document = (...urls: string[]) => ({ schemaVersion: 2, blocks: urls.map(image) });
    // `published` is kept by the published document, `drafted` by the draft; `removed` was dropped from the draft.
    expect((await send(`${path}/draft`, { document: document(published.url, removed.url), draftVersion: 1 }, "PUT")).status).toBe(200);
    expect((await send(`${path}/publish`, { draftVersion: 2 })).status).toBe(200);
    expect((await send(`${path}/draft`, { document: document(drafted.url), draftVersion: 2 }, "PUT")).status).toBe(200);
    await env.DB.prepare("UPDATE course_media SET created_at = ? WHERE lesson_id = ? AND key != ?").bind(now - 2 * 24 * 60 * 60 * 1000, lessonId, fresh.key).run();
    // Simulate a later published version that no longer shows `removed`, without the cleanup a real publish would run.
    await env.DB.prepare("UPDATE course_lessons SET published_doc = json(?) WHERE id = ?").bind(JSON.stringify({ schemaVersion: 2, blocks: [{ ...image(published.key) }] }), lessonId).run();

    expect(await sweepLessonMedia(env as never)).toBe(1);
    expect((await SELF.fetch(removed.url)).status).toBe(404);
    for (const kept of [published, drafted, fresh]) expect((await SELF.fetch(kept.url)).status).toBe(200);
    const keys = await env.DB.prepare("SELECT key FROM course_media WHERE lesson_id = ? ORDER BY key").bind(lessonId).all<{ key: string }>();
    expect(keys.results.map((row) => row.key)).toEqual([published.key, drafted.key, fresh.key].sort());
    expect(await sweepLessonMedia(env as never)).toBe(0);
  });
});
