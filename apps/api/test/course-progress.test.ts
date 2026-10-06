import { env, SELF } from "cloudflare:test";
import { courseProgressResponseSchema, courseResponseSchema, lessonResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth";

const PASSWORD = "course-progress-password";
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

async function addLesson(path: string, cookie: string, title: string, published: boolean) {
  const created = await request(`${path}/lessons`, cookie, { title, goal: null });
  const lesson = lessonResponseSchema.parse(await created.json()).lesson;
  if (!published) return lesson;
  const updated = await request(`${path}/lessons/${lesson.id}`, cookie, { title, goal: null, published: true, version: lesson.version }, "PATCH");
  return lessonResponseSchema.parse(await updated.json()).lesson;
}

const complete = (path: string, lessonId: string, cookie: string) => request(`${path}/lessons/${lessonId}/completion`, cookie, undefined, "PUT");
const progress = async (path: string, cookie: string) => courseProgressResponseSchema.parse(await (await request(`${path}/progress`, cookie)).json());

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const created = await request(`/api/groups/${groupId}/courses`, owner, { title: "Dutch foundations", summary: "Built together." });
  const course = courseResponseSchema.parse(await created.json()).course;
  const path = coursePath(groupId, course.id);
  await request(`${path}/visibility`, owner, { status: "published" });
  const first = await addLesson(path, owner, "Greetings", true);
  const second = await addLesson(path, owner, "Numbers", true);
  const draft = await addLesson(path, owner, "Later", false);
  return { ownerId, readerId, groupId, owner, reader, course, path, first, second, draft };
}

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM course_lesson_completions"), env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM course_contributors"),
    env.DB.prepare("DELETE FROM course_blocks"), env.DB.prepare("DELETE FROM course_lessons"), env.DB.prepare("DELETE FROM courses"),
    env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"), env.DB.prepare("DELETE FROM memberships"),
    env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Course progress API", () => {
  it("records finished published lessons once and reports each member's percentage", async () => {
    const { ownerId, readerId, owner, reader, path, first, second } = await setup();
    const initial = await progress(path, reader);
    expect(initial.publishedLessons).toBe(2);
    expect(initial.completedLessonIds).toEqual([]);
    expect(initial.participants.map((entry) => [entry.user.id, entry.percent])).toEqual(expect.arrayContaining([[ownerId, 0], [readerId, 0]]));

    const finished = await complete(path, first.id, reader);
    expect(finished.status).toBe(200);
    const after = courseProgressResponseSchema.parse(await finished.json());
    expect(after.completedLessonIds).toEqual([first.id]);
    // Members are listed by name ("owner" before "reader"), not ranked by progress.
    expect(after.participants.map((entry) => entry.user.id)).toEqual([ownerId, readerId]);
    expect(after.participants[1]).toMatchObject({ user: { id: readerId }, completedLessons: 1, percent: 50 });
    expect((await complete(path, first.id, reader)).status).toBe(200);
    await complete(path, second.id, reader);
    expect((await progress(path, owner)).participants.find((entry) => entry.user.id === readerId)).toMatchObject({ completedLessons: 2, percent: 100 });
    // The owner's view lists the reader's progress but only the owner's own finished lessons.
    expect((await progress(path, owner)).completedLessonIds).toEqual([]);
  });

  it("counts only currently published lessons and forgets deleted ones", async () => {
    const { readerId, owner, reader, path, first, second } = await setup();
    await complete(path, first.id, reader); await complete(path, second.id, reader);
    const current = lessonResponseSchema.parse(await (await request(`${path}/lessons/${second.id}`, owner)).json()).lesson;
    await request(`${path}/lessons/${second.id}`, owner, { title: current.title, goal: null, published: false, version: current.version }, "PATCH");
    const unpublished = await progress(path, reader);
    expect(unpublished.publishedLessons).toBe(1);
    expect(unpublished.participants.find((entry) => entry.user.id === readerId)).toMatchObject({ completedLessons: 1, percent: 100 });
    expect((await request(`${path}/lessons/${first.id}`, owner, undefined, "DELETE")).status).toBe(200);
    const remaining = await env.DB.prepare("SELECT COUNT(*) AS total FROM course_lesson_completions WHERE lesson_id = ?").bind(first.id).first<{ total: number }>();
    expect(remaining?.total).toBe(0);
  });

  it("refuses unpublished, hidden, and archived lessons", async () => {
    const { owner, reader, path, first, draft } = await setup();
    expect((await complete(path, draft.id, reader)).status).toBe(404);
    expect((await complete(path, draft.id, owner)).status).toBe(409);
    expect((await complete(path, "missing-lesson", reader)).status).toBe(404);
    await request(`${path}/archive`, owner, {});
    expect((await complete(path, first.id, owner)).status).toBe(409);
    expect((await request(`${path}/progress`, reader)).status).toBe(404);
  });

  it("hides progress from non-members and keeps groups isolated", async () => {
    const { groupId, course, path, first } = await setup();
    const outsiderId = await seedUser("outsider"); const otherGroup = await seedGroup("beta", outsiderId);
    const outsider = await signIn("outsider");
    expect((await request(`${path}/progress`, outsider)).status).toBe(404);
    expect((await complete(path, first.id, outsider)).status).toBe(404);
    // A member of another group cannot reach the course through their own group either.
    expect((await request(`${coursePath(otherGroup, course.id)}/progress`, outsider)).status).toBe(404);
    expect((await complete(coursePath(otherGroup, course.id), first.id, outsider)).status).toBe(404);
    const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM course_lesson_completions WHERE group_id IN (?, ?)").bind(groupId, otherGroup).first<{ total: number }>();
    expect(rows?.total).toBe(0);
  });

  it("drops former members from the participant list", async () => {
    const { readerId, groupId, owner, reader, path, first } = await setup();
    await complete(path, first.id, reader);
    await env.DB.prepare("UPDATE memberships SET state = 'left' WHERE group_id = ? AND user_id = ?").bind(groupId, readerId).run();
    expect((await progress(path, owner)).participants.map((entry) => entry.user.id)).not.toContain(readerId);
    expect((await request(`${path}/progress`, reader)).status).toBe(404);
  });

  it("requires a session", async () => {
    const { path } = await setup();
    expect((await SELF.fetch(`https://wordinator.test${path}/progress`)).status).toBe(401);
  });
});
