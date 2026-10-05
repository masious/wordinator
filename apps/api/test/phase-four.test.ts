import { env, SELF } from "cloudflare:test";
import { commentResponseSchema, discussionResponseSchema, postResponseSchema, reactionTargetResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "phase-four-password"; let passwordHash: string;
async function seedGroup(label: string) {
  const creatorId = crypto.randomUUID(); const memberId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '❤️', '💡', '👎', 0, ?, ?)").bind(creatorId, `${label}-creator@test.local`, `${label}-creator@test.local`, passwordHash, `${label} creator`, now, now),
    env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '❤️', '💡', '👎', 0, ?, ?)").bind(memberId, `${label}-member@test.local`, `${label}-member@test.local`, passwordHash, `${label} member`, now, now),
    env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)").bind(groupId, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now),
    env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)").bind(groupId, creatorId, now, now, `${label} creator`, now),
    env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)").bind(groupId, memberId, now, now, `${label} member`, now),
  ]);
  return { creatorId, memberId, groupId };
}
async function signIn(email: string) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}
function request(path: string, cookie: string, body?: unknown, method = "GET") {
  return SELF.fetch(`https://wordinator.test${path}`, { method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function createPost(groupId: string, cookie: string, input: unknown) {
  return postResponseSchema.parse(await (await request(`/api/groups/${groupId}/posts`, cookie, input, "POST")).json()).post;
}

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reactions"), env.DB.prepare("DELETE FROM post_pins"), env.DB.prepare("DELETE FROM comment_response_items"), env.DB.prepare("DELETE FROM comments"),
    env.DB.prepare("DELETE FROM reading_questions"), env.DB.prepare("DELETE FROM fill_expected_answers"), env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM login_attempts"),
    env.DB.prepare("DELETE FROM notifications"), env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Phase 4 discussion and reactions API", () => {
  it("publishes complete reading and fill response sets with skipped and positive-match state", async () => {
    const group = await seedGroup("structured"); const memberCookie = await signIn("structured-member@test.local"); const creatorCookie = await signIn("structured-creator@test.local");
    const reading = await createPost(group.groupId, creatorCookie, { type: "reading", body: "Een verhaal", questions: [{ text: "Wie?" }, { text: "Waar?" }] });
    expect((await request(`/api/groups/${group.groupId}/posts/${reading.id}/comments`, memberCookie, { kind: "reading_response", answers: ["Ada"] }, "POST")).status).toBe(400);
    const readingAnswer = commentResponseSchema.parse(await (await request(`/api/groups/${group.groupId}/posts/${reading.id}/comments`, memberCookie, { kind: "reading_response", answers: ["Ada", ""] }, "POST")).json()).item;
    expect(readingAnswer.responseItems.map((item) => [item.prompt, item.skipped])).toEqual([["Wie?", false], ["Waar?", true]]);
    const fill = await createPost(group.groupId, creatorCookie, { type: "fill_in", body: "Ik … in Delft en … Nederlands.", expectedAnswers: ["woon", null] });
    const fillAnswer = commentResponseSchema.parse(await (await request(`/api/groups/${group.groupId}/posts/${fill.id}/comments`, memberCookie, { kind: "fill_response", answers: [" WOON ", "leer"] }, "POST")).json()).item;
    expect(fillAnswer.responseItems.map((item) => item.matched)).toEqual([true, null]);
    const discussion = discussionResponseSchema.parse(await (await request(`/api/groups/${group.groupId}/posts/${fill.id}/discussion`, memberCookie)).json());
    expect(discussion.concealed).toBe(true); expect(discussion.quickReactions).toEqual(["❤️", "💡", "👎"]);
  });

  it("enforces two levels, edit/delete ownership, pin permissions, and nested tenant isolation", async () => {
    const alpha = await seedGroup("alpha4"); const beta = await seedGroup("beta4");
    const creatorCookie = await signIn("alpha4-creator@test.local"); const memberCookie = await signIn("alpha4-member@test.local"); const betaCookie = await signIn("beta4-creator@test.local");
    const post = await createPost(alpha.groupId, creatorCookie, { type: "question", body: "Wat denk je?" });
    const answer = commentResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts/${post.id}/comments`, memberCookie, { kind: "text", body: "Mijn antwoord" }, "POST")).json()).item;
    const edited = commentResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts/${post.id}/comments/${answer.id}`, memberCookie, { kind: "text", body: "Mijn bijgewerkte antwoord" }, "PATCH")).json()).item;
    expect(edited.body).toBe("Mijn bijgewerkte antwoord"); expect(edited.edited).toBe(true);
    const reply = commentResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts/${post.id}/comments`, creatorCookie, { kind: "text", body: "Dank je", parentId: answer.id }, "POST")).json()).item;
    expect((await request(`/api/groups/${alpha.groupId}/posts/${post.id}/comments`, memberCookie, { kind: "text", body: "Too deep", parentId: reply.id }, "POST")).status).toBe(400);
    expect((await request(`/api/groups/${alpha.groupId}/posts/${post.id}/comments/${answer.id}`, creatorCookie, { kind: "text", body: "Hijacked" }, "PATCH")).status).toBe(403);
    expect((await request(`/api/groups/${alpha.groupId}/posts/${post.id}/pin`, memberCookie, { commentId: answer.id }, "PUT")).status).toBe(403);
    expect((await request(`/api/groups/${alpha.groupId}/posts/${post.id}/pin`, creatorCookie, { commentId: answer.id }, "PUT")).status).toBe(200);
    expect(discussionResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts/${post.id}/discussion`, creatorCookie)).json()).items[0]?.pinned).toBe(true);
    expect((await request(`/api/groups/${beta.groupId}/posts/${post.id}/comments/${answer.id}`, betaCookie, undefined, "DELETE")).status).toBe(404);
    expect((await request(`/api/groups/${alpha.groupId}/posts/${post.id}/comments/${answer.id}`, creatorCookie, undefined, "DELETE")).status).toBe(200);
    expect(discussionResponseSchema.parse(await (await request(`/api/groups/${alpha.groupId}/posts/${post.id}/discussion`, creatorCookie)).json()).count).toBe(0);
  });

  it("toggles self and custom reactions once per emoji and exposes member identities", async () => {
    const group = await seedGroup("react"); const creatorCookie = await signIn("react-creator@test.local"); const memberCookie = await signIn("react-member@test.local");
    const post = await createPost(group.groupId, creatorCookie, { type: "shared_sentence", body: "Goedemorgen allemaal" }); const path = `/api/groups/${group.groupId}/posts/${post.id}/reactions`;
    expect((await request(path, creatorCookie, { emoji: "word", active: true }, "PUT")).status).toBe(400);
    await request(path, creatorCookie, { emoji: "👨‍👩‍👧‍👦", active: true }, "PUT");
    const added = reactionTargetResponseSchema.parse(await (await request(path, memberCookie, { emoji: "👨‍👩‍👧‍👦", active: true }, "PUT")).json());
    expect(added.reactions[0]?.count).toBe(2); expect(added.reactions[0]?.members.map((member) => member.displayName)).toEqual(["react creator", "react member"]);
    const removed = reactionTargetResponseSchema.parse(await (await request(path, memberCookie, { emoji: "👨‍👩‍👧‍👦", active: false }, "PUT")).json());
    expect(removed.reactions[0]?.count).toBe(1);
  });
});
