import { env, SELF } from "cloudflare:test";
import { coursePageSchema, courseResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "course-shell-password";
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

const library = async (groupId: string, cookie: string) => coursePageSchema.parse(await (await request(`/api/groups/${groupId}/courses`, cookie)).json());

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM courses"), env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"),
    env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Course shell API", () => {
  it("creates owner-only drafts, publishes them to members, and lists newest first with cursors", async () => {
    const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, memberId);
    const owner = await signIn("owner"); const member = await signIn("member");
    const course = await createCourse(groupId, owner);
    expect(course).toMatchObject({ status: "draft", level: "A1 → early A2", intendedLearner: null, coverUrl: null, permissions: { edit: true, publish: true, archive: true, removeContent: true } });
    expect((await library(groupId, member)).items).toHaveLength(0);
    expect((await request(`/api/groups/${groupId}/courses/${course.id}`, member)).status).toBe(404);

    const published = await request(`/api/groups/${groupId}/courses/${course.id}/visibility`, owner, { status: "published" });
    expect(courseResponseSchema.parse(await published.json()).course.status).toBe("published");
    const seen = courseResponseSchema.parse(await (await request(`/api/groups/${groupId}/courses/${course.id}`, member)).json()).course;
    expect(seen.permissions).toEqual({
      edit: false, publish: false, archive: false, removeContent: false, contribute: false, requestContribution: true, leaveContribution: false, manageContributors: false,
    });

    const second = await createCourse(groupId, owner, "Second");
    const first = coursePageSchema.parse(await (await request(`/api/groups/${groupId}/courses?limit=1`, owner)).json());
    expect(first.items.map((item) => item.id)).toEqual([second.id]);
    const next = coursePageSchema.parse(await (await request(`/api/groups/${groupId}/courses?limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`, owner)).json());
    expect(next.items.map((item) => item.id)).toEqual([course.id]); expect(next.nextCursor).toBeNull();
    expect((await request(`/api/groups/${groupId}/courses?cursor=bogus`, owner)).status).toBe(400);
  });

  it("validates input and limits editing and publishing to the owner", async () => {
    const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, memberId);
    const owner = await signIn("owner"); const member = await signIn("member");
    expect((await request(`/api/groups/${groupId}/courses`, owner, { title: " ", summary: "x" })).status).toBe(400);
    expect((await request(`/api/groups/${groupId}/courses`, owner, { title: "x".repeat(201), summary: "x" })).status).toBe(400);
    const memberCourse = await createCourse(groupId, member);
    await request(`/api/groups/${groupId}/courses/${memberCourse.id}/visibility`, member, { status: "published" });
    // The group creator moderates by archiving, never by editing or publishing someone else's course.
    expect((await request(`/api/groups/${groupId}/courses/${memberCourse.id}`, owner, { title: "Taken", summary: "x" }, "PATCH")).status).toBe(403);
    expect((await request(`/api/groups/${groupId}/courses/${memberCourse.id}/visibility`, owner, { status: "draft" })).status).toBe(403);
    const edited = await request(`/api/groups/${groupId}/courses/${memberCourse.id}`, member, { title: "Renamed", summary: "New summary", level: "", intendedLearner: "Beginners" }, "PATCH");
    expect(courseResponseSchema.parse(await edited.json()).course).toMatchObject({ title: "Renamed", level: null, intendedLearner: "Beginners" });
  });

  it("archives and restores for the owner or group creator and hides archived courses from others", async () => {
    const creatorId = await seedUser("creator"); const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", creatorId); await join(groupId, ownerId); await join(groupId, readerId);
    const creator = await signIn("creator"); const owner = await signIn("owner"); const reader = await signIn("reader");
    const course = await createCourse(groupId, owner);
    expect((await request(`/api/groups/${groupId}/courses/${course.id}/archive`, creator, undefined, "POST")).status).toBe(404);
    await request(`/api/groups/${groupId}/courses/${course.id}/visibility`, owner, { status: "published" });
    expect((await request(`/api/groups/${groupId}/courses/${course.id}/archive`, reader, undefined, "POST")).status).toBe(403);
    const archived = courseResponseSchema.parse(await (await request(`/api/groups/${groupId}/courses/${course.id}/archive`, creator, undefined, "POST")).json()).course;
    expect(archived.status).toBe("archived");
    expect((await library(groupId, reader)).items).toHaveLength(0);
    expect((await request(`/api/groups/${groupId}/courses/${course.id}`, reader)).status).toBe(404);
    expect((await library(groupId, creator)).items.map((item) => item.id)).toEqual([course.id]);
    expect((await request(`/api/groups/${groupId}/courses/${course.id}`, owner, { title: "x", summary: "y" }, "PATCH")).status).toBe(409);
    expect((await request(`/api/groups/${groupId}/courses/${course.id}/visibility`, owner, { status: "published" })).status).toBe(409);
    const restored = courseResponseSchema.parse(await (await request(`/api/groups/${groupId}/courses/${course.id}/restore`, owner, undefined, "POST")).json()).course;
    expect(restored.status).toBe("draft");
    expect((await request(`/api/groups/${groupId}/courses/${course.id}/restore`, owner, undefined, "POST")).status).toBe(409);
  });

  it("rejects cross-tenant, nested-ID, and inactive-member access", async () => {
    const alphaId = await seedUser("alpha"); const betaId = await seedUser("beta"); const formerId = await seedUser("former");
    const alphaGroup = await seedGroup("alpha", alphaId); const betaGroup = await seedGroup("beta", betaId);
    await join(alphaGroup, formerId, "left");
    const alpha = await signIn("alpha"); const beta = await signIn("beta"); const former = await signIn("former");
    const course = await createCourse(alphaGroup, alpha);
    await request(`/api/groups/${alphaGroup}/courses/${course.id}/visibility`, alpha, { status: "published" });
    for (const cookie of [beta, former]) {
      expect((await request(`/api/groups/${alphaGroup}/courses`, cookie)).status).toBe(404);
      expect((await request(`/api/groups/${alphaGroup}/courses/${course.id}`, cookie)).status).toBe(404);
      expect((await request(`/api/groups/${alphaGroup}/courses`, cookie, { title: "x", summary: "y" })).status).toBe(404);
    }
    // Another group's course ID under the attacker's own valid group ID.
    expect((await request(`/api/groups/${betaGroup}/courses/${course.id}`, beta)).status).toBe(404);
    expect((await request(`/api/groups/${betaGroup}/courses/${course.id}`, beta, { title: "x", summary: "y" }, "PATCH")).status).toBe(404);
    expect((await request(`/api/groups/${betaGroup}/courses/${course.id}/visibility`, beta, { status: "draft" })).status).toBe(404);
    expect((await request(`/api/groups/${betaGroup}/courses/${course.id}/archive`, beta, undefined, "POST")).status).toBe(404);
    expect((await request(`/api/groups/${betaGroup}/courses/${course.id}/restore`, beta, undefined, "POST")).status).toBe(404);
    expect((await request(`/api/groups/${betaGroup}/courses/${course.id}/cover`, beta, undefined, "DELETE")).status).toBe(404);
    expect((await library(betaGroup, beta)).items).toHaveLength(0);
    const unchanged = courseResponseSchema.parse(await (await request(`/api/groups/${alphaGroup}/courses/${course.id}`, alpha)).json()).course;
    expect(unchanged.status).toBe("published");
  });
});
