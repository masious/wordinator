import { WORD_DRILL_SESSION_SIZE, type WordDrillDirection, type WordDrillMode } from "@wordinator/contracts/lesson-document";
import { recallProbability, type WordMemoryState } from "./wordMemory";

// The deck rules of docs/words.md#the-deck, kept apart from SQL so they can be unit tested. `random` returns [0, 1), like
// Math.random, and decides every tie and the final shuffle; `now` is the time recall probability is computed at.

export type WordDrillMemory = Pick<WordMemoryState, "stability" | "lastReviewedAt" | "knownOverride">;
export type WordDrillCandidate = { termKey: string; bookmarked: boolean; memory: Partial<Record<WordDrillDirection, WordDrillMemory>> };
export type WordDrillDeckEntry<T> = { candidate: T; direction: WordDrillDirection };

type Ranked = { recall: number; lastReviewedAt: number };
const ranked = (memory: WordDrillMemory | undefined, now: number): Ranked =>
  ({ recall: recallProbability(memory, now), lastReviewedAt: memory?.lastReviewedAt ?? Number.NEGATIVE_INFINITY });
// Lowest recall first (a direction never reviewed counts as WORD_NEW_RECALL), then the longest since last reviewed.
const compareRanked = (left: Ranked, right: Ranked) =>
  left.recall - right.recall || (left.lastReviewedAt === right.lastReviewedAt ? 0 : left.lastReviewedAt < right.lastReviewedAt ? -1 : 1);
const isKnown = (candidate: WordDrillCandidate) => Boolean(candidate.memory.understand?.knownOverride || candidate.memory.produce?.knownOverride);

export function buildWordDrillDeck<T extends WordDrillCandidate>(
  candidates: readonly T[], mode: WordDrillMode, random: () => number, now: number, size = WORD_DRILL_SESSION_SIZE,
): WordDrillDeckEntry<T>[] {
  // Each word takes the session's direction, or in a mixed session its weaker one (ties random).
  const entries = candidates.map((candidate) => {
    let direction: WordDrillDirection = mode === "mixed" ? "understand" : mode;
    if (mode === "mixed") {
      const order = compareRanked(ranked(candidate.memory.understand, now), ranked(candidate.memory.produce, now));
      direction = order < 0 ? "understand" : order > 0 ? "produce" : random() < 0.5 ? "understand" : "produce";
    }
    return { candidate, direction, known: isKnown(candidate), rank: ranked(candidate.memory[direction], now), tieBreak: random() };
  });
  // Known words last; then by recall and age, with bookmarked words winning ties of recall; then at random.
  const byPriority = (left: typeof entries[number], right: typeof entries[number]) =>
    Number(left.known) - Number(right.known) || left.rank.recall - right.rank.recall
    || Number(right.candidate.bookmarked) - Number(left.candidate.bookmarked)
    || compareRanked(left.rank, right.rank) || left.tieBreak - right.tieBreak;

  // One term key per session, keeping the weakest of the words that share it.
  const weakest = new Map<string, typeof entries[number]>();
  for (const entry of entries) {
    const kept = weakest.get(entry.candidate.termKey);
    if (kept === undefined || byPriority(entry, kept) < 0) weakest.set(entry.candidate.termKey, entry);
  }
  const deck = [...weakest.values()].sort(byPriority).slice(0, Math.max(0, size))
    .map(({ candidate, direction }): WordDrillDeckEntry<T> => ({ candidate, direction }));

  // Shuffle so the session's order does not reveal its priority.
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
  }
  return deck;
}
