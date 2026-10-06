import { env, SELF } from "cloudflare:test";
import {
  blockResponseSchema, commentResponseSchema, courseDetailResponseSchema, courseResponseSchema, lessonResponseSchema, practiceDiscussionResponseSchema,
  reactionTargetResponseSchema, type CourseBlock,
} from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";
import { hashPassword } from "../src/auth";

const PASSWORD = "course-practice-password";
let passwordHash: string;

async function seedUser(label: string) {
  const userId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
    .bind(userId, `${label}@example.test`, `${label}@example.test`, passwordHash, label, now, now).run();
  return userId;
}

async function join(groupId: string, userId: string, state = "active") {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, ?, ?, ?, 'Member', ?)")
    .bind(groupId, userId, state, now, now, now).run();
}

async function seedGroup(label: string, creatorId: string) {
  const groupId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)")
    .bind(groupId, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now).run();
  await join(groupId, creatorId);
  return groupId;
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

const coursePath = (groupId: string, courseId: string) => `/api/groups/${groupId}/courses/${courseId}`;

const fillPractice = {
  instruction: "Complete each sentence with 'er is' or 'er zijn'.",
  items: [
    { prompt: "… een kleine keuken.", authorsVersion: ["Er is"], note: "One kitchen, so singular." },
    { prompt: "… drie slaapkamers.", authorsVersion: ["Er zijn"] },
  ],
};

type Setup = { groupId: string; courseId: string; lessonId: string; block: CourseBlock; owner: string; path: string };

async function publishedPractice(ownerLabel: string, groupId: string, payload: unknown = fillPractice): Promise<Setup> {
  const owner = await signIn(ownerLabel);
  const course = courseResponseSchema.parse(await (await request(`/api/groups/${groupId}/courses`, owner, fixture.course)).json()).course;
  await request(`${coursePath(groupId, course.id)}/visibility`, owner, { status: "published" });
  const created = lessonResponseSchema.parse(await (await request(`${coursePath(groupId, course.id)}/lessons`, owner, { title: "Mijn huis" })).json()).lesson;
  await request(`${coursePath(groupId, course.id)}/lessons/${created.id}`, owner, { title: "Mijn huis", goal: null, published: true, version: created.version }, "PATCH");
  const response = await request(`${coursePath(groupId, course.id)}/lessons/${created.id}/blocks`, owner, { kind: "practice", payload, published: true });
  expect(response.status).toBe(201);
  const block = blockResponseSchema.parse(await response.json()).block;
  return { groupId, courseId: course.id, lessonId: created.id, block, owner, path: `${coursePath(groupId, course.id)}/lessons/${created.id}/blocks/${block.id}` };
}

