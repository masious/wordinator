import { env, SELF } from "cloudflare:test";
import { courseResponseSchema, discussionResponseSchema, postPageSchema, postResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "course-feed-password";
let passwordHash: string;

async function seedUser(label: string) {
  const userId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
    .bind(userId, `${label}@example.test`, `${label}@example.test`, passwordHash, label, now, now).run();
  return userId;
}

async function seedGroup(label: string, creatorId: string) {
  const groupId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'de', ?, ?, ?)")
    .bind(groupId, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now).run();
  await join(groupId, creatorId);
  return groupId;
}

async function join(groupId: string, userId: string, state = "active") {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, ?, ?, ?, 'Member', ?)")
    .bind(groupId, userId, state, now, now, now).run();
}

async function signIn(label: string) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${label}@example.test`, password: PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

async function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return SELF.fetch(`https://wordinator.test${path}`, {
    method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createCourse(groupId: string, cookie: string, title = "Deutsch für Anfänger") {
  const response = await request(`/api/groups/${groupId}/courses`, cookie, { title, summary: "Erste Schritte", level: "A1 → early A2" });
  expect(response.status).toBe(201);
  return courseResponseSchema.parse(await response.json()).course;
}

const feed = async (groupId: string, cookie: string) => postPageSchema.parse(await (await request(`/api/groups/${groupId}/posts`, cookie)).json()).items;
const setStatus = (groupId: string, courseId: string, cookie: string, status: "draft" | "published") =>
  request(`/api/groups/${groupId}/courses/${courseId}/visibility`, cookie, { status });
