import { env, SELF } from "cloudflare:test";
import { courseResponseSchema } from "@wordinator/contracts";
import {
  LESSON_DOCUMENT_SCHEMA_VERSION, lessonDraftSavedResponseSchema, lessonResponseSchema, type CourseLesson, type LessonDocument,
} from "@wordinator/contracts/lesson-document";
import { expect } from "vitest";
import { hashPassword } from "../src/auth";

// Shared seeding, request, and lesson document helpers for the course API suites.
const PASSWORD = "course-api-password";
let passwordHash: string | undefined;

export async function seedUser(label: string) {
  passwordHash ??= await hashPassword(PASSWORD);
  const userId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
    .bind(userId, `${label}@example.test`, `${label}@example.test`, passwordHash, label, now, now).run();
  return userId;
}

export async function join(groupId: string, userId: string, state = "active") {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, ?, ?, ?, 'Member', ?)")
    .bind(groupId, userId, state, now, now, now).run();
}

export async function seedGroup(label: string, creatorId: string) {
  const groupId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)")
    .bind(groupId, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now).run();
  await join(groupId, creatorId);
  return groupId;
}

export async function signIn(label: string) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${label}@example.test`, password: PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

export async function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return SELF.fetch(`https://wordinator.test${path}`, {
    method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const errorCode = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

export async function resetDatabase() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reactions"), env.DB.prepare("DELETE FROM comment_response_items"), env.DB.prepare("DELETE FROM comments"),
    env.DB.prepare("DELETE FROM speech_jobs"), env.DB.prepare("DELETE FROM speech_clips"), env.DB.prepare("DELETE FROM course_lesson_completions"), env.DB.prepare("DELETE FROM course_lesson_positions"), env.DB.prepare("DELETE FROM course_lesson_words"), env.DB.prepare("DELETE FROM course_word_bookmarks"), env.DB.prepare("DELETE FROM course_practices"), env.DB.prepare("DELETE FROM course_media"),
    env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM course_contributors"), env.DB.prepare("DELETE FROM course_lessons"),
    env.DB.prepare("DELETE FROM courses"), env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"),
    env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
}

export const coursePath = (groupId: string, courseId: string) => `/api/groups/${groupId}/courses/${courseId}`;

export async function createCourse(groupId: string, cookie: string, publish = true, input: unknown = { title: "Dutch foundations", summary: "Built together." }) {
  const response = await request(`/api/groups/${groupId}/courses`, cookie, input);
  const course = courseResponseSchema.parse(await response.json()).course;
  if (publish) await request(`${coursePath(groupId, course.id)}/visibility`, cookie, { status: "published" });
  return course;
}

// Lesson document builders matching what the editor sends.
const textProps = { textColor: "default", backgroundColor: "default", textAlignment: "left" } as const;
const plain = (text: string) => text ? [{ type: "text" as const, text, styles: {} }] : [];
export const blocks = {
  heading: (text: string, level: 1 | 2 | 3 = 2) => ({ id: crypto.randomUUID(), type: "heading" as const, props: { ...textProps, level, isToggleable: false as const }, content: plain(text), children: [] }),
  paragraph: (text: string) => ({ id: crypto.randomUUID(), type: "paragraph" as const, props: textProps, content: plain(text), children: [] }),
  example: (sentence: string, translation = "", note = "") => ({ id: crypto.randomUUID(), type: "example" as const, props: { translation, note }, content: plain(sentence), children: [] }),
  practice: (payload: unknown, id: string = crypto.randomUUID()) => ({ id, type: "practice" as const, props: { data: JSON.stringify(payload) }, children: [] }),
  image: (url: string, name = "A picture") => ({
    id: crypto.randomUUID(), type: "image" as const,
    props: { textAlignment: "left" as const, backgroundColor: "default" as const, name, url, caption: "", showPreview: true, previewWidth: 512 }, children: [],
  }),
  vocabulary: (...words: unknown[]) => ({ id: crypto.randomUUID(), type: "vocabulary" as const, props: { data: JSON.stringify({ words }) }, children: [] }),
};
export const word = (term: string, extra: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), term, meaning: `meaning of ${term}`, ...extra });
export const documentOf = (...items: unknown[]) => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: items }) as LessonDocument;

export const lessonPath = (groupId: string, courseId: string, lessonId: string) => `${coursePath(groupId, courseId)}/lessons/${lessonId}`;

export async function readLesson(path: string, cookie: string): Promise<CourseLesson> {
  const response = await request(path, cookie);
  expect(response.status).toBe(200);
  return lessonResponseSchema.parse(await response.json()).lesson;
}

export async function saveDraft(path: string, cookie: string, document: unknown, draftVersion: number) {
  const response = await request(`${path}/draft`, cookie, { document, draftVersion }, "PUT");
  expect(response.status, await response.clone().text()).toBe(200);
  return lessonDraftSavedResponseSchema.parse(await response.json());
}

export async function publishLesson(path: string, cookie: string, draftVersion: number) {
  const response = await request(`${path}/publish`, cookie, { draftVersion });
  expect(response.status, await response.clone().text()).toBe(200);
  return lessonResponseSchema.parse(await response.json()).lesson;
}

// Creates a lesson, optionally saves a document into its draft, and optionally publishes it.
export async function addLesson(groupId: string, courseId: string, cookie: string, title: string, options: { published?: boolean; document?: unknown; publisher?: string } = {}) {
  const created = await request(`${coursePath(groupId, courseId)}/lessons`, cookie, { title, goal: null });
  expect(created.status).toBe(201);
  let lesson = lessonResponseSchema.parse(await created.json()).lesson;
  const path = lessonPath(groupId, courseId, lesson.id);
  if (options.document) await saveDraft(path, cookie, options.document, lesson.draft!.version);
  if (options.published ?? true) lesson = await publishLesson(path, options.publisher ?? cookie, (await readLesson(path, options.publisher ?? cookie)).draft!.version);
  else lesson = await readLesson(path, cookie);
  return { lesson, path };
}
