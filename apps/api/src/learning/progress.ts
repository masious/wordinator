import type { LessonProgressResponse } from "@wordinator/contracts";
import { lessonMemoryKeys, memoryRebuildStatements } from "../learningData";
import { aiPracticeCounts } from "../tutor/aiPractices";
import { courseComplete, deriveLessonStates } from "./lessonStates";

// The viewer's lesson progress, lesson completion, and lesson reset (docs/courses.md#lesson-states, #lesson-progress-tab,
// #reset), shared by the course routes and the AI tutor. Callers authorize first: these helpers trust the course, lesson, and
// user they are given, and every read and write is scoped to that one user.

export type CourseRef = { groupId: string; id: string };
export type LessonTarget = { groupId: string; courseId: string; lessonId: string; userId: string };
export type ProgressActor = { actor: "user" | "agent"; conversationId?: string | null };

type LessonProgressRow = {
  lessonId: string; slug: string; title: string; completed: number; passedSteps: number | null; totalSteps: number | null;
  practicesTotal: number; practicesDone: number; wordsTotal: number; wordsReviewed: number; practiceIds: string;
};

/**
 * Every currently published lesson of the course in outline order with the viewer's derived state, storyline share, practices
 * done of total, words reviewed of total, and AI practice count, plus course completion. Practice done counts follow the
 * course progress read: a saved count is done once it reaches its practice's current number of questions.
 */
export async function readLessonProgress(db: D1Database, course: CourseRef, userId: string): Promise<LessonProgressResponse> {
  const rows = await db.prepare(
    `SELECT l.id AS lessonId, l.slug, l.title,
       EXISTS (SELECT 1 FROM course_lesson_completions c WHERE c.lesson_id = l.id AND c.user_id = ?1) AS completed,
       p.passed_steps AS passedSteps, p.total_steps AS totalSteps,
       (SELECT COUNT(*) FROM json_tree(l.published_doc) WHERE json_tree.key = 'type' AND json_tree.atom = 'practice') AS practicesTotal,
       (SELECT COALESCE(SUM(EXISTS (SELECT 1 FROM json_tree(l.published_doc) t WHERE t.key = 'id' AND t.atom = pp.practice_id
           AND json_extract(l.published_doc, t.path || '.type') = 'practice'
           AND pp.answered >= json_array_length(json_extract(l.published_doc, t.path || '.props.data'), '$.items'))), 0)
         FROM course_practice_progress pp WHERE pp.lesson_id = l.id AND pp.user_id = ?1) AS practicesDone,
       (SELECT COUNT(*) FROM course_lesson_words w WHERE w.lesson_id = l.id) AS wordsTotal,
       (SELECT COUNT(*) FROM course_lesson_words w WHERE w.lesson_id = l.id
         AND EXISTS (SELECT 1 FROM word_memory m WHERE m.user_id = ?1 AND m.term_key = w.term_key)) AS wordsReviewed,
       (SELECT json_group_array(cp.id) FROM course_practices cp WHERE cp.lesson_id = l.id) AS practiceIds
     FROM course_lessons l
     LEFT JOIN course_lesson_positions p ON p.lesson_id = l.id AND p.user_id = ?1
     WHERE l.group_id = ?2 AND l.course_id = ?3 AND l.published_doc IS NOT NULL
     ORDER BY l.position, l.created_at, l.id`,
  ).bind(userId, course.groupId, course.id).all<LessonProgressRow>();
  const aiPractices = await aiPracticeCounts(db, rows.results.map((row) => row.lessonId));
  const states = deriveLessonStates(rows.results.map((row) => ({ completed: row.completed === 1, started: row.totalSteps !== null })));
  const lessons = rows.results.map((row, index) => {
    const state = states[index]!;
    const storylinePercent = state === "completed" ? 100
      : row.totalSteps ? Math.min(100, Math.floor(((row.passedSteps ?? 0) / row.totalSteps) * 100 + 1e-9)) : 0;
    return {
      lessonId: row.lessonId, slug: row.slug, title: row.title, state, storylinePercent,
      practicesDone: Math.min(row.practicesDone, row.practicesTotal), practicesTotal: row.practicesTotal,
      wordsReviewed: row.wordsReviewed, wordsTotal: row.wordsTotal, aiPracticeCount: aiPractices.get(row.lessonId) ?? 0,
      practiceIds: JSON.parse(row.practiceIds) as string[],
    };
  });
  return {
    complete: courseComplete(states), publishedLessons: lessons.length,
    completedLessons: states.filter((state) => state === "completed").length, missedLessons: states.filter((state) => state === "missed").length,
    lessons,
  };
}

