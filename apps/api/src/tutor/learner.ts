import { wordSearchKey } from "@wordinator/contracts/lesson-document";
import { courseVisibleClause } from "../courseVisibility";
import { readWeakWords } from "../weakWords";
import { accountLibrary, readableLessonsFrom } from "./library";

// The learner's own learning data as the tutor reads it: the snapshot and the read tools (docs/ai-tutor.md#learner-context).
// Every query is scoped to the signed-in account and to lessons it can read.

export type RecentLesson = {
  lessonId: string; title: string; courseId: string; courseTitle: string; completed: boolean; storylinePercent: number | null; at: number;
};

/** Lessons the learner moved in or completed most recently. */
export async function recentLessons(db: D1Database, userId: string, limit: number): Promise<RecentLesson[]> {
  const from = readableLessonsFrom(userId);
  const rows = await db.prepare(
    `SELECT rl.lessonId, rl.title, rl.courseId, rl.courseTitle,
       clc.completed_at IS NOT NULL AS completed, p.passed_steps AS passedSteps, p.total_steps AS totalSteps,
       MAX(COALESCE(p.updated_at, 0), COALESCE(clc.completed_at, 0)) AS at
     FROM (SELECT l.id AS lessonId, l.title, c.id AS courseId, c.title AS courseTitle ${from.sql}) rl
     LEFT JOIN course_lesson_positions p ON p.lesson_id = rl.lessonId AND p.user_id = ?
     LEFT JOIN course_lesson_completions clc ON clc.lesson_id = rl.lessonId AND clc.user_id = ?
     WHERE p.lesson_id IS NOT NULL OR clc.lesson_id IS NOT NULL
     ORDER BY at DESC, rl.lessonId LIMIT ?`,
  ).bind(...from.values, userId, userId, limit)
    .all<Omit<RecentLesson, "completed" | "storylinePercent"> & { completed: number; passedSteps: number | null; totalSteps: number | null }>();
  return rows.results.map(({ passedSteps, totalSteps, completed, ...row }) => ({
    ...row, completed: completed === 1,
    storylinePercent: completed === 1 ? 100 : totalSteps ? Math.min(100, Math.floor(((passedSteps ?? 0) / totalSteps) * 100)) : null,
  }));
}

/** The learner's weakest remembered words, by the shared weakness ranking. */
export async function weakestWords(db: D1Database, userId: string, limit: number, now = Date.now()) {
  const library = await accountLibrary(db, userId);
  if (!library) return [];
  const page = await readWeakWords(db, { userId, groupId: library.groupId, visible: courseVisibleClause(userId, library.creatorUserId), cursor: null, now });
  return page.rows.slice(0, limit).map(({ occurrence, recent }) => ({
    lessonId: occurrence.lessonId, wordId: occurrence.id, term: occurrence.term, meaning: occurrence.meaning, lessonTitle: occurrence.lessonTitle, recent,
  }));
}

/** The words the learner reviewed most recently, one row per term, with the latest result. */
export async function recentWords(db: D1Database, userId: string, limit: number) {
  const from = readableLessonsFrom(userId);
  const rows = await db.prepare(
    `SELECT r.term_key AS termKey, r.lesson_id AS lessonId, r.word_id AS wordId, r.direction, r.result, r.source, r.created_at AS at, w.term, w.meaning
     FROM word_reviews r JOIN course_lesson_words w ON w.lesson_id = r.lesson_id AND w.word_id = r.word_id
     WHERE r.user_id = ? AND r.source <> 'seed' AND r.lesson_id IN (SELECT l.id ${from.sql})
     ORDER BY r.created_at DESC, r.id DESC LIMIT 200`,
  ).bind(userId, ...from.values).all<{ termKey: string; lessonId: string; wordId: string; direction: string; result: string; source: string; at: number; term: string; meaning: string }>();
  const seen = new Set<string>();
  return rows.results.filter((row) => !seen.has(row.termKey) && seen.add(row.termKey)).slice(0, limit)
    .map(({ termKey: _termKey, ...row }) => row);
}

/** The learner's most recent practice misses: no match and no acceptable verdict. */
export async function recentMistakes(db: D1Database, userId: string, limit: number) {
  const from = readableLessonsFrom(userId);
  const rows = await db.prepare(
    `SELECT prompt, answer, reference, ai_verdict AS verdict, ai_note AS note, source, lesson_id AS lessonId, created_at AS at
     FROM practice_attempts WHERE user_id = ? AND matched = 0 AND (ai_verdict IS NULL OR ai_verdict = 'error')
       AND lesson_id IN (SELECT l.id ${from.sql})
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(userId, ...from.values, limit).all();
  return rows.results;
}

/** Words of readable published lessons whose term, meaning, or forms contain the query, as the word search matches them. */
export async function searchWords(db: D1Database, userId: string, query: string, limit: number) {
  const key = wordSearchKey(query);
  if (!key) return [];
  const pattern = `%${key.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const from = readableLessonsFrom(userId);
  const rows = await db.prepare(
    `SELECT w.lesson_id AS lessonId, w.word_id AS wordId, w.term, w.meaning, w.forms, w.example, l.title AS lessonTitle, c.title AS courseTitle
     FROM course_lesson_words w JOIN course_lessons l ON l.id = w.lesson_id JOIN courses c ON c.id = w.course_id
     WHERE w.lesson_id IN (SELECT l.id ${from.sql})
       AND (w.search_key LIKE ? ESCAPE '\\' OR (w.search_key IS NULL AND (lower(w.term) LIKE ? ESCAPE '\\' OR lower(w.meaning) LIKE ? ESCAPE '\\')))
     ORDER BY w.term_key, w.lesson_id, w.word_id LIMIT ?`,
  ).bind(...from.values, pattern, pattern, pattern, limit).all();
  return rows.results;
}
