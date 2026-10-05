import { env, SELF } from "cloudflare:test";
import { memberDirectoryResponseSchema } from "@wordinator/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "phase-five-media-password"; let passwordHash: string;
async function signIn(email: string) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}
async function imageRequest(path: string, cookie: string, bytes: Uint8Array) {
  const form = new FormData(); form.set("image", new File([bytes.slice().buffer as ArrayBuffer], "avatar.png", { type: "image/png" }));
  return SELF.fetch(`https://wordinator.test${path}`, { method: "POST", headers: { cookie }, body: form });
}
beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });

describe("Phase 5 public media API", () => {
  it("validates images, refreshes avatar snapshots, enforces icon permissions, and cleans replacements", async () => {
    const creatorId = crypto.randomUUID(); const memberId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, 'media-creator@test.local', 'media-creator@test.local', ?, 'Media creator', '👍', '❤️', '😂', 0, ?, ?)").bind(creatorId, passwordHash, now, now),
      env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, 'media-member@test.local', 'media-member@test.local', ?, 'Media member', '👍', '❤️', '😂', 0, ?, ?)").bind(memberId, passwordHash, now, now),
      env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Media group', 'nl', ?, ?, ?)").bind(groupId, creatorId, "m".repeat(40), now, now),
      env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Media creator', ?)").bind(groupId, creatorId, now, now, now),
      env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Media member', ?)").bind(groupId, memberId, now, now, now),
    ]);
    const creator = await signIn("media-creator@test.local"); const member = await signIn("media-member@test.local");
    expect((await imageRequest("/api/settings/avatar", member, new Uint8Array([1, 2, 3]))).status).toBe(400);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82]);
    const first = await imageRequest("/api/settings/avatar", member, png); expect(first.status).toBe(200); const firstBody = await first.json<{ url: string }>();
    expect((await SELF.fetch(firstBody.url)).status).toBe(200);
    expect((await imageRequest("/api/settings/avatar", member, new Uint8Array([...png, 1]))).status).toBe(200);
    expect((await SELF.fetch(firstBody.url)).status).toBe(404);
    expect((await imageRequest(`/api/groups/${groupId}/icon`, member, png)).status).toBe(403);
    expect((await imageRequest(`/api/groups/${groupId}/icon`, creator, png)).status).toBe(200);
    const directory = memberDirectoryResponseSchema.parse(await (await SELF.fetch(`https://wordinator.test/api/groups/${groupId}/members`, { headers: { cookie: creator } })).json());
    expect(directory.active.find((item) => item.id === memberId)?.avatarUrl).toContain("/api/media/avatars/");
  });
});
