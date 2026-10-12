import { WORD_DRILL_SESSION_SIZE, type WordDrillDirection, type WordDrillMode } from "@wordinator/contracts/lesson-document";

// The deck rules of docs/words.md#the-deck, kept apart from SQL so they can be unit tested. `random` returns [0, 1), like
// Math.random, and decides every tie and the final shuffle.

export type WordDrillState = { box: number; lastDrilledAt: number };
export type WordDrillCandidate = { termKey: string; states: Partial<Record<WordDrillDirection, WordDrillState>> };
export type WordDrillDeckEntry<T> = { candidate: T; direction: WordDrillDirection };

// Highest priority first: box 1 (last graded Again), never drilled, then boxes 2–5; within a tier, the longest since drilled.
const tier = (state: WordDrillState | undefined) => (state === undefined ? 1 : state.box === 1 ? 0 : state.box);
const compareStates = (left: WordDrillState | undefined, right: WordDrillState | undefined) =>
  tier(left) - tier(right) || (left?.lastDrilledAt ?? 0) - (right?.lastDrilledAt ?? 0);

export function buildWordDrillDeck<T extends WordDrillCandidate>(
  candidates: readonly T[], mode: WordDrillMode, random: () => number, size = WORD_DRILL_SESSION_SIZE,
): WordDrillDeckEntry<T>[] {
  // Each word takes the session's direction, or in a mixed session its weaker one (ties random).
  const entries = candidates.map((candidate) => {
    let direction: WordDrillDirection = mode === "mixed" ? "understand" : mode;
    if (mode === "mixed") {
      const order = compareStates(candidate.states.understand, candidate.states.produce);
      direction = order < 0 ? "understand" : order > 0 ? "produce" : random() < 0.5 ? "understand" : "produce";
    }
    return { candidate, direction, state: candidate.states[direction], tieBreak: random() };
  });
  const byPriority = (left: typeof entries[number], right: typeof entries[number]) =>
    compareStates(left.state, right.state) || left.tieBreak - right.tieBreak;

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
