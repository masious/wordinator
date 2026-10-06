import { env, SELF } from "cloudflare:test";
import { groupShellResponseSchema, membershipAdminResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "settings-admin-password"; let passwordHash: string;
type State = "pending" | "active" | "rejected" | "left" | "removed";

async function seedUser(email: string, displayName: string) {
  const id = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '👍', '❤️', '😂', 0, ?, ?)")
    .bind(id, email, email, passwordHash, displayName, now, now).run();
  return id;
}
async function seedGroup(label: string, creatorId: string) {
  const id = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)")
    .bind(id, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now).run();
  await addMembership(id, creatorId, "active", 1, 1, `${label} creator`);
  return id;
}
async function addMembership(groupId: string, userId: string, state: State, requestedAt: number, decidedAt: number | null, snapshot: string | null = null) {
  await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(groupId, userId, state, requestedAt, decidedAt, snapshot, Date.now()).run();
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
    env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"), env.DB.prepare("DELETE FROM memberships"),
    env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

async function seedAlpha() {
  const creatorId = await seedUser("creator@admin.test", "Creator");
  const activeId = await seedUser("active@admin.test", "Active learner");
  const firstPendingId = await seedUser("pending-one@admin.test", "First pending");
  const secondPendingId = await seedUser("pending-two@admin.test", "Second pending");
  const rejectedId = await seedUser("rejected@admin.test", "Rejected now");
  const leftId = await seedUser("left@admin.test", "Left later name");
  const removedId = await seedUser("removed@admin.test", "Removed later name");
  const groupId = await seedGroup("alpha", creatorId);
  await addMembership(groupId, activeId, "active", 2, 3, "Active learner");
  await addMembership(groupId, secondPendingId, "pending", 20, null);
  await addMembership(groupId, firstPendingId, "pending", 10, null);
  await addMembership(groupId, rejectedId, "rejected", 4, 5);
  await addMembership(groupId, leftId, "left", 6, 7, "Left snapshot");
  await addMembership(groupId, removedId, "removed", 8, 9, "Removed snapshot");
  return { groupId, creatorId, activeId, firstPendingId, secondPendingId, rejectedId, leftId, removedId };
}

describe("Settings membership administration API", () => {
  it("returns every membership state to the creator, ordered and named by the snapshot rule", async () => {
    const alpha = await seedAlpha(); const cookie = await signIn("creator@admin.test");
    const response = await request(`/api/groups/${alpha.groupId}/memberships`, cookie);
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain("@admin.test");
    const body = membershipAdminResponseSchema.parse(JSON.parse(raw));
    expect(body.pending.map((item) => item.id)).toEqual([alpha.firstPendingId, alpha.secondPendingId]);
    expect(body.active.map((item) => item.displayName)).toEqual(["Active learner", "Creator"]);
    expect(body.active.find((item) => item.id === alpha.creatorId)?.isCreator).toBe(true);
    expect(body.rejected).toEqual([expect.objectContaining({ id: alpha.rejectedId, displayName: "Rejected now", state: "rejected", decidedAt: 5 })]);
    expect(body.former.map((item) => [item.displayName, item.state])).toEqual([["Removed snapshot", "removed"], ["Left snapshot", "left"]]);
  });

  it("reports the pending count only to the creator", async () => {
    const alpha = await seedAlpha();
    const creator = groupShellResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}`, await signIn("creator@admin.test"))).json());
    expect(creator.pendingRequestCount).toBe(2);
    const member = groupShellResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}`, await signIn("active@admin.test"))).json());
    expect(member.pendingRequestCount).toBe(0);
  });

  it("rejects ordinary members, pending requesters, and another group's creator", async () => {
    const alpha = await seedAlpha();
    const betaCreatorId = await seedUser("beta@admin.test", "Beta creator");
    const betaId = await seedGroup("beta", betaCreatorId);
    const memberResponse = await request(`/api/groups/${alpha.groupId}/memberships`, await signIn("active@admin.test"));
    expect(memberResponse.status).toBe(403);
    expect(await memberResponse.json()).toMatchObject({ error: { code: "CREATOR_REQUIRED" } });
    // Non-members get the tenant middleware's 404, so the group's existence is not confirmed.
    expect((await request(`/api/groups/${alpha.groupId}/memberships`, await signIn("pending-one@admin.test"))).status).toBe(404);
    expect((await request(`/api/groups/${alpha.groupId}/memberships`, await signIn("beta@admin.test"))).status).toBe(404);
    expect((await request(`/api/groups/${alpha.groupId}/memberships`, "")).status).toBe(401);
    const beta = membershipAdminResponseSchema.parse(await (await request(`/api/groups/${betaId}/memberships`, await signIn("beta@admin.test"))).json());
    expect([...beta.pending, ...beta.active, ...beta.rejected, ...beta.former].map((item) => item.id)).toEqual([betaCreatorId]);
  });

  it("keeps creator decisions scoped to pending rows in the addressed group", async () => {
    const alpha = await seedAlpha();
    const betaCreatorId = await seedUser("beta@admin.test", "Beta creator");
    const betaId = await seedGroup("beta", betaCreatorId);
    const betaCookie = await signIn("beta@admin.test"); const alphaCookie = await signIn("creator@admin.test"); const memberCookie = await signIn("active@admin.test");
    expect((await request(`/api/groups/${betaId}/memberships/${alpha.firstPendingId}`, betaCookie, { decision: "accept" }, "PATCH")).status).toBe(404);
    expect((await request(`/api/groups/${alpha.groupId}/memberships/${alpha.firstPendingId}`, memberCookie, { decision: "accept" }, "PATCH")).status).toBe(403);
    expect((await request(`/api/groups/${alpha.groupId}/memberships/${alpha.rejectedId}`, alphaCookie, { decision: "accept" }, "PATCH")).status).toBe(404);
    expect((await request(`/api/groups/${alpha.groupId}/memberships/${alpha.activeId}/regenerate-password`, memberCookie, undefined, "POST")).status).toBe(403);
    expect((await request(`/api/groups/${betaId}/memberships/${alpha.activeId}/regenerate-password`, betaCookie, undefined, "POST")).status).toBe(404);
    expect((await request(`/api/groups/${alpha.groupId}/memberships/${alpha.firstPendingId}`, alphaCookie, { decision: "reject" }, "PATCH")).status).toBe(200);
    const after = membershipAdminResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/memberships`, alphaCookie)).json());
    expect(after.pending.map((item) => item.id)).toEqual([alpha.secondPendingId]);
    expect(after.rejected[0]?.id).toBe(alpha.firstPendingId);
  });
});
