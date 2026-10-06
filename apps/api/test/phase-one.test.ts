import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { healthResponseSchema, sessionResponseSchema } from "@wordinator/contracts";
import { hashPassword } from "../src/auth";

const PASSWORD = "shared-test-password";
let passwordHash: string;

type Seed = { userId: string; groupId: string; token: string };

async function seedGroup(label: string, mustChangePassword = false): Promise<Seed> {
  const userId = crypto.randomUUID();
  const groupId = crypto.randomUUID();
  const token = `${label}-${"x".repeat(40)}`;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(userId, `${label}@example.test`, `${label}@example.test`, passwordHash, `${label} creator`, mustChangePassword ? 1 : 0, now, now),
    env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)")
      .bind(groupId, userId, `${label} group`, token, now, now),
    env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?)")
      .bind(groupId, userId, now, now, now),
  ]);
  return { userId, groupId, token };
}

async function jsonRequest(path: string, body: unknown, cookie?: string, method = "POST") {
  return SELF.fetch(`https://wordinator.test${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function signIn(email: string, password = PASSWORD): Promise<string> {
  const response = await jsonRequest("/api/auth/sign-in", { email, password });
  expect(response.status).toBe(200);
  const header = response.headers.get("set-cookie");
  expect(header).toContain("wordinator_session=");
  return header!.split(";", 1)[0]!;
}

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts"),
    env.DB.prepare("DELETE FROM notifications"), env.DB.prepare("DELETE FROM memberships"),
    env.DB.prepare("DELETE FROM groups"),
    env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Phase 1 API", () => {
  it("keeps the typed health endpoint available", async () => {
    const response = await SELF.fetch("https://wordinator.test/api/health");
    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json()).status).toBe("ok");
  });

  it("issues a protected 30-day signed cookie and rejects tampering", async () => {
    await seedGroup("alpha");
    const response = await jsonRequest("/api/auth/sign-in", { email: "alpha@example.test", password: PASSWORD });
    const setCookie = response.headers.get("set-cookie")!;
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Secure");
    const cookie = setCookie.split(";", 1)[0]!;
    const tampered = `${cookie.slice(0, -1)}${cookie.endsWith("a") ? "b" : "a"}`;
    const session = await SELF.fetch("https://wordinator.test/api/session", { headers: { cookie: tampered } });
    expect(await session.json()).toEqual({ status: "signedOut" });
  });

  it("registers through an invitation, remains pending, and enters after creator approval", async () => {
    const creator = await seedGroup("alpha");
    const registration = await jsonRequest("/api/auth/register", {
      invitationToken: creator.token,
      email: "new@example.test",
      password: "new-user-password",
      displayName: "New learner",
    });
    expect(registration.status).toBe(201);
    const memberCookie = registration.headers.get("set-cookie")!.split(";", 1)[0]!;
    const pendingSession = await SELF.fetch("https://wordinator.test/api/session", { headers: { cookie: memberCookie } });
    const pending = sessionResponseSchema.parse(await pendingSession.json());
    expect(pending.status).toBe("signedIn");
    if (pending.status !== "signedIn") throw new Error("expected signed-in session");
    expect(pending.groups).toEqual([]);
    expect(pending.requests[0]?.state).toBe("pending");

    const creatorCookie = await signIn("alpha@example.test");
    const shell = await SELF.fetch(`https://wordinator.test/api/groups/${creator.groupId}`, { headers: { cookie: creatorCookie } });
    const shellBody = await shell.json<{ pendingRequestCount: number }>();
    expect(shellBody.pendingRequestCount).toBe(1);
    const admin = await SELF.fetch(`https://wordinator.test/api/groups/${creator.groupId}/memberships`, { headers: { cookie: creatorCookie } });
    const adminBody = await admin.json<{ pending: Array<{ id: string }> }>();
    const approval = await jsonRequest(`/api/groups/${creator.groupId}/memberships/${adminBody.pending[0]!.id}`, { decision: "accept" }, creatorCookie, "PATCH");
    expect(approval.status).toBe(200);
    const acceptedSession = await SELF.fetch("https://wordinator.test/api/session", { headers: { cookie: memberCookie } });
    const accepted = sessionResponseSchema.parse(await acceptedSession.json());
    expect(accepted.status === "signedIn" && accepted.groups[0]?.id).toBe(creator.groupId);
  });

  it("allows a rejected membership to request again without creating a duplicate", async () => {
    const creator = await seedGroup("alpha");
    const registration = await jsonRequest("/api/auth/register", {
      invitationToken: creator.token,
      email: "retry@example.test",
      password: "retry-password",
      displayName: "Retry learner",
    });
    const memberCookie = registration.headers.get("set-cookie")!.split(";", 1)[0]!;
    const member = await env.DB.prepare("SELECT id FROM users WHERE normalized_email = ?").bind("retry@example.test").first<{ id: string }>();
    const creatorCookie = await signIn("alpha@example.test");
    expect((await jsonRequest(`/api/groups/${creator.groupId}/memberships/${member!.id}`, { decision: "reject" }, creatorCookie, "PATCH")).status).toBe(200);
    expect((await jsonRequest(`/api/invitations/${creator.token}/request`, {}, memberCookie)).status).toBe(200);
    const rows = await env.DB.prepare("SELECT state FROM memberships WHERE group_id = ? AND user_id = ?").bind(creator.groupId, member!.id).all<{ state: string }>();
    expect(rows.results).toEqual([{ state: "pending" }]);
  });

  it("isolates group reads and creator decisions across tenants", async () => {
    const alpha = await seedGroup("alpha");
    const beta = await seedGroup("beta");
    const betaCookie = await signIn("beta@example.test");
    const crossTenantRead = await SELF.fetch(`https://wordinator.test/api/groups/${alpha.groupId}`, { headers: { cookie: betaCookie } });
    expect(crossTenantRead.status).toBe(404);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?)")
      .bind(alpha.groupId, beta.userId, now, now, now).run();
    const crossTenantDecision = await jsonRequest(`/api/groups/${alpha.groupId}/memberships/${beta.userId}`, { decision: "accept" }, betaCookie, "PATCH");
    expect(crossTenantDecision.status).toBe(403);
  });

  it("requires a forced password change before group access", async () => {
    const alpha = await seedGroup("alpha", true);
    const cookie = await signIn("alpha@example.test");
    expect((await SELF.fetch(`https://wordinator.test/api/groups/${alpha.groupId}`, { headers: { cookie } })).status).toBe(403);
    expect((await jsonRequest("/api/auth/change-password", { password: "replacement-password" }, cookie)).status).toBe(200);
    expect((await SELF.fetch(`https://wordinator.test/api/groups/${alpha.groupId}`, { headers: { cookie } })).status).toBe(200);
  });

  it("throttles repeated login failures without revealing account existence", async () => {
    await seedGroup("alpha");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await jsonRequest("/api/auth/sign-in", { email: "nobody@example.test", password: "incorrect-password" });
      expect(response.status).toBe(401);
    }
    const throttled = await jsonRequest("/api/auth/sign-in", { email: "nobody@example.test", password: "incorrect-password" });
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBeTruthy();
  });
});
