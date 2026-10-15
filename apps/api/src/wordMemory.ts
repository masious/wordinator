import type { WordDrillDirection, WordDrillResult } from "@wordinator/contracts/lesson-document";

// The pure word memory engine (docs/words.md#word-memory): folds graded reviews into one memory row per account, term key, and
// direction, and computes recall probability at a time. It is a small in-house FSRS-4.5 model with the published default
// weights and two grades (Again = 1, Got it = Good = 3); see AI_PLAN.md (C14a notes) for why it does not wrap ts-fsrs. Times
// are epoch milliseconds; stability is in days. Everything here is deterministic, so rebuilding a row from its reviews in order
// gives exactly the row that folding them one by one gave.

export type WordReviewSource = "drill" | "ai_chat" | "ai_practice" | "seed";

export type FoldableWordReview = {
  result: WordDrillResult; source: WordReviewSource; seedBox: number | null;
  courseId: string; lessonId: string; wordId: string; createdAt: number;
};

export type WordMemoryState = {
  courseId: string; lessonId: string; wordId: string;
  recent: string; reps: number; lapses: number; lastLapseAt: number | null;
  stability: number; difficulty: number; lastReviewedAt: number; knownOverride: boolean;
};

// A word never reviewed in a direction ranks as this recall probability (docs/words.md#the-deck).
export const WORD_NEW_RECALL = 0.5;
export const WORD_RECENT_KEPT = 10;
// Leitner box → stability in days for seeded C12 drill states; mirrored by migration 0026.
export const SEED_STABILITY_DAYS: Readonly<Record<number, number>> = { 1: 0.5, 2: 1, 3: 3, 4: 7, 5: 21 };

const DAY_MS = 86_400_000;
const DECAY = -0.5;
const FACTOR = 19 / 81;
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755] as const;
const MIN_STABILITY = 0.01;

const grade = (result: WordDrillResult) => (result === "got" ? 3 : 1);
const clampDifficulty = (value: number) => Math.min(10, Math.max(1, value));
const initialDifficulty = (result: WordDrillResult) => clampDifficulty(W[4] - (grade(result) - 3) * W[5]);
// The difficulty a new or seeded row starts with (Good's initial difficulty); migration 0026 writes the same literal.
export const WORD_DEFAULT_DIFFICULTY = initialDifficulty("got");

const retrievability = (stability: number, elapsedDays: number) => (1 + FACTOR * elapsedDays / stability) ** DECAY;

/** Recall probability now: `WORD_NEW_RECALL` without a row, otherwise the forgetting curve of the row's stability. */
export function recallProbability(state: Pick<WordMemoryState, "stability" | "lastReviewedAt"> | null | undefined, now: number): number {
  if (!state) return WORD_NEW_RECALL;
  return retrievability(state.stability, Math.max(0, now - state.lastReviewedAt) / DAY_MS);
}

export function foldWordReview(state: WordMemoryState | null, review: FoldableWordReview): WordMemoryState {
  const mark = review.result === "got" ? "g" : "a";
  let stability: number; let difficulty: number;
  if (review.source === "seed") {
    stability = SEED_STABILITY_DAYS[review.seedBox ?? 1] ?? 0.5;
    difficulty = WORD_DEFAULT_DIFFICULTY;
  } else if (!state) {
    stability = review.result === "got" ? W[2] : W[0];
    difficulty = initialDifficulty(review.result);
  } else {
    const elapsed = Math.max(0, review.createdAt - state.lastReviewedAt) / DAY_MS;
    const r = retrievability(state.stability, elapsed);
    const { stability: s, difficulty: d } = state;
    stability = review.result === "got"
      ? s * (Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) + 1)
      : Math.min(s, W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r)));
    // Mean reversion towards Good's initial difficulty.
    difficulty = clampDifficulty(W[7] * WORD_DEFAULT_DIFFICULTY + (1 - W[7]) * (d - W[6] * (grade(review.result) - 3)));
  }
  // A lapse is an Again on a word already reviewed; seeds never count, since their history before the box is unknown.
  const lapse = review.result === "again" && review.source !== "seed" && state !== null && state.reps > 0;
  return {
    courseId: review.courseId, lessonId: review.lessonId, wordId: review.wordId,
    recent: ((state?.recent ?? "") + mark).slice(-WORD_RECENT_KEPT),
    reps: (state?.reps ?? 0) + 1,
    lapses: (state?.lapses ?? 0) + (lapse ? 1 : 0),
    lastLapseAt: lapse ? review.createdAt : state?.lastLapseAt ?? null,
    stability: Math.max(MIN_STABILITY, stability), difficulty,
    lastReviewedAt: Math.max(review.createdAt, state?.lastReviewedAt ?? review.createdAt),
    // A later Again clears "I know this word"; `known_override` is otherwise set and cleared only by its own route.
    knownOverride: review.result === "again" ? false : state?.knownOverride ?? false,
  };
}

/**
 * Rebuilds a row from all of its reviews, ordered by (createdAt, id) as stored; null without reviews. `knownOverride` is the
 * current row's flag, which no review sets, so it is carried over rather than replayed (an old Again must not clear a mark
 * set after it).
 */
export function rebuildWordMemory(reviews: readonly FoldableWordReview[], knownOverride = false): WordMemoryState | null {
  const state = reviews.reduce<WordMemoryState | null>(foldWordReview, null);
  return state && { ...state, knownOverride };
}

/** The last `count` results of a row's `recent` string, oldest first. */
export const recentResults = (recent: string, count = 5): WordDrillResult[] =>
  [...recent.slice(-count)].map((mark) => (mark === "g" ? "got" : "again"));

export type WordMemoryKey = { userId: string; termKey: string; direction: WordDrillDirection };

// Weakness ranking (docs/words.md#word-memory), shared by the Weak words view and the drill deck so both order words alike.
// Recall is projected this many days ahead, not taken now: a word failed moments ago has recall near 1 *now*, yet it is the
// one most likely to slip, and projecting a week ahead puts its short stability first while long-stable words stay last.
export const WORD_WEAK_HORIZON_DAYS = 7;
export type WordWeakness = { recall: number; lastReviewedAt: number };

/** A row's weakness at `now`: recall `WORD_WEAK_HORIZON_DAYS` ahead (`WORD_NEW_RECALL` without a row), and its last review. */
export function wordWeakness(state: Pick<WordMemoryState, "stability" | "lastReviewedAt"> | null | undefined, now: number): WordWeakness {
  return { recall: recallProbability(state, now + WORD_WEAK_HORIZON_DAYS * DAY_MS), lastReviewedAt: state?.lastReviewedAt ?? Number.NEGATIVE_INFINITY };
}

/** Weakest first: the lower projected recall, then the longer since last reviewed (never reviewed first). */
export const compareWordWeakness = (left: WordWeakness, right: WordWeakness): number =>
  left.recall - right.recall || (left.lastReviewedAt === right.lastReviewedAt ? 0 : left.lastReviewedAt < right.lastReviewedAt ? -1 : 1);