const answer = async (setup: Setup, cookie: string, answers: string[]) => {
  const response = await request(`${setup.path}/comments`, cookie, { kind: "practice_response", answers });
  expect(response.status).toBe(201);
  return commentResponseSchema.parse(await response.json()).item;
};
const thread = async (setup: Setup, cookie: string) => practiceDiscussionResponseSchema.parse(await (await request(`${setup.path}/discussion`, cookie)).json());

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reactions"), env.DB.prepare("DELETE FROM comment_response_items"), env.DB.prepare("DELETE FROM comments"),
    env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM course_blocks"), env.DB.prepare("DELETE FROM course_lessons"), env.DB.prepare("DELETE FROM courses"),
    env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"),
    env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Course practice blocks and answer threads API", () => {
  it("stores every fixture practice and never sends authors' versions or notes to learners", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const reading = fixture.lessons.flatMap((lesson) => lesson.blocks).find((block) => block.kind === "practice" && "passage" in block.payload)!;
    const setup = await publishedPractice("owner", groupId, reading.payload);
    const reader = await signIn("reader");

    // The editor receives the reference for editing; the reader gets prompts only.
    expect(setup.block).toMatchObject({ kind: "practice", answerCount: 0 });
    expect(setup.block.kind === "practice" && setup.block.reference?.items[0]!.authorsVersion).toEqual(["Op de tweede verdieping."]);
    const readerDetail = await (await request(coursePath(groupId, setup.courseId), reader)).text();
    const readerLesson = await (await request(`${coursePath(groupId, setup.courseId)}/lessons/${setup.lessonId}`, reader)).text();
    for (const raw of [readerDetail, readerLesson]) {
      expect(raw).toContain("Op welke verdieping is het appartement?");
      expect(raw).not.toContain("Op de tweede verdieping.");
      expect(raw).not.toContain("authorsVersion");
    }
    const block = courseDetailResponseSchema.parse(JSON.parse(readerDetail)).lessons[0]!.blocks[0]!;
    expect(block).toMatchObject({ kind: "practice", reference: null, payload: { passage: { title: "Licht appartement met balkon" } } });

    // The reference arrives only with the thread, which the client fetches when the reader reveals it.
    const revealed = await thread(setup, reader);
    expect(revealed.reference.items[0]).toMatchObject({ prompt: "Op welke verdieping is het appartement?", authorsVersion: ["Op de tweede verdieping."] });
    expect(revealed.items).toEqual([]);
  });

  it("publishes ordered answer sets with blanks, replies, reactions, and no matching or pins", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");

    const item = await answer(setup, reader, ["Er is", "  "]);
    expect(item).toMatchObject({ kind: "practice_response", pinned: false, permissions: { pin: false, reply: true, edit: true } });
    expect(item.responseItems).toEqual([
      { position: 0, prompt: "… een kleine keuken.", answer: "Er is", skipped: false, matched: null },
      { position: 1, prompt: "… drie slaapkamers.", answer: "", skipped: true, matched: null },
    ]);
    expect((await request(`${setup.path}/comments`, reader, { kind: "practice_response", answers: ["Er is"] })).status).toBe(400);
    expect((await request(`${setup.path}/comments`, reader, { kind: "text", body: "Top-level text" })).status).toBe(400);
    expect((await request(`${setup.path}/comments`, reader, { kind: "fill_response", answers: ["Er is", "Er zijn"] })).status).toBe(400);

    const reply = await request(`${setup.path}/comments`, setup.owner, { kind: "text", body: "Goed gedaan!", parentId: item.id });
    expect(reply.status).toBe(201);
    const replyItem = commentResponseSchema.parse(await reply.json()).item;
    expect((await request(`${setup.path}/comments`, reader, { kind: "text", body: "Nested", parentId: replyItem.id })).status).toBe(400);

    const reacted = await request(`${setup.path}/comments/${item.id}/reactions`, setup.owner, { emoji: "👍", active: true }, "PUT");
    expect(reactionTargetResponseSchema.parse(await reacted.json()).reactions).toMatchObject([{ emoji: "👍", count: 1 }]);
    // Practice-thread activity creates no notifications.
    expect((await env.DB.prepare("SELECT COUNT(*) AS total FROM notifications").first<{ total: number }>())!.total).toBe(0);

    const read = await thread(setup, reader);
    expect(read.count).toBe(2);
    expect(read.items[0]!.replies.map((entry) => entry.body)).toEqual(["Goed gedaan!"]);
    expect(read.items[0]!.reactions[0]!.count).toBe(1);
    const lesson = lessonResponseSchema.parse(await (await request(`${coursePath(groupId, setup.courseId)}/lessons/${setup.lessonId}`, reader)).json()).lesson;
    expect(lesson.blocks[0]).toMatchObject({ kind: "practice", answerCount: 2 });
  });

  it("keeps prompt snapshots when the practice changes and edits against them", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");
    const item = await answer(setup, reader, ["Er is", "Er zijn"]);

    const changed = { instruction: "Nieuw", items: [{ prompt: "… een tuin." }, { prompt: "… twee balkons." }, { prompt: "… een lift?" }] };
    expect((await request(setup.path, setup.owner, { kind: "practice", payload: changed, published: true, version: setup.block.version }, "PATCH")).status).toBe(200);
    expect((await thread(setup, reader)).items[0]!.responseItems.map((entry) => entry.prompt)).toEqual(["… een kleine keuken.", "… drie slaapkamers."]);

    const edited = await request(`${setup.path}/comments/${item.id}`, reader, { kind: "practice_response", answers: ["Er is", "Er zijn er"] }, "PATCH");
    expect(edited.status).toBe(200);
    const saved = commentResponseSchema.parse(await edited.json()).item;
    expect(saved).toMatchObject({ edited: true });
    expect(saved.responseItems.map((entry) => [entry.prompt, entry.answer])).toEqual([["… een kleine keuken.", "Er is"], ["… drie slaapkamers.", "Er zijn er"]]);
    expect((await request(`${setup.path}/comments/${item.id}`, reader, { kind: "practice_response", answers: ["a", "b", "c"] }, "PATCH")).status).toBe(400);
    expect((await request(`${setup.path}/comments/${item.id}`, setup.owner, { kind: "practice_response", answers: ["a", "b"] }, "PATCH")).status).toBe(403);
    // A new answer set follows the current practice.
    expect((await answer(setup, setup.owner, ["Er is", "", ""])).responseItems.map((entry) => entry.prompt)).toEqual(changed.items.map((entry) => entry.prompt));
  });

  it("cascades block and lesson deletion to answers, replies, response items, and reactions", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");
    const counts = async () => env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM comments) AS comments, (SELECT COUNT(*) FROM comment_response_items) AS items, (SELECT COUNT(*) FROM reactions) AS reactions",
    ).first<{ comments: number; items: number; reactions: number }>();
    const seedThread = async (target: Setup) => {
      const item = await answer(target, reader, ["Er is", "Er zijn"]);
      const reply = commentResponseSchema.parse(await (await request(`${target.path}/comments`, target.owner, { kind: "text", body: "Ja", parentId: item.id })).json()).item;
      await request(`${target.path}/comments/${item.id}/reactions`, target.owner, { emoji: "👍", active: true }, "PUT");
      await request(`${target.path}/comments/${reply.id}/reactions`, reader, { emoji: "❤️", active: true }, "PUT");
    };
    await seedThread(setup);
    expect(await counts()).toEqual({ comments: 2, items: 2, reactions: 2 });
    expect((await request(setup.path, setup.owner, undefined, "DELETE")).status).toBe(200);
    expect(await counts()).toEqual({ comments: 0, items: 0, reactions: 0 });

    const second = await publishedPractice("owner", groupId);
    await seedThread(second);
    expect((await request(`${coursePath(groupId, second.courseId)}/lessons/${second.lessonId}`, second.owner, undefined, "DELETE")).status).toBe(200);
    expect(await counts()).toEqual({ comments: 0, items: 0, reactions: 0 });
  });

  it("limits deletion to the author and group creator and freezes threads of archived courses", async () => {
    const creatorId = await seedUser("creator"); const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", creatorId); await join(groupId, ownerId); await join(groupId, memberId);
    const setup = await publishedPractice("owner", groupId); const member = await signIn("member"); const creator = await signIn("creator");
    const mine = await answer(setup, member, ["Er is", "Er zijn"]);
    const theirs = await answer(setup, setup.owner, ["Er is", "Er zijn"]);
    expect((await request(`${setup.path}/comments/${theirs.id}`, member, undefined, "DELETE")).status).toBe(403);
    expect((await request(`${setup.path}/comments/${mine.id}`, member, undefined, "DELETE")).status).toBe(200);
    expect((await request(`${setup.path}/comments/${theirs.id}`, creator, undefined, "DELETE")).status).toBe(200);

    const kept = await answer(setup, member, ["Er is", ""]);
    await request(`${coursePath(groupId, setup.courseId)}/archive`, setup.owner, {});
    expect((await request(`${setup.path}/comments`, setup.owner, { kind: "practice_response", answers: ["a", "b"] })).status).toBe(409);
    expect((await request(`${setup.path}/comments/${kept.id}`, creator, undefined, "DELETE")).status).toBe(409);
    expect((await request(`${setup.path}/discussion`, setup.owner)).status).toBe(200);
    // Members cannot see archived courses at all.
    expect((await request(`${setup.path}/discussion`, member)).status).toBe(404);
  });

  it("isolates practice threads by tenant, nesting, visibility, and target", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader"); const outsiderId = await seedUser("outsider");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const otherGroupId = await seedGroup("beta", outsiderId);
    const setup = await publishedPractice("owner", groupId);
    const other = await publishedPractice("outsider", otherGroupId);
    const reader = await signIn("reader"); const outsider = await signIn("outsider");
    const item = await answer(setup, reader, ["Er is", "Er zijn"]);

    // A non-member cannot reach the thread, and a member of another group cannot use its own group ID as a key.
    expect((await request(`${setup.path}/discussion`, outsider)).status).toBe(404);
    expect((await request(`${setup.path}/comments`, outsider, { kind: "practice_response", answers: ["a", "b"] })).status).toBe(404);
    const crossed = `/api/groups/${otherGroupId}/courses/${setup.courseId}/lessons/${setup.lessonId}/blocks/${setup.block.id}`;
    expect((await request(`${crossed}/discussion`, outsider)).status).toBe(404);
    // Another group's block, lesson, or course ID nested under a valid path is not found.
    const base = `${coursePath(groupId, setup.courseId)}/lessons/${setup.lessonId}/blocks`;
    expect((await request(`${base}/${other.block.id}/discussion`, setup.owner)).status).toBe(404);
    expect((await request(`${coursePath(groupId, setup.courseId)}/lessons/${other.lessonId}/blocks/${setup.block.id}/discussion`, setup.owner)).status).toBe(404);
    expect((await request(`${coursePath(groupId, other.courseId)}/lessons/${setup.lessonId}/blocks/${setup.block.id}/discussion`, setup.owner)).status).toBe(404);
    // A comment from one practice cannot be edited, deleted, or reacted to through another practice or through a post path.
    expect((await request(`${other.path}/comments/${item.id}`, outsider, undefined, "DELETE")).status).toBe(404);
    const sibling = await request(`${base}`, setup.owner, { kind: "practice", payload: fillPractice, published: true });
    const siblingId = blockResponseSchema.parse(await sibling.json()).block.id;
    expect((await request(`${base}/${siblingId}/comments/${item.id}`, reader, { kind: "practice_response", answers: ["a", "b"] }, "PATCH")).status).toBe(404);
    expect((await request(`${base}/${siblingId}/comments/${item.id}/reactions`, reader, { emoji: "👍", active: true }, "PUT")).status).toBe(404);
    expect((await request(`/api/groups/${groupId}/posts/${setup.block.id}/comments/${item.id}`, reader, undefined, "DELETE")).status).toBe(404);

    // Unpublished practices and non-practice blocks have no thread for readers.
    const hidden = await request(base, setup.owner, { kind: "practice", payload: fillPractice });
    const hiddenId = blockResponseSchema.parse(await hidden.json()).block.id;
    expect((await request(`${base}/${hiddenId}/discussion`, reader)).status).toBe(404);
    expect((await request(`${base}/${hiddenId}/discussion`, setup.owner)).status).toBe(200);
    const text = await request(base, setup.owner, { kind: "text", payload: { content: "Hallo" }, published: true });
    const textId = blockResponseSchema.parse(await text.json()).block.id;
    expect((await request(`${base}/${textId}/discussion`, reader)).status).toBe(404);
    expect((await request(`${base}/${textId}/comments`, reader, { kind: "practice_response", answers: ["a"] })).status).toBe(404);
  });
});
