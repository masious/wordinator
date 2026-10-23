import type { LessonProgressResponse } from "@wordinator/contracts";
import { sharePercent } from "@wordinator/contracts/learning";
import { flattenToSteps, readingReached, readPracticeBlock, walkLessonBlocks, type LessonBlockOf, type LessonDocument, type LessonStep } from "@wordinator/contracts/lesson-document";
import { lessonMemoryKeys, memoryRebuildStatements } from "../learningData";
import { aiPracticeCounts } from "../tutor/aiPractices";
import { courseComplete, deriveLessonStates } from "./lessonStates";
import { lessonShareColumns, shareOfRow, startedRow, type LessonShareInputs } from "./lessonShare";
import { readingSecondsSql } from "./time";

// The viewer's lesson progress, lesson completion, and lesson reset (docs/courses.md#lesson-states, #lesson-progress-tab,
// #reset), shared by the course routes and the AI tutor. Callers authorize first: these helpers trust the course, lesson, and
// user they are given, and every read and write is scoped to that one user.

export type CourseRef = { groupId: string; id: string };
export type LessonTarget = { groupId: string; courseId: string; lessonId: string; userId: string };
export type ProgressActor = { actor: "user" | "agent"; conversationId?: string | null };

type LessonProgressRow = LessonShareInputs & {
  lessonId: string; slug: string; title: string; wordsTotal: number; wordsReviewed: number; practiceIds: string;
};

/**
 * Every currently published lesson of the course in outline order with the viewer's derived state, lesson share (half reading,
 * half practices; see lessonShare.ts), practices done of total, words reviewed of total, and AI practice count, plus course
 * completion. A saved practice count is done once it reaches its practice's current number of questions.
 */
