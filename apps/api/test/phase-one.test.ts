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

  it("registers immediately and enters the library after required account setup", async () => {
    const creator = await seedGroup("alpha");
    const registration = await jsonRequest("/api/auth/register", {
      email: "new@example.test",
      password: "new-user-password",
    });
    expect(registration.status).toBe(201);
    const memberCookie = registration.headers.get("set-cookie")!.split(";", 1)[0]!;
    const setupSession = sessionResponseSchema.parse(await (await SELF.fetch("https://wordinator.test/api/session", { headers: { cookie: memberCookie } })).json());
    expect(setupSession.status).toBe("signedIn");
    if (setupSession.status !== "signedIn") throw new Error("expected signed-in session");
    expect(setupSession.user.onboardingComplete).toBe(false);
    expect(setupSession.groups[0]?.id).toBe(creator.groupId);
    expect(setupSession.requests).toEqual([]);
    expect((await SELF.fetch(`https://wordinator.test/api/groups/${creator.groupId}`, { headers: { cookie: memberCookie } })).status).toBe(403);

    expect((await jsonRequest("/api/auth/complete-onboarding", { username: "new_learner" }, memberCookie)).status).toBe(200);
    const readySession = sessionResponseSchema.parse(await (await SELF.fetch("https://wordinator.test/api/session", { headers: { cookie: memberCookie } })).json());
    expect(readySession.status === "signedIn" && readySession.user.username).toBe("new_learner");
    expect((await SELF.fetch(`https://wordinator.test/api/groups/${creator.groupId}`, { headers: { cookie: memberCookie } })).status).toBe(200);
  });

  it("rejects invalid, duplicate, and premature registrations", async () => {
    expect((await jsonRequest("/api/auth/register", { email: "early@example.test", password: "early-password" })).status).toBe(409);
    await seedGroup("alpha");
    expect((await jsonRequest("/api/auth/register", { email: "not-an-email", password: "valid-password" })).status).toBe(400);
    expect((await jsonRequest("/api/auth/register", { email: "short@example.test", password: "123" })).status).toBe(400);
    const duplicate = await jsonRequest("/api/auth/register", { email: "ALPHA@example.test", password: "valid-password" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: { code: "ACCOUNT_EXISTS" } });
  });

  it("guards account setup with authentication, validation, and case-insensitive username uniqueness", async () => {
    const creator = await seedGroup("alpha");
    expect((await jsonRequest("/api/auth/complete-onboarding", { username: "anon_user" })).status).toBe(401);
    const register = async (email: string) => {
      const response = await jsonRequest("/api/auth/register", { email, password: "setup-password" });
      expect(response.status).toBe(201);
      return response.headers.get("set-cookie")!.split(";", 1)[0]!;
    };
    const first = await register("first@example.test");
    const second = await register("second@example.test");
    const coursesPath = `/api/groups/${creator.groupId}/courses`;
    const blocked = await SELF.fetch(`https://wordinator.test${coursesPath}`, { headers: { cookie: first } });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: { code: "ONBOARDING_REQUIRED" } });
    for (const username of ["ab", "has space", "no-dashes", "x".repeat(31), ""]) {
      expect((await jsonRequest("/api/auth/complete-onboarding", { username }, first)).status).toBe(400);
    }
    expect((await jsonRequest("/api/auth/complete-onboarding", { username: "Taken_Name" }, first)).status).toBe(200);
    const taken = await jsonRequest("/api/auth/complete-onboarding", { username: "taken_name" }, second);
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ error: { code: "USERNAME_TAKEN" } });
    expect((await SELF.fetch(`https://wordinator.test${coursesPath}`, { headers: { cookie: second } })).status).toBe(403);
    expect((await SELF.fetch(`https://wordinator.test${coursesPath}`, { headers: { cookie: first } })).status).toBe(200);
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
