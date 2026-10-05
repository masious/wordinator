import { env, SELF } from "cloudflare:test";
import { postPageSchema, postResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "shared-test-password";
let passwordHash: string;

async function seedGroup(label: string) {
  const userId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const now = Date.now();
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

async function signIn(email: string) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

async function request(path: string, cookie: string, body?: unknown, method = "GET") {
  return SELF.fetch(`https://wordinator.test${path}`, {
    method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reading_questions"), env.DB.prepare("DELETE FROM fill_expected_answers"), env.DB.prepare("DELETE FROM posts"),
    env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"), env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Phase 3 posts API", () => {
  it("creates every post type, returns newest-first pages, and hydrates structured fields", async () => {
    const alpha = await seedGroup("alpha"); const cookie = await signIn("alpha@example.test");
    const inputs = [
      { type: "shared_sentence", body: "Goedemorgen" },
      { type: "question", body: "Hoe gaat het?", notes: "Think about the greeting." },
      { type: "reading", body: "Een kort verhaal.", questions: [{ text: "Wat gebeurt er?" }] },
      { type: "fill_in", body: "Ik … in Amsterdam.", expectedAnswers: ["woon"] },
    ];
    for (const input of inputs) expect((await request(`/api/groups/${alpha.groupId}/posts`, cookie, input, "POST")).status).toBe(201);
    const response = await request(`/api/groups/${alpha.groupId}/posts?limit=2`, cookie);
    const first = postPageSchema.parse(await response.json());
    expect(first.items).toHaveLength(2); expect(first.nextCursor).toBeTruthy();
    const second = postPageSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`, cookie)).json());
    expect(second.items).toHaveLength(2);
    expect([...first.items, ...second.items].map((post) => post.type).sort()).toEqual(["fill_in", "question", "reading", "shared_sentence"]);
    expect([...first.items, ...second.items].find((post) => post.type === "reading")?.questions[0]?.text).toBe("Wat gebeurt er?");
  });

  it("edits only as author, allows creator moderation, and rejects nested cross-tenant IDs", async () => {
    const alpha = await seedGroup("alpha"); const beta = await seedGroup("beta");
    const alphaCookie = await signIn("alpha@example.test"); const betaCookie = await signIn("beta@example.test");
    const created = postResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts`, alphaCookie, { type: "question", body: "Old?" }, "POST")).json());
    expect((await request(`/api/groups/${alpha.groupId}/posts/${created.post.id}`, betaCookie)).status).toBe(404);
    expect((await request(`/api/groups/${beta.groupId}/posts/${created.post.id}`, betaCookie, { type: "question", body: "Attack?" }, "PATCH")).status).toBe(404);
    const edited = await request(`/api/groups/${alpha.groupId}/posts/${created.post.id}`, alphaCookie, { type: "question", body: "New?" }, "PATCH");
    expect(postResponseSchema.parse(await edited.json()).post.edited).toBe(true);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)")
      .bind(alpha.groupId, beta.userId, now, now, "Beta creator", now).run();
    expect((await request(`/api/groups/${alpha.groupId}/posts/${created.post.id}`, betaCookie, undefined, "DELETE")).status).toBe(403);
    const memberPost = postResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts`, betaCookie, { type: "shared_sentence", body: "Member post" }, "POST")).json()).post;
    expect((await request(`/api/groups/${alpha.groupId}/posts/${memberPost.id}`, alphaCookie, undefined, "DELETE")).status).toBe(200);
    expect((await request(`/api/groups/${alpha.groupId}/posts/${created.post.id}`, alphaCookie, undefined, "DELETE")).status).toBe(200);
  });

  it("serves profile posts and counts only records newer than a stable cursor", async () => {
    const alpha = await seedGroup("alpha"); const cookie = await signIn("alpha@example.test");
    const first = postResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts`, cookie, { type: "shared_sentence", body: "First" }, "POST")).json()).post;
    const page = postPageSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts`, cookie)).json());
    const newestCursor = btoa(JSON.stringify([first.createdAt, first.id]));
    await request(`/api/groups/${alpha.groupId}/posts`, cookie, { type: "shared_sentence", body: "Second" }, "POST");
    const newer = postPageSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts?newerThan=${encodeURIComponent(newestCursor)}`, cookie)).json());
    expect(newer.items.map((post) => post.body)).toEqual(["Second"]);
    const profile = await (await request(`/api/groups/${alpha.groupId}/members/${alpha.userId}`, cookie)).json<{ posts: { items: unknown[] } }>();
    expect(profile.posts.items).toHaveLength(2);
    expect(page.items[0]?.body).toBe("First");
  });
});
