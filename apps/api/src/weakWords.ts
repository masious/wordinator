import type { WordDrillDirection, WordDrillResult } from "@wordinator/contracts/lesson-document";
import { WEAK_WORDS_PAGE_SIZE } from "@wordinator/contracts/weak-words";
import { compareWordWeakness, wordWeakness, type WordWeakness } from "./wordMemory";

// The Weak words view (docs/words.md#weak-words-view) and "I know this word". The caller authorizes the group and passes
// the course visibility clause for alias `c`; every read and write here is scoped by the viewer's user ID, so another account's
// memory is never read. The order is computed in the Worker from the viewer's memory rows (a few hundred at most for this app).

type Visibility = { sql: string; values: Array<string | number> };
type MemoryRow = {
  termKey: string; direction: WordDrillDirection; lessonId: string; wordId: string; stability: number; lastReviewedAt: number; known: number; recent: string;
};
export type WeakWordOccurrence = {
  id: string; lessonId: string; term: string; meaning: string; forms: string | null; example: string | null; note: string | null; ipa: string | null;
  termKey: string; courseId: string; courseSlug: string; courseTitle: string; lessonSlug: string; lessonTitle: string;
};
export type WeakWordRow = { occurrence: WeakWordOccurrence; termKey: string; recent: WordDrillResult[] };

// The cursor pins the reference time of the first page and names the last row's sort key, so later pages continue the same
// order even as recall decays. A term whose memory changed since (a new grade) may move; it is then shown where it now ranks.
type WeakCursor = { at: number; recall: number; lastReviewedAt: number; termKey: string };
const encodeWeakCursor = (cursor: WeakCursor) => btoa(JSON.stringify([cursor.at, cursor.recall, cursor.lastReviewedAt, cursor.termKey]));
export function decodeWeakCursor(value: string): WeakCursor | null {
  try {
    const parsed: unknown = JSON.parse(atob(value));
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const [at, recall, lastReviewedAt, termKey] = parsed as unknown[];
    if (typeof at !== "number" || !Number.isFinite(at) || typeof recall !== "number" || !Number.isFinite(recall)
      || typeof lastReviewedAt !== "number" || !Number.isFinite(lastReviewedAt) || typeof termKey !== "string" || !termKey) return null;
    return { at, recall, lastReviewedAt, termKey };
  } catch { return null; }
}

type Ranked = WordWeakness & { termKey: string };
// Weakest first by the shared ranking, then by term key, so the order is total and a cursor names one place in it.
const compareRows = (left: Ranked, right: Ranked) =>
  compareWordWeakness(left, right) || (left.termKey === right.termKey ? 0 : left.termKey < right.termKey ? -1 : 1);

/**
 * One page of the viewer's weak words at `now` (or the cursor's time). A term is listed when it has memory in either
 * direction, is not marked known, and has an occurrence in a published lesson of a visible course; it ranks by its weaker
 * reviewed direction. `hasMemory` counts known terms too.
 */
