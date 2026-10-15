import { describe, expect, it } from "vitest";
import {
  compareWordWeakness, foldWordReview, rebuildWordMemory, recallProbability, recentResults, SEED_STABILITY_DAYS, WORD_DEFAULT_DIFFICULTY, WORD_NEW_RECALL,
  WORD_LAPSE_RECALL, WORD_WEAK_HORIZON_DAYS, wordWeakness,
  type FoldableWordReview, type WordMemoryState,
} from "../src/wordMemory";

// The pure memory engine (C14a, docs/words.md#word-memory).
const DAY = 86_400_000;
const review = (result: "got" | "again", day: number, overrides: Partial<FoldableWordReview> = {}): FoldableWordReview => ({
  result, source: "drill", seedBox: null, courseId: "course", lessonId: "lesson", wordId: "word", createdAt: day * DAY, ...overrides,
});
const foldAll = (reviews: FoldableWordReview[]) => reviews.reduce<WordMemoryState | null>(foldWordReview, null);

describe("word memory engine", () => {
  it("folds a first review into a new row", () => {
    const got = foldWordReview(null, review("got", 1));
    expect(got).toMatchObject({ recent: "g", reps: 1, lapses: 0, lastLapseAt: null, lastReviewedAt: DAY, knownOverride: false, courseId: "course", lessonId: "lesson", wordId: "word" });
    const again = foldWordReview(null, review("again", 1));
    expect(again).toMatchObject({ recent: "a", reps: 1, lapses: 0 });
    expect(again.stability).toBeLessThan(got.stability);
    expect(again.difficulty).toBeGreaterThan(got.difficulty);
    expect(got.difficulty).toBe(WORD_DEFAULT_DIFFICULTY);
  });

  it("grows stability on Got it, shrinks it on Again, and counts lapses", () => {
    const first = foldWordReview(null, review("got", 0));
    const second = foldWordReview(first, review("got", 3));
    expect(second.stability).toBeGreaterThan(first.stability);
    const lapse = foldWordReview(second, review("again", 20, { lessonId: "other", wordId: "other-word" }));
    expect(lapse.stability).toBeLessThan(second.stability);
    expect(lapse.difficulty).toBeGreaterThan(second.difficulty);
    expect(lapse).toMatchObject({ reps: 3, lapses: 1, lastLapseAt: 20 * DAY, recent: "gga", lessonId: "other", wordId: "other-word" });
    for (const state of [first, second, lapse]) expect(state.difficulty).toBeGreaterThanOrEqual(1);
  });

  it("keeps the last ten results, newest last, and reads the last five oldest first", () => {
    const results = ["got", "again", "got", "got", "again", "got", "again", "again", "got", "got", "again", "got"] as const;
    const state = foldAll(results.map((result, day) => review(result, day)))!;
    expect(state.recent).toBe("ggagaaggag");
    expect(recentResults(state.recent)).toEqual(["again", "got", "got", "again", "got"]);
    expect(recentResults("g")).toEqual(["got"]);
    expect(recentResults("")).toEqual([]);
  });

  it("rebuilds exactly the row that incremental folding gave", () => {
    const reviews = [
      review("got", 0), review("got", 0.2, { lessonId: "two" }), review("again", 4), review("got", 4.5, { source: "ai_chat" }),
      review("got", 9), review("again", 40, { source: "ai_practice" }), review("got", 41), review("got", 60),
    ];
    let incremental: WordMemoryState | null = null;
    for (const entry of reviews) incremental = foldWordReview(incremental, entry);
    expect(rebuildWordMemory(reviews)).toEqual(incremental);
    expect(rebuildWordMemory([])).toBeNull();
    // Removing one lesson's reviews and rebuilding equals folding only the rest.
    const rest = reviews.filter((entry) => entry.lessonId !== "two");
    expect(rebuildWordMemory(rest)).toEqual(foldAll(rest));
  });

  it("carries the current known mark over a rebuild, while a later Again clears it", () => {
    const reviews = [review("got", 0), review("again", 1), review("got", 2)];
    expect(rebuildWordMemory(reviews, true)?.knownOverride).toBe(true);
    const known = { ...foldAll(reviews)!, knownOverride: true };
    expect(foldWordReview(known, review("got", 3)).knownOverride).toBe(true);
    expect(foldWordReview(known, review("again", 3)).knownOverride).toBe(false);
  });

  it("decays recall with time and puts a missing row at WORD_NEW_RECALL", () => {
    const state = foldWordReview(null, review("got", 0));
    expect(recallProbability(state, 0)).toBe(1);
    // Stability is the time until recall falls to 90%.
    expect(recallProbability(state, state.stability * DAY)).toBeCloseTo(0.9, 10);
    const later = [1, 5, 30, 365].map((days) => recallProbability(state, days * DAY));
    for (let index = 1; index < later.length; index += 1) expect(later[index]).toBeLessThan(later[index - 1]!);
    expect(recallProbability(state, -DAY)).toBe(1);
    expect(recallProbability(null, 10 * DAY)).toBe(WORD_NEW_RECALL);
    expect(recallProbability(undefined, 10 * DAY)).toBe(WORD_NEW_RECALL);
  });

  it("seeds stability from each Leitner box with the default difficulty and no lapse", () => {
    expect(SEED_STABILITY_DAYS).toEqual({ 1: 0.5, 2: 1, 3: 3, 4: 7, 5: 21 });
    for (const [box, stability] of [[1, 0.5], [2, 1], [3, 3], [4, 7], [5, 21]] as const) {
      const seeded = foldWordReview(null, review(box === 1 ? "again" : "got", 2, { source: "seed", seedBox: box }));
      expect(seeded).toMatchObject({ stability, difficulty: WORD_DEFAULT_DIFFICULTY, reps: 1, lapses: 0, lastLapseAt: null, recent: box === 1 ? "a" : "g" });
    }
    // A second seed of the same term (from another lesson) takes over its box; reviews after a seed fold normally.
    const two = foldAll([review("got", 1, { source: "seed", seedBox: 5 }), review("again", 2, { source: "seed", seedBox: 1, lessonId: "two" })])!;
    expect(two).toMatchObject({ stability: 0.5, reps: 2, lapses: 0, recent: "ga", lessonId: "two", lastReviewedAt: 2 * DAY });
    expect(foldWordReview(two, review("again", 3)).lapses).toBe(1);
  });
});

