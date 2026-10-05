import { env, SELF } from "cloudflare:test";
import { notificationPageSchema, restrictedNotificationPageSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "phase-six-password"; let passwordHash: string;

async function seedGroup(label: string) {
  const creatorId = crypto.randomUUID(); const memberId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '👍', '❤️', '😂', 0, ?, ?)").bind(creatorId, `${label}-creator@test.local`, `${label}-creator@test.local`, passwordHash, `${label} creator`, now, now),
    env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '👍', '❤️', '😂', 0, ?, ?)").bind(memberId, `${label}-member@test.local`, `${label}-member@test.local`, passwordHash, `${label} member`, now, now),
    env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)").bind(groupId, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now),
    env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)").bind(groupId, creatorId, now, now, `${label} creator`, now),
    env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)").bind(groupId, memberId, now, now, `${label} member`, now),
  ]);
  return { creatorId, memberId, groupId };
}

async function signIn(email: string) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

function request(path: string, cookie: string, body?: unknown, method = "GET") {
  return SELF.fetch(`https://wordinator.test${path}`, { method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reactions"), env.DB.prepare("DELETE FROM post_pins"), env.DB.prepare("DELETE FROM comment_response_items"), env.DB.prepare("DELETE FROM comments"),
    env.DB.prepare("DELETE FROM reading_questions"), env.DB.prepare("DELETE FROM fill_expected_answers"), env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM notifications"),
    env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Phase 6 group notifications", () => {
  it("creates response notices, preserves deleted destinations, and scopes read controls by tenant", async () => {
    const alpha = await seedGroup("alpha6"); const beta = await seedGroup("beta6");
    const creator = await signIn("alpha6-creator@test.local"); const member = await signIn("alpha6-member@test.local");
    const betaCreator = await signIn("beta6-creator@test.local");
    const created = await request(`/api/groups/${alpha.groupId}/posts`, member, { type: "shared_sentence", body: "Een zin" }, "POST");
    const postId = ((await created.json()) as { post: { id: string } }).post.id;
    const response = await request(`/api/groups/${alpha.groupId}/posts/${postId}/comments`, creator, { kind: "text", body: "Goed gedaan" }, "POST");
    const commentId = ((await response.json()) as { item: { id: string } }).item.id;
    const page = notificationPageSchema.parse(await (await request(`/api/groups/${alpha.groupId}/notifications`, member)).json());
    expect(page.items[0]).toMatchObject({ kind: "post_response", postId, commentId, targetAvailable: true, readAt: null });
    expect((await request(`/api/groups/${beta.groupId}/notifications/${page.items[0]!.id}/read`, betaCreator, undefined, "PATCH")).status).toBe(404);
    expect((await request(`/api/groups/${alpha.groupId}/notifications/${page.items[0]!.id}/read`, member, undefined, "PATCH")).status).toBe(200);
    await request(`/api/groups/${alpha.groupId}/posts/${postId}/comments/${commentId}`, creator, undefined, "DELETE");
    const afterDelete = notificationPageSchema.parse(await (await request(`/api/groups/${alpha.groupId}/notifications`, member)).json());
    expect(afterDelete.items[0]).toMatchObject({ targetAvailable: false });
  });

  it("delivers acceptance and removal as restricted status notices", async () => {
    const group = await seedGroup("status6"); const creator = await signIn("status6-creator@test.local"); const member = await signIn("status6-member@test.local");
    expect((await request(`/api/groups/${group.groupId}/memberships/${group.memberId}`, creator, { confirmation: true }, "DELETE")).status).toBe(200);
    const notices = restrictedNotificationPageSchema.parse(await (await request("/api/notifications/status", member)).json());
    expect(notices.items[0]).toMatchObject({ groupId: group.groupId, kind: "member_removed" });
    expect((await request(`/api/groups/${group.groupId}/notifications`, member)).status).toBe(404);
  });
});