const coursePosts = async (courseId: string) =>
  (await env.DB.prepare("SELECT id FROM posts WHERE course_id = ?").bind(courseId).all<{ id: string }>()).results;

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reactions"), env.DB.prepare("DELETE FROM comments"), env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM courses"),
    env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"),
    env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Course feed presence API", () => {
  it("announces a course once, on its first publication, at the top of the feed", async () => {
    const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, memberId);
    const owner = await signIn("owner"); const member = await signIn("member");
    const course = await createCourse(groupId, owner);
    expect(await feed(groupId, member)).toHaveLength(0);

    expect((await setStatus(groupId, course.id, owner, "published")).status).toBe(200);
    const [post] = await feed(groupId, member);
    expect(post).toMatchObject({
      type: "course", body: "", notes: null, author: { id: ownerId },
      course: { id: course.id, available: true, title: "Deutsch für Anfänger", summary: "Erste Schritte", level: "A1 → early A2", coverUrl: null },
      permissions: { edit: false, delete: false },
    });
    expect((await feed(groupId, owner))[0]!.permissions).toEqual({ edit: false, delete: true });

    // Unpublishing, republishing, archiving, and restoring never add a second post.
    await setStatus(groupId, course.id, owner, "draft");
    await setStatus(groupId, course.id, owner, "published");
    expect((await request(`/api/groups/${groupId}/courses/${course.id}/archive`, owner, {})).status).toBe(200);
    expect((await request(`/api/groups/${groupId}/courses/${course.id}/restore`, owner, {})).status).toBe(200);
    await setStatus(groupId, course.id, owner, "published");
    expect(await coursePosts(course.id)).toHaveLength(1);
    expect((await feed(groupId, member)).map((item) => item.id)).toEqual([post!.id]);

    // The unique course link also rejects a second post written directly.
    await expect(env.DB.prepare("INSERT INTO posts (id, group_id, author_id, type, body, course_id, created_at, updated_at) VALUES (?, ?, ?, 'course', '', ?, 1, 1)")
      .bind(crypto.randomUUID(), groupId, ownerId, course.id).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO posts (id, group_id, author_id, type, body, created_at, updated_at) VALUES (?, ?, ?, 'course', '', 1, 1)")
      .bind(crypto.randomUUID(), groupId, ownerId).run()).rejects.toThrow();
  });

  it("shows the course as unavailable once members can no longer open it", async () => {
    const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, memberId);
    const owner = await signIn("owner"); const member = await signIn("member");
    const course = await createCourse(groupId, owner);
    await setStatus(groupId, course.id, owner, "published");
    const unavailable = { id: course.id, available: false, title: null, summary: null, level: null, coverUrl: null };

    await setStatus(groupId, course.id, owner, "draft");
    expect((await feed(groupId, member))[0]!.course).toEqual(unavailable);
    expect((await feed(groupId, owner))[0]!.course).toMatchObject({ available: true, title: "Deutsch für Anfänger" });

    await setStatus(groupId, course.id, owner, "published");
    await request(`/api/groups/${groupId}/courses/${course.id}/archive`, owner, {});
    expect((await feed(groupId, member))[0]!.course).toEqual(unavailable);
    expect((await feed(groupId, owner))[0]!.course).toEqual(unavailable);
    const detail = postResponseSchema.parse(await (await request(`/api/groups/${groupId}/posts/${(await feed(groupId, member))[0]!.id}`, member)).json());
    expect(detail.post.course).toEqual(unavailable);
  });

  it("keeps visible comments and reactions but refuses editing, pinning, and composer creation", async () => {
    const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, memberId);
    const owner = await signIn("owner"); const member = await signIn("member");
    const course = await createCourse(groupId, owner);
    await setStatus(groupId, course.id, owner, "published");
    const postId = (await feed(groupId, member))[0]!.id;
    const path = `/api/groups/${groupId}/posts/${postId}`;

    const discussion = discussionResponseSchema.parse(await (await request(`${path}/discussion`, member)).json());
    expect(discussion.concealed).toBe(false);
    expect((await request(`${path}/comments`, member, { kind: "reading_response", answers: ["x"] })).status).toBe(400);
    const comment = await request(`${path}/comments`, member, { kind: "text", body: "Ich mache mit!" });
    expect(comment.status).toBe(201);
    const commentId = ((await comment.json()) as { item: { id: string } }).item.id;
    const notice = await env.DB.prepare("SELECT kind FROM notifications WHERE recipient_user_id = ? AND post_id = ?").bind(ownerId, postId).first<{ kind: string }>();
    expect(notice?.kind).toBe("post_response");
    expect((await request(`${path}/reactions`, member, { emoji: "👍", active: true }, "PUT")).status).toBe(200);
    const [post] = await feed(groupId, owner);
    expect(post).toMatchObject({ commentCount: 1, reactionCount: 1 });

    expect((await request(path, owner, { type: "shared_sentence", body: "Hijacked" }, "PATCH")).status).toBe(409);
    expect((await request(`${path}/pin`, owner, { commentId }, "PUT")).status).toBe(400);
    expect((await request(`/api/groups/${groupId}/posts`, owner, { type: "course", body: "Fake" })).status).toBe(400);
    expect((await feed(groupId, owner))[0]!.course?.title).toBe("Deutsch für Anfänger");
  });

  it("does not recreate a removed course post when the course is published again", async () => {
    const ownerId = await seedUser("owner"); const creatorId = await seedUser("creator");
    const groupId = await seedGroup("alpha", creatorId); await join(groupId, ownerId);
    const owner = await signIn("owner"); const creator = await signIn("creator");
    const course = await createCourse(groupId, owner);
    await setStatus(groupId, course.id, owner, "published");
    const postId = (await feed(groupId, creator))[0]!.id;
    expect((await request(`/api/groups/${groupId}/posts/${postId}`, creator, undefined, "DELETE")).status).toBe(200);
    await setStatus(groupId, course.id, owner, "draft");
    await setStatus(groupId, course.id, owner, "published");
    expect(await coursePosts(course.id)).toHaveLength(0);
  });

  it("isolates course posts by group", async () => {
    const ownerId = await seedUser("owner"); const outsiderId = await seedUser("outsider");
    const groupId = await seedGroup("alpha", ownerId); const otherGroupId = await seedGroup("beta", outsiderId);
    const owner = await signIn("owner"); const outsider = await signIn("outsider");
    const course = await createCourse(groupId, owner);
    await setStatus(groupId, course.id, owner, "published");
    const postId = (await feed(groupId, owner))[0]!.id;

    expect(await feed(otherGroupId, outsider)).toHaveLength(0);
    expect((await request(`/api/groups/${groupId}/posts`, outsider)).status).toBe(404);
    expect((await request(`/api/groups/${groupId}/posts/${postId}`, outsider)).status).toBe(404);
    expect((await request(`/api/groups/${otherGroupId}/posts/${postId}`, outsider)).status).toBe(404);
    expect((await request(`/api/groups/${otherGroupId}/posts/${postId}/comments`, outsider, { kind: "text", body: "Hallo" })).status).toBe(404);
    expect((await request(`/api/groups/${otherGroupId}/posts/${postId}/reactions`, outsider, { emoji: "👍", active: true }, "PUT")).status).toBe(404);
    expect((await setStatus(otherGroupId, course.id, outsider, "published")).status).toBe(404);
    expect(await coursePosts(course.id)).toHaveLength(1);
  });
});