export async function readWeakWords(db: D1Database, options: {
  userId: string; groupId: string; visible: Visibility; cursor: WeakCursor | null; now: number;
}): Promise<{ rows: WeakWordRow[]; nextCursor: string | null; hasMemory: boolean }> {
  const { userId, groupId, visible, cursor } = options;
  const at = cursor?.at ?? options.now;
  const memory = await db.prepare(
    `SELECT term_key AS termKey, direction, lesson_id AS lessonId, word_id AS wordId, stability, last_reviewed_at AS lastReviewedAt, known_override AS known, recent
     FROM word_memory WHERE user_id = ?`,
  ).bind(userId).all<MemoryRow>();
  if (!memory.results.length) return { rows: [], nextCursor: null, hasMemory: false };
  const occurrences = await db.prepare(
    `SELECT w.word_id AS id, w.lesson_id AS lessonId, w.term, w.meaning, w.forms, w.example, w.note, w.ipa, w.term_key AS termKey,
       c.id AS courseId, c.slug AS courseSlug, c.title AS courseTitle, l.slug AS lessonSlug, l.title AS lessonTitle
     FROM course_lesson_words w
     JOIN course_lessons l ON l.id = w.lesson_id AND l.group_id = w.group_id AND l.course_id = w.course_id AND l.published_doc IS NOT NULL
     JOIN courses c ON c.id = w.course_id AND c.group_id = w.group_id
     WHERE w.group_id = ? AND ${visible.sql} AND w.term_key IN (SELECT term_key FROM word_memory WHERE user_id = ?)
     ORDER BY c.created_at, c.id, l.position, l.id, w.position, w.word_id`,
  ).bind(groupId, ...visible.values, userId).all<WeakWordOccurrence>();
  const visibleByTerm = new Map<string, WeakWordOccurrence[]>();
  for (const occurrence of occurrences.results) visibleByTerm.set(occurrence.termKey, [...(visibleByTerm.get(occurrence.termKey) ?? []), occurrence]);
  const memoryByTerm = new Map<string, MemoryRow[]>();
  for (const row of memory.results) if (visibleByTerm.has(row.termKey)) memoryByTerm.set(row.termKey, [...(memoryByTerm.get(row.termKey) ?? []), row]);

  const ranked = [...memoryByTerm].filter(([, rows]) => !rows.some((row) => row.known === 1)).map(([termKey, rows]) => {
    const weaker = rows.map((row) => wordWeakness(row, at)).sort(compareWordWeakness)[0]!;
    return { ...weaker, termKey, rows };
  }).sort(compareRows);
  const after = cursor ? ranked.filter((row) => compareRows(row, cursor) > 0) : ranked;
  const page = after.slice(0, WEAK_WORDS_PAGE_SIZE); const tail = page.at(-1);
  const recent = await recentByTerm(db, userId, page.map((row) => row.termKey));
  return {
    rows: page.map(({ termKey, rows }) => {
      // The most recently reviewed occurrence represents the term while it is visible; otherwise the first visible one.
      const shown = visibleByTerm.get(termKey)!;
      const latest = [...rows].sort((left, right) => right.lastReviewedAt - left.lastReviewedAt)
        .map((row) => shown.find((occurrence) => occurrence.lessonId === row.lessonId && occurrence.id === row.wordId)).find(Boolean);
      return { occurrence: latest ?? shown[0]!, termKey, recent: recent.get(termKey) ?? [] };
    }),
    nextCursor: after.length > WEAK_WORDS_PAGE_SIZE && tail
      ? encodeWeakCursor({ at, recall: tail.recall, lastReviewedAt: tail.lastReviewedAt, termKey: tail.termKey }) : null,
    hasMemory: memoryByTerm.size > 0,
  };
}

// The last five results of each term across both directions, oldest first.
async function recentByTerm(db: D1Database, userId: string, termKeys: readonly string[]): Promise<Map<string, WordDrillResult[]>> {
  const recent = new Map<string, WordDrillResult[]>();
  if (!termKeys.length) return recent;
  const found = await db.prepare(
    `SELECT termKey, result FROM (
       SELECT term_key AS termKey, result, created_at, id, ROW_NUMBER() OVER (PARTITION BY term_key ORDER BY created_at DESC, id DESC) AS rank
       FROM word_reviews WHERE user_id = ? AND term_key IN (SELECT value FROM json_each(?))
     ) WHERE rank <= 5 ORDER BY termKey, created_at, id`,
  ).bind(userId, JSON.stringify(termKeys)).all<{ termKey: string; result: WordDrillResult }>();
  for (const row of found.results) recent.set(row.termKey, [...(recent.get(row.termKey) ?? []), row.result]);
  return recent;
}

/** Sets or clears "I know this word" on both directions of the viewer's memory of a term; returns how many rows it holds. */
export async function setWordKnown(db: D1Database, userId: string, termKey: string, known: boolean): Promise<number> {
  const result = await db.prepare("UPDATE word_memory SET known_override = ? WHERE user_id = ? AND term_key = ?").bind(known ? 1 : 0, userId, termKey).run();
  return result.meta.changes ?? 0;
}
