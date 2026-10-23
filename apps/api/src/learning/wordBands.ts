import { recallProbability } from "../wordMemory";

// The memory bands of a learner's terms (docs/words.md#word-memory), shared by the library dashboard and the word batches:
// Strong when marked known (in memory, or by a Peek on a term without memory) or when recall now reaches `STRONG_RECALL` in every
// reviewed direction; Fading when memory exists but is not Strong; New otherwise (absent from the returned map).
export const STRONG_RECALL = 0.9;
export type BandMemoryRow = { termKey: string; stability: number; lastReviewedAt: number; known: number };
export type WordBand = "strong" | "fading";

export function termBands(memory: readonly BandMemoryRow[], knownTerms: Iterable<string>, now: number): Map<string, WordBand> {
  const byTerm = new Map<string, BandMemoryRow[]>();
  for (const row of memory) byTerm.set(row.termKey, [...byTerm.get(row.termKey) ?? [], row]);
  const bands = new Map<string, WordBand>();
  for (const [termKey, rows] of byTerm) {
    bands.set(termKey, rows.some((row) => row.known === 1) || rows.every((row) => recallProbability(row, now) >= STRONG_RECALL) ? "strong" : "fading");
  }
  for (const termKey of knownTerms) bands.set(termKey, "strong");
  return bands;
}

// The SQL for the terms (of `terms`, a subquery binding ?2 and after) a learner (?1) marked known in a Peek.
export const peekKnownTermsSql = (terms: string) =>
  `SELECT DISTINCT term_key AS termKey FROM word_exposures WHERE user_id = ?1 AND known_at IS NOT NULL AND term_key IN (${terms})`;