describe("weakness ranking", () => {
  const rank = (state: WordMemoryState | null, day: number) => wordWeakness(state, day * DAY);
  it("projects recall WORD_WEAK_HORIZON_DAYS ahead and decays with time", () => {
    const state = foldWordReview(null, review("got", 0));
    expect(rank(state, 0).recall).toBe(recallProbability(state, WORD_WEAK_HORIZON_DAYS * DAY));
    expect(rank(state, 10).recall).toBeLessThan(rank(state, 0).recall);
    expect(rank(null, 0)).toEqual({ recall: WORD_NEW_RECALL, lastReviewedAt: Number.NEGATIVE_INFINITY });
  });

  it("ranks a word failed moments ago before a never-reviewed one and a long-stable word last", () => {
    const failed = foldWordReview(null, review("again", 100));
    // Recall now is 1, which alone would rank the failure after every never-reviewed word.
    expect(recallProbability(failed, 100 * DAY)).toBe(1);
    const stable = foldAll([review("got", 0), review("got", 10), review("got", 60), review("got", 99)])!;
    const order = [{ id: "stable", ...rank(stable, 100) }, { id: "new", ...rank(null, 100) }, { id: "failed", ...rank(failed, 100) }]
      .sort(compareWordWeakness).map((entry) => entry.id);
    expect(order).toEqual(["failed", "new", "stable"]);
  });

  it("ranks a word whose latest result is Again before never-reviewed words, even with stability left", () => {
    const relapsed = foldAll([review("got", 0), review("got", 3), review("again", 100)])!;
    expect(recallProbability(relapsed, (100 + WORD_WEAK_HORIZON_DAYS) * DAY)).toBeGreaterThan(WORD_NEW_RECALL);
    expect(rank(relapsed, 100).recall).toBe(WORD_LAPSE_RECALL);
    expect(compareWordWeakness(rank(relapsed, 100), rank(null, 100))).toBeLessThan(0);
    const recovered = foldAll([review("got", 0), review("again", 50), review("got", 100)])!;
    expect(rank(recovered, 100).recall).toBeGreaterThan(WORD_LAPSE_RECALL);
  });

  it("breaks ties of recall by the longest since last reviewed", () => {
    const earlier = { recall: 0.4, lastReviewedAt: 1 }; const later = { recall: 0.4, lastReviewedAt: 2 };
    expect(compareWordWeakness(earlier, later)).toBeLessThan(0);
    expect(compareWordWeakness(later, earlier)).toBeGreaterThan(0);
    expect(compareWordWeakness(earlier, { ...earlier })).toBe(0);
  });
});