export async function readLessonProgress(db: D1Database, course: CourseRef, userId: string): Promise<LessonProgressResponse> {
  const rows = await db.prepare(
    `SELECT l.id AS lessonId, l.slug, l.title, ${lessonShareColumns("?1")},
       (SELECT COUNT(*) FROM course_lesson_words w WHERE w.lesson_id = l.id) AS wordsTotal,
       (SELECT COUNT(*) FROM course_lesson_words w WHERE w.lesson_id = l.id
         AND EXISTS (SELECT 1 FROM word_memory m WHERE m.user_id = ?1 AND m.term_key = w.term_key)) AS wordsReviewed,
       (SELECT json_group_array(cp.id) FROM course_practices cp WHERE cp.lesson_id = l.id) AS practiceIds
     FROM course_lessons l
     WHERE l.group_id = ?2 AND l.course_id = ?3 AND l.published_doc IS NOT NULL
     ORDER BY l.position, l.created_at, l.id`,
  ).bind(userId, course.groupId, course.id).all<LessonProgressRow>();
  const aiPractices = await aiPracticeCounts(db, rows.results.map((row) => row.lessonId));
  const states = deriveLessonStates(rows.results.map((row) => ({ completed: row.shareCompleted === 1, started: startedRow(row) })));
  const lessons = rows.results.map((row, index) => {
    const state = states[index]!;
    return {
      lessonId: row.lessonId, slug: row.slug, title: row.title, state, storylinePercent: sharePercent(shareOfRow(row)),
      practicesDone: Math.min(row.sharePracticesDone, row.sharePracticesTotal), practicesTotal: row.sharePracticesTotal,
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

// The lesson's indexed terms, matched as in the lesson box (learning/metrics.ts); binds the lesson ID as ?2.
export const LESSON_TERMS = "SELECT w.term_key FROM course_lesson_words w WHERE w.lesson_id = ?2 AND w.term_key IS NOT NULL";

const eventStatement = (db: D1Database, target: LessonTarget, kind: "lesson_completed" | "lesson_reset", by: ProgressActor, now: number) => db.prepare(
  `INSERT INTO progress_events (id, user_id, actor, kind, course_id, lesson_id, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
).bind(crypto.randomUUID(), target.userId, by.actor, kind, target.courseId, target.lessonId, by.conversationId ?? null, now);

/**
 * Records the lesson's completion once (repeating keeps the first, with its reading-time snapshot) and drops its saved position, in one batch. Only a new
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
      `INSERT INTO course_lesson_completions (group_id, course_id, lesson_id, user_id, completed_at, reading_seconds) VALUES (?1, ?2, ?3, ?4, ?5, ${readingSecondsSql("?4", "?3")})
       ON CONFLICT (lesson_id, user_id) DO NOTHING`,
    ).bind(groupId, courseId, lessonId, userId, now),
    db.prepare("DELETE FROM course_lesson_positions WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND user_id = ?").bind(groupId, courseId, lessonId, userId),
  ]);
}

/**
 * Starts a lesson over for one user, in one D1 batch: deletes their position, completion, practice progress for the lesson's
 * practices, practice attempts for the lesson (any source), the learner's lesson activity runs (and their answers) for the lesson's activities, learning time in it, bookmarks of its words, and every word review, word memory row, and
 * pronunciation attempt that the lesson box counts for it (recorded from the lesson or for any of its terms, so a term shared with
 * another lesson starts over there too). Memory of other terms the lesson's reviews touched is rebuilt from the reviews that
 * remain. Writes a `lesson_reset` audit row. Shares and conversations are kept. The caller checks that the course is not
 * archived and the lesson is readable.
 */
export async function resetLesson(db: D1Database, target: LessonTarget, by: ProgressActor, now = Date.now()): Promise<void> {
  const { groupId, courseId, lessonId, userId } = target;
  const memoryRebuild = await memoryRebuildStatements(db, await lessonMemoryKeys(db, lessonId, userId), { withoutLessonId: lessonId });
  await db.batch([
    db.prepare("DELETE FROM course_lesson_positions WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND user_id = ?").bind(groupId, courseId, lessonId, userId),
    db.prepare("DELETE FROM course_lesson_completions WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND user_id = ?").bind(groupId, courseId, lessonId, userId),
    db.prepare("DELETE FROM course_practice_progress WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND user_id = ?").bind(groupId, courseId, lessonId, userId),
    db.prepare("DELETE FROM practice_attempts WHERE user_id = ? AND course_id = ? AND lesson_id = ?").bind(userId, courseId, lessonId),
    db.prepare("DELETE FROM lesson_activity_runs WHERE user_id = ? AND activity_id IN (SELECT id FROM lesson_activities WHERE lesson_id = ?)").bind(userId, lessonId),
    db.prepare(`DELETE FROM word_reviews WHERE user_id = ?1 AND (lesson_id = ?2 OR term_key IN (${LESSON_TERMS}))`).bind(userId, lessonId),
    ...memoryRebuild,
    db.prepare(`DELETE FROM word_memory WHERE user_id = ?1 AND term_key IN (${LESSON_TERMS})`).bind(userId, lessonId),
    db.prepare(`DELETE FROM pronunciation_attempts WHERE user_id = ?1 AND (lesson_id = ?2 OR term_key IN (${LESSON_TERMS}))`).bind(userId, lessonId),
    db.prepare("DELETE FROM course_word_bookmarks WHERE user_id = ? AND lesson_id = ?").bind(userId, lessonId),
    db.prepare("DELETE FROM word_exposures WHERE user_id = ? AND lesson_id = ?").bind(userId, lessonId),
    db.prepare("DELETE FROM learning_time WHERE user_id = ? AND lesson_id = ?").bind(userId, lessonId),
    eventStatement(db, target, "lesson_reset", by, now),
  ]);
}

/**
 * Records the lesson's completion once the viewer has reached its last reading step and answered every question of every
 * practice, so the lesson page completes a lesson at 100%. Returns whether the lesson is complete after this call. The caller
 * checks that the course is not archived and passes the published document.
 */
export async function completeIfWhole(db: D1Database, target: LessonTarget, document: LessonDocument): Promise<boolean> {
  const steps = flattenToSteps(document);
  const readingTotal = readingReached(steps, -1).total;
  const practices = [...walkLessonBlocks(document.blocks)].flatMap(({ block }) => block.type === "practice"
    ? [{ id: block.id, questions: readPracticeBlock(block as LessonBlockOf<"practice">).items.length }] : []);
  if (!readingTotal && !practices.length) return false;
  const [completed, position, progress] = await db.batch([
    db.prepare("SELECT 1 AS found FROM course_lesson_completions WHERE lesson_id = ? AND user_id = ?").bind(target.lessonId, target.userId),
    db.prepare("SELECT reading_reached AS reached FROM course_lesson_positions WHERE lesson_id = ? AND user_id = ?").bind(target.lessonId, target.userId),
    db.prepare("SELECT practice_id AS practiceId, answered FROM course_practice_progress WHERE lesson_id = ? AND user_id = ?").bind(target.lessonId, target.userId),
  ]);
  if (completed?.results.length) return true;
  const reached = (position?.results[0] as { reached: number | null } | undefined)?.reached ?? 0;
  const answered = new Map((progress?.results as Array<{ practiceId: string; answered: number }> | undefined ?? []).map((row) => [row.practiceId, row.answered]));
  const whole = reached >= readingTotal && practices.every((practice) => (answered.get(practice.id) ?? 0) >= practice.questions);
  if (whole) await completeLesson(db, target, { actor: "user" });
  return whole;
}

/**
 * Saves the step a reader is on (the PUT position route's write, shared with guided grammar answers): the furthest share passed
 * and the reading steps reached never shrink. Callers authorize, resolve `stepIndex` in `steps`, and check the course is not archived.
 */
export async function saveLessonPosition(db: D1Database, target: LessonTarget, steps: readonly LessonStep[], stepIndex: number, stepKey: string) {
  // Reading steps reached (every step but practice questions) feed the reading half of the lesson share, and never shrink either.
  const reading = readingReached(steps, stepIndex);
  return db.prepare(
    `INSERT INTO course_lesson_positions (group_id, course_id, lesson_id, user_id, step_key, step_index, passed_steps, total_steps, reading_reached, reading_total, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (lesson_id, user_id) DO UPDATE SET step_key = excluded.step_key, step_index = excluded.step_index,
       passed_steps = MAX(excluded.passed_steps, MIN(course_lesson_positions.passed_steps, excluded.total_steps - 1)),
       total_steps = excluded.total_steps,
       reading_reached = MIN(MAX(excluded.reading_reached, COALESCE(course_lesson_positions.reading_reached, 0)), excluded.reading_total),
       reading_total = excluded.reading_total, updated_at = excluded.updated_at
     RETURNING lesson_id AS lessonId, step_key AS stepKey, step_index AS stepIndex, passed_steps AS passedSteps, total_steps AS totalSteps, updated_at AS updatedAt`,
  ).bind(target.groupId, target.courseId, target.lessonId, target.userId, stepKey, stepIndex, stepIndex, steps.length, reading.reached, reading.total, Date.now()).first();
}
