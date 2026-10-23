import type { WordDrillDirection, WordDrillResult } from "@wordinator/contracts/lesson-document";
import { foldWordReview, rebuildWordMemory, type FoldableWordReview, type WordMemoryKey, type WordMemoryState, type WordReviewSource } from "./wordMemory";

// D1 access for word reviews and word memory (docs/words.md#word-memory), shared by Drill, lesson deletion, reset, and the
// tutor. Callers authorize first: these helpers trust the user, lesson, and word IDs they are given. Every read and write is
// scoped by user ID. Keys and rows travel as one JSON parameter (`json_each`) to stay under D1's bound-parameter limit.

export type NewWordReview = {
  termKey: string; direction: WordDrillDirection; result: WordDrillResult; source: Exclude<WordReviewSource, "seed">;
  courseId: string; lessonId: string; wordId: string; conversationId?: string | null; createdAt?: number;
};
export type WordMemoryRow = WordMemoryKey & WordMemoryState;

const CHUNK = 100;
const chunked = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) => items.slice(index * CHUNK, (index + 1) * CHUNK));
const keyId = (key: WordMemoryKey) => `${key.userId}\n${key.termKey}\n${key.direction}`;
const uniqueKeys = (keys: readonly WordMemoryKey[]) => [...new Map(keys.map((key) => [keyId(key), key])).values()];
const keysJson = (keys: readonly WordMemoryKey[]) => JSON.stringify(keys.map((key) => [key.userId, key.termKey, key.direction]));
const KEY_MATCH = "(user_id, term_key, direction) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]') FROM json_each(?))";

type StoredMemory = Omit<WordMemoryRow, "knownOverride"> & { knownOverride: number };
export async function readWordMemory(db: D1Database, keys: readonly WordMemoryKey[]): Promise<Map<string, WordMemoryRow>> {
  const rows = new Map<string, WordMemoryRow>();
  for (const part of chunked(uniqueKeys(keys))) {
    const found = await db.prepare(
      `SELECT user_id AS userId, term_key AS termKey, direction, course_id AS courseId, lesson_id AS lessonId, word_id AS wordId, recent, reps,
         lapses, last_lapse_at AS lastLapseAt, stability, difficulty, last_reviewed_at AS lastReviewedAt, known_override AS knownOverride
       FROM word_memory WHERE ${KEY_MATCH}`,
    ).bind(keysJson(part)).all<StoredMemory>();
    for (const row of found.results) rows.set(keyId(row), { ...row, knownOverride: row.knownOverride === 1 });
  }
  return rows;
}

const MEMORY_FIELDS = [
  ["user_id", "userId"], ["term_key", "termKey"], ["direction", "direction"], ["course_id", "courseId"], ["lesson_id", "lessonId"],
  ["word_id", "wordId"], ["recent", "recent"], ["reps", "reps"], ["lapses", "lapses"], ["last_lapse_at", "lastLapseAt"],
  ["stability", "stability"], ["difficulty", "difficulty"], ["last_reviewed_at", "lastReviewedAt"], ["known_override", "knownOverride"],
] as const;
function upsertMemoryStatements(db: D1Database, rows: readonly WordMemoryRow[]): D1PreparedStatement[] {
  return chunked(rows).map((part) => db.prepare(
    `INSERT INTO word_memory (${MEMORY_FIELDS.map(([column]) => column).join(", ")})
     SELECT ${MEMORY_FIELDS.map(([, field]) => `json_extract(value, '$.${field}')`).join(", ")} FROM json_each(?) WHERE true
     ON CONFLICT (user_id, term_key, direction) DO UPDATE SET
       ${MEMORY_FIELDS.slice(3).map(([column]) => `${column} = excluded.${column}`).join(", ")}`,
  ).bind(JSON.stringify(part.map((row) => ({ ...row, knownOverride: row.knownOverride ? 1 : 0 })))));
}

/**
 * Appends reviews for one account and folds them into its memory, in one D1 batch. Reviews are folded in (createdAt, id)
 * order, the order a rebuild replays them in. Returns the updated memory by `${termKey}\n${direction}`.
 */
