import { parseStoredLessonDocument, walkLessonBlocks } from "@wordinator/contracts/lesson-document";
import { learningTimeRequestSchema, type LearningTimeEntry, type LessonTime, type TypicalTime } from "@wordinator/contracts/learning";
import type { Context, Hono, MiddlewareHandler } from "hono";
import type { AppEnvironment } from "../app";
import { apiError, parseJson } from "../http";

// Learning time (C15, docs/learning-time.md): the send route with its limits, the snapshots the medians use, and the lesson box's
// times. Rows are private to their account; medians carry only a duration and a learner count.

// The first accepted send of an account may carry at most this much; later ones at most the time since the previous one.
export const FIRST_SEND_SECONDS = 600;
const DAY_MS = 86_400_000;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** A learner's local day is never more than one day from the server's UTC day. */
export const dayInWindow = (day: string, now: number) => [now - DAY_MS, now, now + DAY_MS].map(utcDay).includes(day);

/** Scales seconds down proportionally (rounding down) so their total fits `allowed`. */
export function clampSeconds(seconds: readonly number[], allowed: number): number[] {
  const total = seconds.reduce((sum, value) => sum + value, 0);
  if (total <= allowed) return [...seconds];
  const factor = Math.max(0, allowed) / total;
  return seconds.map((value) => Math.floor(value * factor));
}

/** The median, rounded to whole seconds, or null for no values. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2);
}

// The learner's reading seconds in a lesson, as a subquery over the given placeholders.
export const readingSecondsSql = (user: string, lesson: string) =>
  `(SELECT SUM(seconds) FROM learning_time WHERE user_id = ${user} AND lesson_id = ${lesson} AND activity = 'reading')`;
// The learner's practice seconds in one practice block, as a subquery over the given placeholders.
export const practiceSecondsSql = (user: string, lesson: string, practice: string) =>
  `(SELECT SUM(seconds) FROM learning_time WHERE user_id = ${user} AND lesson_id = ${lesson} AND practice_id = ${practice} AND activity = 'practice')`;

const rowsOf = <T,>(result: D1Result | undefined) => (result?.results ?? []) as T[];
const typical = (seconds: number | null, learners: number): TypicalTime | null => seconds === null || !learners ? null : { seconds, learners };

/**
 * The viewer's own reading and practice seconds in the lesson, and its typical times: reading is the median of every
 * completion's reading snapshot; practice is the sum of each practice's median done snapshot, over the learners with one.
 * Callers authorize first.
 */
export async function readLessonTime(db: D1Database, lessonId: string, userId: string): Promise<LessonTime> {
  const [own, completions, practices] = await db.batch([
    db.prepare(`SELECT COALESCE(SUM(CASE WHEN activity = 'reading' THEN seconds END), 0) AS reading,
        COALESCE(SUM(CASE WHEN activity IN ('practice', 'ai_practice') THEN seconds END), 0) AS practice
      FROM learning_time WHERE user_id = ? AND lesson_id = ?`).bind(userId, lessonId),
    db.prepare("SELECT reading_seconds AS seconds FROM course_lesson_completions WHERE lesson_id = ? AND reading_seconds IS NOT NULL").bind(lessonId),
    db.prepare("SELECT practice_id AS practiceId, user_id AS userId, done_seconds AS seconds FROM course_practice_progress WHERE lesson_id = ? AND done_seconds IS NOT NULL").bind(lessonId),
  ]);
  const mine = rowsOf<{ reading: number; practice: number }>(own)[0];
  const reading = rowsOf<{ seconds: number }>(completions).map((row) => row.seconds);
  const done = rowsOf<{ practiceId: string; userId: string; seconds: number }>(practices);
  const byPractice = new Map<string, number[]>();
  for (const row of done) byPractice.set(row.practiceId, [...byPractice.get(row.practiceId) ?? [], row.seconds]);
  const practiceSum = byPractice.size ? [...byPractice.values()].reduce((sum, values) => sum + median(values)!, 0) : null;
  return {
    readingSeconds: mine?.reading ?? 0, practiceSeconds: mine?.practice ?? 0,
    typical: { reading: typical(median(reading), reading.length), practice: typical(practiceSum, new Set(done.map((row) => row.userId)).size) },
  };
}

/** The practice block IDs of a published document, at any depth. An unreadable document has none. */
function publishedPracticeIds(publishedDoc: string): Set<string> {
  try {
    const document = parseStoredLessonDocument(JSON.parse(publishedDoc));
    return new Set(document ? [...walkLessonBlocks(document.blocks)].filter(({ block }) => block.type === "practice").map(({ block }) => block.id) : []);
  } catch {
    return new Set();
  }
}

type Row = { activity: LearningTimeEntry["activity"]; focus: string | null; courseId: string | null; lessonId: string | null; practiceId: string | null; seconds: number };

