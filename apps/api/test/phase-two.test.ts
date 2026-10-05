import { env, SELF } from "cloudflare:test";
import { accountSettingsResponseSchema, profileResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth";

const PASSWORD = "shared-test-password";
let passwordHash: string;

type Seed = { userId: string; groupId: string };

async function seedGroup(label: string): Promise<Seed> {
  const userId = crypto.randomUUID();
  const groupId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
      .bind(userId, `${label}@example.test`, `${label}@example.test`, passwordHash, `${label} creator`, now, now),
    env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)")
      .bind(groupId, userId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now),
    env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)")
      .bind(groupId, userId, now, now, `${label} creator`, now),
  ]);
  return { userId, groupId };
}

async function request(path: string, body: unknown, cookie: string, method = "PATCH") {
  return SELF.fetch(`https://wordinator.test${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

async function signIn(email: string, password = PASSWORD): Promise<string> {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
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

describe("Phase 2 API", () => {
  it("updates account settings and active group profile snapshots", async () => {
    const alpha = await seedGroup("alpha");
    const cookie = await signIn("alpha@example.test");
    const initialResponse = await SELF.fetch("https://wordinator.test/api/settings", { headers: { cookie } });
    expect(accountSettingsResponseSchema.parse(await initialResponse.json()).quickReactions).toEqual(["👍", "❤️", "😂"]);
    const updated = await request("/api/settings", {
      displayName: "Ada Learner",
      bio: "Collecting useful Dutch phrases.",
      quickReactions: ["👏", "🌱", "🤔"],
    }, cookie);
    expect(updated.status).toBe(200);

    const settingsResponse = await SELF.fetch("https://wordinator.test/api/settings", { headers: { cookie } });
    const settings = accountSettingsResponseSchema.parse(await settingsResponse.json());
    expect(settings).toMatchObject({ displayName: "Ada Learner", bio: "Collecting useful Dutch phrases.", quickReactions: ["👏", "🌱", "🤔"] });
    const snapshot = await env.DB.prepare("SELECT profile_display_name AS displayName, profile_bio AS bio FROM memberships WHERE group_id = ? AND user_id = ?")
      .bind(alpha.groupId, alpha.userId).first<{ displayName: string; bio: string }>();
    expect(snapshot).toEqual({ displayName: "Ada Learner", bio: "Collecting useful Dutch phrases." });
  });

  it("rejects repeated or non-emoji quick reactions", async () => {
    await seedGroup("alpha");
    const cookie = await signIn("alpha@example.test");
    expect((await request("/api/settings", { displayName: "Alpha", bio: "", quickReactions: ["👍", "👍", "word"] }, cookie)).status).toBe(400);
  });

  it("requires the current password in ordinary settings changes", async () => {
    const alpha = await seedGroup("alpha");
    const cookie = await signIn("alpha@example.test");
    expect((await request("/api/auth/change-password", { currentPassword: "wrong-password", password: "new-password" }, cookie, "POST")).status).toBe(403);
    expect((await request("/api/auth/change-password", { currentPassword: PASSWORD, password: "new-password" }, cookie, "POST")).status).toBe(200);
    const row = await env.DB.prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?").bind(alpha.userId).first<{ passwordHash: string }>();
    expect(await verifyPassword("new-password", row!.passwordHash)).toBe(true);
  });

  it("serves active and former profiles only inside a shared group", async () => {
    const alpha = await seedGroup("alpha");
    const beta = await seedGroup("beta");
    const alphaCookie = await signIn("alpha@example.test");
    const betaCookie = await signIn("beta@example.test");
    const now = Date.now();
    await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, profile_bio, updated_at) VALUES (?, ?, 'removed', ?, ?, ?, ?, ?)")
      .bind(alpha.groupId, beta.userId, now, now, "Beta before leaving", "Remembered bio", now).run();
    await env.DB.prepare("UPDATE users SET display_name = 'Private new name', bio = 'Private new bio' WHERE id = ?").bind(beta.userId).run();

    const visible = await SELF.fetch(`https://wordinator.test/api/groups/${alpha.groupId}/members/${beta.userId}`, { headers: { cookie: alphaCookie } });
    const profile = profileResponseSchema.parse(await visible.json());
    expect(profile.profile).toMatchObject({ displayName: "Beta before leaving", bio: "Remembered bio", membership: "former" });
    const isolated = await SELF.fetch(`https://wordinator.test/api/groups/${alpha.groupId}/members/${alpha.userId}`, { headers: { cookie: betaCookie } });
    expect(isolated.status).toBe(404);
  });

  it("allows only the creator to rename a group", async () => {
    const alpha = await seedGroup("alpha");
    const beta = await seedGroup("beta");
    const alphaCookie = await signIn("alpha@example.test");
    const betaCookie = await signIn("beta@example.test");
    const now = Date.now();
    await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)")
      .bind(alpha.groupId, beta.userId, now, now, "Beta creator", now).run();
    expect((await request(`/api/groups/${alpha.groupId}`, { name: "Not allowed" }, betaCookie)).status).toBe(403);
    expect((await request(`/api/groups/${alpha.groupId}`, { name: "Renamed journal" }, alphaCookie)).status).toBe(200);
    const group = await env.DB.prepare("SELECT name FROM groups WHERE id = ?").bind(alpha.groupId).first<{ name: string }>();
    expect(group?.name).toBe("Renamed journal");
  });
});