export async function recordWordReviews(db: D1Database, userId: string, reviews: readonly NewWordReview[], now = Date.now()): Promise<Map<string, WordMemoryState>> {
  const stored = reviews.map((review) => ({ ...review, id: crypto.randomUUID(), createdAt: review.createdAt ?? now }))
    .sort((left, right) => left.createdAt - right.createdAt || (left.id < right.id ? -1 : 1));
  const existing = await readWordMemory(db, stored.map((review) => ({ userId, termKey: review.termKey, direction: review.direction })));
  const updated = new Map<string, WordMemoryRow>();
  for (const review of stored) {
    const key = { userId, termKey: review.termKey, direction: review.direction };
    const previous = updated.get(keyId(key)) ?? existing.get(keyId(key)) ?? null;
    updated.set(keyId(key), { ...key, ...foldWordReview(previous, { ...review, seedBox: null }) });
  }
  if (!stored.length) return new Map();
  const cleared = [...new Set(stored.filter((review) => review.result === "again").map((review) => review.termKey))];
  await db.batch([
    ...chunked(stored).map((part) => db.prepare(
      `INSERT INTO word_reviews (id, user_id, term_key, course_id, lesson_id, word_id, direction, result, source, seed_box, conversation_id, created_at)
       SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.termKey'), json_extract(value, '$.courseId'), json_extract(value, '$.lessonId'),
         json_extract(value, '$.wordId'), json_extract(value, '$.direction'), json_extract(value, '$.result'), json_extract(value, '$.source'), NULL,
         json_extract(value, '$.conversationId'), json_extract(value, '$.createdAt')
       FROM json_each(?)`,
    ).bind(userId, JSON.stringify(part.map((review) => ({ ...review, conversationId: review.conversationId ?? null }))))),
    ...upsertMemoryStatements(db, [...updated.values()]),
    // "I know this word" belongs to the term: an Again in one direction clears it in the other too (C14d).
    ...cleared.length ? [db.prepare("UPDATE word_memory SET known_override = 0 WHERE user_id = ? AND term_key IN (SELECT value FROM json_each(?))")
      .bind(userId, JSON.stringify(cleared)),
    // So does a Peek's mark on the term (docs/words.md#word-batches).
    db.prepare("UPDATE word_exposures SET known_at = NULL WHERE user_id = ? AND term_key IN (SELECT value FROM json_each(?))")
      .bind(userId, JSON.stringify(cleared))] : [],
  ]);
  return new Map([...updated.values()].map(({ userId: _userId, termKey, direction, ...state }) => [`${termKey}\n${direction}`, state]));
}

/**
 * Statements that replace the memory rows of `keys` with rows rebuilt from their reviews, leaving out the reviews of
 * `withoutLessonId` (the lesson being deleted or reset). Read now, so run them in the same batch as the deletes, after them.
 * A key with no review left loses its row; a remaining row keeps its `known_override`.
 */
export async function memoryRebuildStatements(db: D1Database, keys: readonly WordMemoryKey[], options: { withoutLessonId?: string } = {}): Promise<D1PreparedStatement[]> {
  const unique = uniqueKeys(keys);
  if (!unique.length) return [];
  const current = await readWordMemory(db, unique);
  const reviews = new Map<string, FoldableWordReview[]>();
  for (const part of chunked(unique)) {
    const found = await db.prepare(
      `SELECT user_id AS userId, term_key AS termKey, direction, result, source, seed_box AS seedBox, course_id AS courseId, lesson_id AS lessonId,
         word_id AS wordId, created_at AS createdAt
       FROM word_reviews WHERE ${KEY_MATCH} AND (?2 IS NULL OR lesson_id <> ?2)
       ORDER BY user_id, term_key, direction, created_at, id`,
    ).bind(keysJson(part), options.withoutLessonId ?? null).all<FoldableWordReview & WordMemoryKey>();
    for (const review of found.results) reviews.set(keyId(review), [...(reviews.get(keyId(review)) ?? []), review]);
  }
  const rebuilt = unique.flatMap((key): WordMemoryRow[] => {
    const state = rebuildWordMemory(reviews.get(keyId(key)) ?? [], current.get(keyId(key))?.knownOverride ?? false);
    return state ? [{ ...key, ...state }] : [];
  });
  return [
    ...chunked(unique).map((part) => db.prepare(`DELETE FROM word_memory WHERE ${KEY_MATCH}`).bind(keysJson(part))),
    ...upsertMemoryStatements(db, rebuilt),
  ];
}

/** The memory keys a lesson's reviews touch, for every account or only `userId`'s. */
export async function lessonMemoryKeys(db: D1Database, lessonId: string, userId?: string): Promise<WordMemoryKey[]> {
  const found = await db.prepare(
    "SELECT DISTINCT user_id AS userId, term_key AS termKey, direction FROM word_reviews WHERE lesson_id = ?1 AND (?2 IS NULL OR user_id = ?2)",
  ).bind(lessonId, userId ?? null).all<WordMemoryKey>();
  return found.results;
}

/** Rebuilds one account's memory of `termKeys` (both directions) from the reviews it has now. */
export async function rebuildMemory(db: D1Database, userId: string, termKeys: readonly string[]): Promise<void> {
  const keys = termKeys.flatMap((termKey) => (["understand", "produce"] as const).map((direction) => ({ userId, termKey, direction })));
  const statements = await memoryRebuildStatements(db, keys);
  if (statements.length) await db.batch(statements);
}
