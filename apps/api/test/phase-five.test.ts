import { env, SELF } from "cloudflare:test";
import { memberDirectoryResponseSchema, sessionResponseSchema, temporaryPasswordResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "phase-five-password"; let passwordHash: string;
async function seedGroup(label: string) {
  const creatorId = crypto.randomUUID(); const memberId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '👍', '❤️', '😂', 0, ?, ?)").bind(creatorId, `${label}-creator@test.local`, `${label}-creator@test.local`, passwordHash, `${label} creator`, now, now),
    env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, bio, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '👍', '❤️', '😂', 0, ?, ?)").bind(memberId, `${label}-member@test.local`, `${label}-member@test.local`, passwordHash, `${label} member`, `${label} bio`, now, now),
    env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)").bind(groupId, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now),
    env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)").bind(groupId, creatorId, now, now, `${label} creator`, now),
    env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, profile_bio, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?, ?)").bind(groupId, memberId, now, now, `${label} member`, `${label} bio`, now),
  ]);
  return { creatorId, memberId, groupId };
}
async function signIn(email: string, password = PASSWORD) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { response, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? "" };
}
function request(path: string, cookie: string, body?: unknown, method = "GET") {
  return SELF.fetch(`https://wordinator.test${path}`, { method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reactions"), env.DB.prepare("DELETE FROM post_pins"), env.DB.prepare("DELETE FROM comment_response_items"), env.DB.prepare("DELETE FROM comments"),
    env.DB.prepare("DELETE FROM reading_questions"), env.DB.prepare("DELETE FROM fill_expected_answers"), env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM login_attempts"),
    env.DB.prepare("DELETE FROM notifications"), env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Phase 5 member, media, and group lifecycle API", () => {
  it("lists current and former members, preserves snapshots, and blocks cross-tenant removal", async () => {
    const alpha = await seedGroup("alpha5"); const beta = await seedGroup("beta5");
    const creator = await signIn("alpha5-creator@test.local"); const member = await signIn("alpha5-member@test.local"); const betaCreator = await signIn("beta5-creator@test.local");
    expect((await request(`/api/groups/${alpha.groupId}/memberships/leave`, member.cookie, { confirmation: true }, "POST")).status).toBe(200);
    await env.DB.prepare("UPDATE users SET display_name = 'Later private name', bio = 'Later bio' WHERE id = ?").bind(alpha.memberId).run();
    const directory = memberDirectoryResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/members`, creator.cookie)).json());
    expect(directory.former[0]).toMatchObject({ id: alpha.memberId, displayName: "alpha5 member", bio: "alpha5 bio", membership: "former" });
    expect((await request(`/api/groups/${beta.groupId}/memberships/${alpha.creatorId}`, betaCreator.cookie, { confirmation: true }, "DELETE")).status).toBe(404);
  });

  it("removes active members and regenerates a one-time temporary password", async () => {
    const group = await seedGroup("manage5"); const creator = await signIn("manage5-creator@test.local"); const member = await signIn("manage5-member@test.local");
    const regenerated = temporaryPasswordResponseSchema.parse(await (await request(`/api/groups/${group.groupId}/memberships/${group.memberId}/regenerate-password`, creator.cookie, undefined, "POST")).json());
    expect(regenerated.password).toHaveLength(24);
    const forced = sessionResponseSchema.parse(await (await request("/api/session", member.cookie)).json());
    expect(forced.status === "signedIn" && forced.user.mustChangePassword).toBe(true);
    expect((await signIn("manage5-member@test.local", PASSWORD)).response.status).toBe(401);
    expect((await signIn("manage5-member@test.local", regenerated.password)).response.status).toBe(200);
    expect((await request(`/api/groups/${group.groupId}/memberships/${group.memberId}`, creator.cookie, { confirmation: true }, "DELETE")).status).toBe(200);
    expect((await request(`/api/groups/${group.groupId}`, member.cookie)).status).toBe(403);
  });

  it("soft-deletes a group, reports status, and restores all prior access", async () => {
    const group = await seedGroup("delete5"); const creator = await signIn("delete5-creator@test.local"); const member = await signIn("delete5-member@test.local");
    expect((await request(`/api/groups/${group.groupId}`, creator.cookie, { confirmation: true }, "DELETE")).status).toBe(200);
    expect((await request(`/api/groups/${group.groupId}`, member.cookie)).status).toBe(404);
    const deletedSession = sessionResponseSchema.parse(await (await request("/api/session", member.cookie)).json());
    expect(deletedSession.status === "signedIn" && deletedSession.deletedGroups[0]?.id).toBe(group.groupId);
    expect((await request(`/api/groups/${group.groupId}/restore`, member.cookie, undefined, "POST")).status).toBe(404);
    expect((await request(`/api/groups/${group.groupId}/restore`, creator.cookie, undefined, "POST")).status).toBe(200);
    expect((await request(`/api/groups/${group.groupId}`, member.cookie)).status).toBe(200);
  });

});