export type LearningTimeTargets = {
  /** Whether the viewer can see the course. */
  course: (context: Context<AppEnvironment>, courseId: string) => Promise<boolean>;
  /** A published lesson of that course the viewer can read, or null. */
  lesson: (context: Context<AppEnvironment>, courseId: string, lessonId: string) => Promise<{ publishedDoc: string } | null>;
};

/**
 * `POST /api/groups/:groupId/learning-time`. Every target must be readable, or the whole send is refused. The send's total is
 * limited to the time since the account's previous accepted send, and each entry adds its seconds to its row for the day.
 */
export function registerLearningTimeRoutes(app: Hono<AppEnvironment>, deps: { requireGroupAccess: MiddlewareHandler<AppEnvironment>; targets: LearningTimeTargets }) {
  app.post("/api/groups/:groupId/learning-time", deps.requireGroupAccess, async (context) => {
    const parsed = await parseJson(context, learningTimeRequestSchema); if ("response" in parsed) return parsed.response;
    const now = Date.now(); const { day, entries } = parsed.data;
    if (!dayInWindow(day, now)) return apiError(context, 400, "VALIDATION_ERROR", "That day is not today.");
    const db = context.env.DB; const userId = context.get("user")!.id;
    const missing = () => apiError(context, 404, "LEARNING_TARGET_NOT_FOUND", "Something this time was spent on is not available.");
    const courses = new Map<string, boolean>(); const lessons = new Map<string, { publishedDoc: string } | null>();
    const rows: Row[] = [];
    for (const entry of entries) {
      const courseId = "courseId" in entry ? entry.courseId ?? null : null;
      if (courseId !== null && !courses.has(courseId)) courses.set(courseId, await deps.targets.course(context, courseId));
      if (courseId !== null && !courses.get(courseId)) return missing();
      if (!("lessonId" in entry)) { rows.push({ activity: entry.activity, focus: null, courseId, lessonId: null, practiceId: null, seconds: entry.seconds }); continue; }
      const lessonKey = `${courseId}|${entry.lessonId}`;
      if (!lessons.has(lessonKey)) lessons.set(lessonKey, await deps.targets.lesson(context, entry.courseId, entry.lessonId));
      const lesson = lessons.get(lessonKey);
      if (!lesson) return missing();
      if (entry.activity === "reading") {
        rows.push({ activity: "reading", focus: entry.focus, courseId, lessonId: entry.lessonId, practiceId: null, seconds: entry.seconds });
      } else if (entry.activity === "practice") {
        if (!publishedPracticeIds(lesson.publishedDoc).has(entry.practiceId)) return missing();
        rows.push({ activity: "practice", focus: null, courseId, lessonId: entry.lessonId, practiceId: entry.practiceId, seconds: entry.seconds });
      } else {
        const tagged = await db.prepare("SELECT p.focus FROM ai_practice_lessons t JOIN ai_practices p ON p.id = t.practice_id WHERE t.lesson_id = ? AND t.practice_id = ?")
          .bind(entry.lessonId, entry.practiceId).first<{ focus: string }>();
        if (!tagged) return missing();
        rows.push({ activity: "ai_practice", focus: tagged.focus, courseId, lessonId: entry.lessonId, practiceId: entry.practiceId, seconds: entry.seconds });
      }
    }
    // Entries for the same target are added together before the limit.
    const merged = new Map<string, Row>();
    for (const row of rows) {
      const key = [day, row.activity, row.focus ?? "", row.courseId ?? "", row.lessonId ?? "", row.practiceId ?? ""].join("|");
      const existing = merged.get(key);
      merged.set(key, existing ? { ...existing, seconds: existing.seconds + row.seconds } : row);
    }
    const last = await db.prepare("SELECT MAX(updated_at) AS at FROM learning_time WHERE user_id = ?").bind(userId).first<{ at: number | null }>();
    const allowed = last?.at ? Math.floor((now - last.at) / 1000) : FIRST_SEND_SECONDS;
    const keyed = [...merged.entries()];
    const seconds = clampSeconds(keyed.map(([, row]) => row.seconds), allowed);
    const statements = keyed.flatMap(([key, row], index) => seconds[index]! > 0 ? [db.prepare(
      `INSERT INTO learning_time (user_id, entry_key, day, activity, focus, course_id, lesson_id, practice_id, seconds, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, entry_key) DO UPDATE SET seconds = learning_time.seconds + excluded.seconds, updated_at = excluded.updated_at`,
    ).bind(userId, key, day, row.activity, row.focus, row.courseId, row.lessonId, row.practiceId, seconds[index]!, now)] : []);
    if (statements.length) await db.batch(statements);
    return context.body(null, 204);
  });
}
