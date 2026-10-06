import { env, SELF } from "cloudflare:test";
import { courseResponseSchema } from "@wordinator/contracts";
import { beforeAll, describe, expect, it } from "vitest";
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
});
