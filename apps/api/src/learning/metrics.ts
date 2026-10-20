import type { LessonMetricsResponse } from "@wordinator/contracts/learning";
import { recallProbability } from "../wordMemory";

// The viewer's lesson metrics for the lesson page's lesson box (docs/courses.md#lesson-box), computed at read time. Callers
// authorize first: this trusts the lesson and user it is given, and every read is scoped to that one user.

// A term counts as remembered well while its recall now is at least this in every direction it has been reviewed in.
export const LESSON_STRONG_RECALL = 0.8;

type MemoryRow = { termKey: string; stability: number; lastReviewedAt: number; known: number };
const rowsOf = <T,>(result: D1Result | undefined) => (result?.results ?? []) as T[];

/**
 * Pronunciation: the viewer's attempts on the lesson's words, matched by the lesson word they were recorded for or by the term
 * key of any of its indexed words (a drill or the tutor may record the same term from elsewhere). Fluency is the rounded mean.
 * Words: the lesson's distinct term keys, those with word memory, and those remembered well (marked known, or recall now at least
 * `LESSON_STRONG_RECALL` in each reviewed direction). Last studied: the latest of the reading position, a lesson completion, a
 * practice attempt, a word review of the lesson's words, and a spoken attempt counted above.
 */
export async function readLessonMetrics(db: D1Database, lessonId: string, userId: string, now = Date.now()): Promise<Omit<LessonMetricsResponse, "time">> {
  const lessonTerms = "SELECT w.term_key FROM course_lesson_words w WHERE w.lesson_id = ?2 AND w.term_key IS NOT NULL";
  const spoken = `p.user_id = ?1 AND (p.lesson_id = ?2 OR p.term_key IN (${lessonTerms}))`;
  const [pronunciation, terms, memory, recency] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS attempts, AVG(p.fluency) AS fluency FROM pronunciation_attempts p WHERE ${spoken}`).bind(userId, lessonId),
    db.prepare(`SELECT COUNT(DISTINCT w.term_key) AS total FROM course_lesson_words w WHERE w.lesson_id = ?1 AND w.term_key IS NOT NULL`).bind(lessonId),
    db.prepare(`SELECT m.term_key AS termKey, m.stability, m.last_reviewed_at AS lastReviewedAt, m.known_override AS known FROM word_memory m
      WHERE m.user_id = ?1 AND m.term_key IN (${lessonTerms})`).bind(userId, lessonId),
    db.prepare(`SELECT MAX(at) AS at FROM (
        SELECT updated_at AS at FROM course_lesson_positions WHERE user_id = ?1 AND lesson_id = ?2
        UNION ALL SELECT created_at FROM progress_events WHERE user_id = ?1 AND lesson_id = ?2 AND kind = 'lesson_completed'
        UNION ALL SELECT created_at FROM practice_attempts WHERE user_id = ?1 AND lesson_id = ?2
        UNION ALL SELECT created_at FROM word_reviews WHERE user_id = ?1 AND lesson_id = ?2
        UNION ALL SELECT p.created_at FROM pronunciation_attempts p WHERE ${spoken})`).bind(userId, lessonId),
  ]);
  const spokenRow = rowsOf<{ attempts: number; fluency: number | null }>(pronunciation)[0];
  const attempts = spokenRow?.attempts ?? 0;
  const byTerm = new Map<string, MemoryRow[]>();
  for (const row of rowsOf<MemoryRow>(memory)) byTerm.set(row.termKey, [...byTerm.get(row.termKey) ?? [], row]);
  const strong = [...byTerm.values()].filter((rows) => rows.some((row) => row.known === 1)
    || rows.every((row) => recallProbability(row, now) >= LESSON_STRONG_RECALL)).length;
  const lastStudiedAt = rowsOf<{ at: number | null }>(recency)[0]?.at ?? null;
  return {
    pronunciation: { attempts, fluency: attempts && spokenRow?.fluency !== null && spokenRow?.fluency !== undefined ? Math.round(spokenRow.fluency) : null },
    words: { total: rowsOf<{ total: number }>(terms)[0]?.total ?? 0, practised: byTerm.size, strong },
    lastStudiedAt,
  };
}