const eventStatement = (db: D1Database, target: LessonTarget, kind: "lesson_completed" | "lesson_reset", by: ProgressActor, now: number) => db.prepare(
  `INSERT INTO progress_events (id, user_id, actor, kind, course_id, lesson_id, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
).bind(crypto.randomUUID(), target.userId, by.actor, kind, target.courseId, target.lessonId, by.conversationId ?? null, now);

/**
 * Records the lesson's completion once (repeating keeps the first) and drops its saved position, in one batch. Only a new
 * completion writes a `lesson_completed` audit row. The caller checks that the course is not archived and the lesson is published.
 */
export async function completeLesson(db: D1Database, target: LessonTarget, by: ProgressActor, now = Date.now()): Promise<void> {
  const { groupId, courseId, lessonId, userId } = target;
  await db.batch([
    db.prepare(
      `INSERT INTO progress_events (id, user_id, actor, kind, course_id, lesson_id, conversation_id, created_at)
       SELECT ?, ?, ?, 'lesson_completed', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM course_lesson_completions WHERE lesson_id = ? AND user_id = ?)`,
    ).bind(crypto.randomUUID(), userId, by.actor, courseId, lessonId, by.conversationId ?? null, now, lessonId, userId),
    db.prepare(
      `INSERT INTO course_lesson_completions (group_id, course_id, lesson_id, user_id, completed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (lesson_id, user_id) DO NOTHING`,
    ).bind(groupId, courseId, lessonId, userId, now),
    db.prepare("DELETE FROM course_lesson_positions WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND user_id = ?").bind(groupId, courseId, lessonId, userId),
  ]);
}

/**
 * Starts a lesson over for one user, in one D1 batch: deletes their position, completion, practice progress for the lesson's
 * practices, practice attempts for the lesson (any source), and word reviews recorded from it, then rebuilds the memory of the
 * terms those reviews touched from the reviews that remain, and writes a `lesson_reset` audit row. Bookmarks, pronunciation
 * attempts, shares, and conversations are kept. The caller checks that the course is not archived and the lesson is readable.
 */
export async function resetLesson(db: D1Database, target: LessonTarget, by: ProgressActor, now = Date.now()): Promise<void> {
  const { groupId, courseId, lessonId, userId } = target;
  const memoryRebuild = await memoryRebuildStatements(db, await lessonMemoryKeys(db, lessonId, userId), { withoutLessonId: lessonId });
  await db.batch([
    db.prepare("DELETE FROM course_lesson_positions WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND user_id = ?").bind(groupId, courseId, lessonId, userId),
    db.prepare("DELETE FROM course_lesson_completions WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND user_id = ?").bind(groupId, courseId, lessonId, userId),
    db.prepare("DELETE FROM course_practice_progress WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND user_id = ?").bind(groupId, courseId, lessonId, userId),
    db.prepare("DELETE FROM practice_attempts WHERE user_id = ? AND course_id = ? AND lesson_id = ?").bind(userId, courseId, lessonId),
    db.prepare("DELETE FROM word_reviews WHERE user_id = ? AND lesson_id = ?").bind(userId, lessonId),
    ...memoryRebuild,
    eventStatement(db, target, "lesson_reset", by, now),
  ]);
}
