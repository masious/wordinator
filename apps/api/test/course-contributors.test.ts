import { env, SELF } from "cloudflare:test";
import {
  blockResponseSchema, courseContributorsResponseSchema, courseDetailResponseSchema, coursePageSchema, courseResponseSchema, lessonResponseSchema, notificationPageSchema,
} from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "course-contributor-password";
let passwordHash: string;

async function seedUser(label: string) {
  const userId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
    .bind(userId, `${label}@example.test`, `${label}@example.test`, passwordHash, label, now, now).run();
  return userId;
}

async function seedGroup(label: string, creatorId: string) {
  const groupId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)")
    .bind(groupId, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now).run();
  await join(groupId, creatorId);
  return groupId;
}

async function join(groupId: string, userId: string) {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Member', ?)")
    .bind(groupId, userId, now, now, now).run();
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
const textBlock = (content: string, published = false) => ({ kind: "text", payload: { content }, published });

async function createCourse(groupId: string, cookie: string, publish = true) {
  const response = await request(`/api/groups/${groupId}/courses`, cookie, { title: "Dutch foundations", summary: "Built together." });
  const course = courseResponseSchema.parse(await response.json()).course;
  if (publish) await request(`${coursePath(groupId, course.id)}/visibility`, cookie, { status: "published" });
  return course;
}

async function addLesson(groupId: string, courseId: string, cookie: string, title: string, published: boolean) {
  const created = await request(`${coursePath(groupId, courseId)}/lessons`, cookie, { title, goal: null });
  expect(created.status).toBe(201);
  const lesson = lessonResponseSchema.parse(await created.json()).lesson;
  if (!published) return lesson;
  const updated = await request(`${coursePath(groupId, courseId)}/lessons/${lesson.id}`, cookie, { title, goal: null, published: true, version: lesson.version }, "PATCH");
  return lessonResponseSchema.parse(await updated.json()).lesson;
}

const contributors = async (groupId: string, courseId: string, cookie: string) =>
  courseContributorsResponseSchema.parse(await (await request(`${coursePath(groupId, courseId)}/contributors`, cookie)).json());
const notifications = async (groupId: string, cookie: string) =>
  notificationPageSchema.parse(await (await request(`/api/groups/${groupId}/notifications`, cookie)).json()).items;

// Owner, contributor, and an ordinary member in one group, with a published course whose contributor has been accepted.
async function setup() {
  const ownerId = await seedUser("owner"); const helperId = await seedUser("helper"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, helperId); await join(groupId, readerId);
  const owner = await signIn("owner"); const helper = await signIn("helper"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  return { ownerId, helperId, readerId, groupId, owner, helper, reader, course, path };
}

async function accept(path: string, owner: string, helper: string, helperId: string) {
  expect((await request(`${path}/contributors`, helper, {})).status).toBe(201);
  expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(200);
}

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM course_contributors"), env.DB.prepare("DELETE FROM course_blocks"), env.DB.prepare("DELETE FROM course_lessons"),
    env.DB.prepare("DELETE FROM courses"), env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"),
    env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Course contributors API", () => {
  it("runs the request, decision, and notification lifecycle", async () => {
    const { ownerId, helperId, groupId, owner, helper, reader, path } = await setup();
    const requested = await request(`${path}/contributors`, helper, {});
    expect(requested.status).toBe(201);
    const pending = courseResponseSchema.parse(await requested.json()).course;
    expect(pending.contribution).toBe("pending");
    expect(pending.permissions).toMatchObject({ contribute: false, requestContribution: false, leaveContribution: true });
    expect((await request(`${path}/contributors`, helper, {})).status).toBe(409);
    expect((await request(`${path}/contributors`, owner, {})).status).toBe(400);

    const [notice] = await notifications(groupId, owner);
    expect(notice).toMatchObject({ kind: "contributor_requested", actor: { id: helperId }, courseId: pending.id, postId: null, targetAvailable: true });
    expect((await contributors(groupId, pending.id, owner)).pending.map((entry) => entry.user.id)).toEqual([helperId]);
    expect((await contributors(groupId, pending.id, reader)).pending).toEqual([]);

    expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(200);
    expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(404);
    expect((await notifications(groupId, helper))[0]).toMatchObject({ kind: "contributor_accepted", actor: { id: ownerId }, courseId: pending.id });
    const listed = await contributors(groupId, pending.id, reader);
    expect(listed.active.map((entry) => entry.user.id)).toEqual([helperId]);
    const active = courseResponseSchema.parse(await (await request(path, helper)).json()).course;
    expect(active).toMatchObject({ contribution: "active", permissions: { contribute: true, edit: false, publish: false, manageContributors: false } });
  });

  it("lets rejected, departed, and removed contributors ask again", async () => {
    const { helperId, groupId, owner, helper, path, course } = await setup();
    await request(`${path}/contributors`, helper, {});
    expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "reject" }, "PATCH")).status).toBe(200);
    expect((await notifications(groupId, helper))[0]).toMatchObject({ kind: "contributor_rejected" });
    await accept(path, owner, helper, helperId);
    expect((await request(`${path}/contributors/leave`, helper, {})).status).toBe(200);
    expect((await request(`${path}/contributors/leave`, helper, {})).status).toBe(404);
    await accept(path, owner, helper, helperId);
    expect((await request(`${path}/contributors/${helperId}`, owner, undefined, "DELETE")).status).toBe(200);
    expect((await request(`${path}/contributors/${helperId}`, owner, undefined, "DELETE")).status).toBe(404);
    expect((await request(`${path}/contributors`, helper, {})).status).toBe(201);
    // A pending request can be withdrawn.
    expect((await request(`${path}/contributors/leave`, helper, {})).status).toBe(200);
    expect((await contributors(groupId, course.id, owner)).pending).toEqual([]);
  });

  it("limits contributors to unpublished lessons and blocks and keeps publishing with the owner", async () => {
    const { helperId, owner, helper, path, groupId, course } = await setup();
    const published = await addLesson(groupId, course.id, owner, "Owner lesson", true);
    await accept(path, owner, helper, helperId);

    const draft = lessonResponseSchema.parse(await (await request(`${path}/lessons`, helper, { title: "Helper lesson", goal: null })).json()).lesson;
    expect(draft).toMatchObject({ published: false, updatedBy: { id: helperId } });
    const renamed = await request(`${path}/lessons/${draft.id}`, helper, { title: "Helper lesson, revised", goal: null, published: false, version: draft.version }, "PATCH");
    expect(renamed.status).toBe(200);
    const revised = lessonResponseSchema.parse(await renamed.json()).lesson;
    const publishOwn = await request(`${path}/lessons/${draft.id}`, helper, { title: revised.title, goal: null, published: true, version: revised.version }, "PATCH");
    expect(publishOwn.status).toBe(403);
    expect(((await publishOwn.json()) as { error: { code: string } }).error.code).toBe("COURSE_PUBLISH_FORBIDDEN");
    const editPublished = await request(`${path}/lessons/${published.id}`, helper, { title: "Hijacked", goal: null, published: false, version: published.version }, "PATCH");
    expect(editPublished.status).toBe(403);
    expect(((await editPublished.json()) as { error: { code: string } }).error.code).toBe("COURSE_CONTENT_PUBLISHED");

    // Contributors may add unpublished blocks to a published lesson, but never publish them.
    expect((await request(`${path}/lessons/${published.id}/blocks`, helper, textBlock("Published by helper", true))).status).toBe(403);
    const block = blockResponseSchema.parse(await (await request(`${path}/lessons/${published.id}/blocks`, helper, textBlock("Helper note"))).json()).block;
    expect(block.updatedBy.id).toBe(helperId);
    const ownerPublish = await request(`${path}/lessons/${published.id}/blocks/${block.id}`, owner, { ...textBlock("Helper note", true), version: block.version }, "PATCH");
    const approved = blockResponseSchema.parse(await ownerPublish.json()).block;
    const helperEdit = await request(`${path}/lessons/${published.id}/blocks/${block.id}`, helper, { ...textBlock("Changed after publishing"), version: approved.version }, "PATCH");
    expect(helperEdit.status).toBe(403);

    // Course details, visibility, reordering, contributor decisions, and deletion stay with the owner.
    expect((await request(path, helper, { title: "Renamed", summary: "No" }, "PATCH")).status).toBe(403);
    expect((await request(`${path}/visibility`, helper, { status: "draft" })).status).toBe(403);
    expect((await request(`${path}/lessons/order`, helper, { ids: [draft.id, published.id] }, "PUT")).status).toBe(403);
    expect((await request(`${path}/lessons/${draft.id}`, helper, undefined, "DELETE")).status).toBe(403);
    expect((await request(`${path}/contributors/${helperId}`, helper, undefined, "DELETE")).status).toBe(403);
  });

  it("shows drafts to active contributors only", async () => {
    const { helperId, owner, helper, reader, path, groupId, course } = await setup();
    await accept(path, owner, helper, helperId);
    const draft = await addLesson(groupId, course.id, helper, "Unpublished", false);
    await request(`${path}/visibility`, owner, { status: "draft" });
    const library = coursePageSchema.parse(await (await request(`/api/groups/${groupId}/courses`, helper)).json());
    expect(library.items.map((item) => item.id)).toEqual([course.id]);
    expect(courseDetailResponseSchema.parse(await (await request(path, helper)).json()).outline.map((entry) => entry.id)).toEqual([draft.id]);
    expect((await request(path, reader)).status).toBe(404);
    expect((await request(`${path}/contributors`, reader, {})).status).toBe(404);
  });

  it("refuses edits from non-contributors, pending requesters, and former contributors", async () => {
    const { helperId, owner, helper, reader, path, groupId, course } = await setup();
    const draft = await addLesson(groupId, course.id, owner, "Owner draft", false);
    const published = await addLesson(groupId, course.id, owner, "Owner lesson", true);
    expect((await request(`${path}/lessons`, reader, { title: "Intruder", goal: null })).status).toBe(403);
    expect((await request(`${path}/lessons/${published.id}/blocks`, reader, textBlock("Intruder"))).status).toBe(403);
    expect((await request(`${path}/lessons/${draft.id}`, reader, { title: "x", goal: null, published: false, version: draft.version }, "PATCH")).status).toBe(403);

    await request(`${path}/contributors`, helper, {});
    expect((await request(`${path}/lessons`, helper, { title: "Too early", goal: null })).status).toBe(403);

    await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH");
    expect((await request(`${path}/lessons/${draft.id}`, helper)).status).toBe(200);
    await request(`${path}/contributors/leave`, helper, {});
    expect((await request(`${path}/lessons`, helper, { title: "Former", goal: null })).status).toBe(403);
    expect((await request(`${path}/lessons/${draft.id}`, helper)).status).toBe(404);

    await accept(path, owner, helper, helperId);
    await request(`${path}/contributors/${helperId}`, owner, undefined, "DELETE");
    expect((await request(`${path}/lessons/${published.id}/blocks`, helper, textBlock("Removed"))).status).toBe(403);
    // Departure keeps authored content attributed to the former contributor.
    expect((await request(`${path}/lessons/${published.id}`, owner)).status).toBe(200);
  });

  it("ends contributor roles when a member leaves the group and refuses to accept non-members", async () => {
    const { helperId, readerId, owner, helper, reader, path, groupId } = await setup();
    await accept(path, owner, helper, helperId);
    expect((await request(`/api/groups/${groupId}/memberships/leave`, helper, { confirmation: true })).status).toBe(200);
    await env.DB.prepare("UPDATE memberships SET state = 'active' WHERE group_id = ? AND user_id = ?").bind(groupId, helperId).run();
    const rejoined = courseResponseSchema.parse(await (await request(path, helper)).json()).course;
    expect(rejoined.contribution).toBeNull();

    await request(`${path}/contributors`, reader, {});
    await env.DB.prepare("UPDATE memberships SET state = 'left' WHERE group_id = ? AND user_id = ?").bind(groupId, readerId).run();
    expect((await request(`${path}/contributors/${readerId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(404);
  });

  it("keeps contributor routes inside their group and away from the group creator", async () => {
    const { helperId, readerId, groupId, owner, helper, reader, path, course } = await setup();
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId); const outsider = await signIn("outsider");
    const foreign = await createCourse(otherGroup, outsider);
    expect((await request(`${path}/contributors`, outsider, {})).status).toBe(404);
    expect((await request(`${path}/contributors`, outsider)).status).toBe(404);
    expect((await request(`${coursePath(groupId, foreign.id)}/contributors`, helper, {})).status).toBe(404);
    expect((await request(`${coursePath(groupId, foreign.id)}/contributors/leave`, helper, {})).status).toBe(404);

    await request(`${path}/contributors`, helper, {});
    expect((await request(`${coursePath(otherGroup, course.id)}/contributors/${helperId}`, outsider, { decision: "accept" }, "PATCH")).status).toBe(404);

    // The group creator moderates content but does not decide contributors for another member's course.
    const helperCourse = coursePath(groupId, (await createCourse(groupId, helper)).id);
    expect((await request(`${helperCourse}/contributors`, reader, {})).status).toBe(201);
    expect((await request(`${helperCourse}/contributors/${readerId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(403);
    expect((await request(`${path}/contributors/${helperId}`, helper, { decision: "accept" }, "PATCH")).status).toBe(403);
  });

  it("marks contributor notifications unavailable once the course is archived", async () => {
    const { helperId, groupId, owner, helper, path } = await setup();
    await accept(path, owner, helper, helperId);
    await request(`${path}/archive`, owner, {});
    expect((await notifications(groupId, helper))[0]).toMatchObject({ kind: "contributor_accepted", targetAvailable: false });
    expect((await request(`${path}/contributors`, helper, {})).status).toBe(404);
  });
});
