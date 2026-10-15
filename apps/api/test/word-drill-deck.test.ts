import { WORD_DRILL_SESSION_SIZE } from "@wordinator/contracts/lesson-document";
import { describe, expect, it } from "vitest";
import { buildWordDrillDeck, type WordDrillCandidate, type WordDrillMemory } from "../src/wordDrill";
import { recallProbability, WORD_NEW_RECALL } from "../src/wordMemory";

type Candidate = WordDrillCandidate & { id: string };
const DAY = 86_400_000;
const NOW = 1_000 * DAY;
const candidate = (id: string, memory: Candidate["memory"] = {}, termKey = id, bookmarked = false): Candidate => ({ id, termKey, bookmarked, memory });
// A row reviewed `daysAgo` days before NOW with the given stability; recall falls as stability shrinks or time passes.
const mem = (stability: number, daysAgo: number, knownOverride = false): WordDrillMemory => ({ stability, lastReviewedAt: NOW - daysAgo * DAY, knownOverride });
// A seeded linear congruential generator, so ties and shuffles are reproducible.
const seeded = (seed: number) => () => ((seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32) / 2 ** 32);
const ids = (deck: { candidate: Candidate }[]) => deck.map((entry) => entry.candidate.id);
const noShuffle = (deck: Candidate[], size: number) => buildWordDrillDeck(deck, "understand", () => 0.999_999, NOW, size);

describe("word drill deck", () => {
  it("ranks by recall probability now, with never-reviewed words at WORD_NEW_RECALL", () => {
    const words = [
      candidate("solid", { understand: mem(30, 1) }),
      candidate("fading", { understand: mem(1, 20) }),
      candidate("new"),
      candidate("forgotten", { understand: mem(0.5, 30) }),
      candidate("fresh", { understand: mem(3, 2) }),
    ];
    expect(recallProbability(words[1]!.memory.understand, NOW)).toBeLessThan(WORD_NEW_RECALL);
    expect(recallProbability(words[4]!.memory.understand, NOW)).toBeGreaterThan(WORD_NEW_RECALL);
    // Taking fewer cards than words shows the priority, since the shuffle cannot add words back.
    for (const [size, expected] of [[1, ["forgotten"]], [2, ["forgotten", "fading"]], [3, ["forgotten", "fading", "new"]], [4, ["forgotten", "fading", "new", "fresh"]]] as const) {
      expect(new Set(ids(noShuffle(words, size)))).toEqual(new Set(expected));
    }
  });

  it("breaks recall ties by bookmark, then the longest since reviewed, and puts known words last", () => {
    const words = [
      candidate("new-plain"), candidate("new-bookmarked", {}, "new-bookmarked", true),
      candidate("known", { understand: mem(0.5, 300, true) }),
      // Elapsed time over stability is 20 for both (recall under 0.5), so their recall is equal; the earlier review wins.
      candidate("weak-later", { understand: mem(1, 20) }), candidate("weak-earlier", { understand: mem(2, 40) }),
    ];
    // Then the bookmarked new word before the plain one; the known word last even though its recall is the lowest.
    expect(ids(noShuffle(words, 1))).toEqual(["weak-earlier"]);
    expect(new Set(ids(noShuffle(words, 3)))).toEqual(new Set(["weak-earlier", "weak-later", "new-bookmarked"]));
    expect(new Set(ids(noShuffle(words, 4)))).toEqual(new Set(["weak-earlier", "weak-later", "new-bookmarked", "new-plain"]));
    expect(ids(noShuffle(words, 5))).toContain("known");
  });

  it("caps the session and returns fewer cards when fewer words are eligible", () => {
    const many = Array.from({ length: WORD_DRILL_SESSION_SIZE + 5 }, (_, index) => candidate(`w${index}`));
    expect(buildWordDrillDeck(many, "mixed", seeded(1), NOW)).toHaveLength(WORD_DRILL_SESSION_SIZE);
    expect(buildWordDrillDeck(many.slice(0, 3), "mixed", seeded(1), NOW)).toHaveLength(3);
    expect(buildWordDrillDeck([], "mixed", seeded(1), NOW)).toEqual([]);
  });

  it("uses the session's direction, or each word's weaker direction in a mixed session", () => {
    const words = [
      candidate("produce-weaker", { understand: mem(20, 1), produce: mem(1, 5) }),
      candidate("understand-weaker", { understand: mem(0.5, 20), produce: mem(30, 1) }),
      candidate("produce-new", { understand: mem(20, 1) }),
      candidate("understand-new", { produce: mem(20, 1) }),
    ];
    const directions = Object.fromEntries(buildWordDrillDeck(words, "mixed", seeded(7), NOW).map((entry) => [entry.candidate.id, entry.direction]));
    expect(directions).toEqual({ "produce-weaker": "produce", "understand-weaker": "understand", "produce-new": "produce", "understand-new": "understand" });
    expect(new Set(buildWordDrillDeck(words, "produce", seeded(7), NOW).map((entry) => entry.direction))).toEqual(new Set(["produce"]));
  });

  it("breaks direction ties at random", () => {
    const tied = [candidate("tied", { understand: mem(2, 4), produce: mem(2, 4) })];
    expect(buildWordDrillDeck(tied, "mixed", () => 0.2, NOW)[0]?.direction).toBe("understand");
    expect(buildWordDrillDeck(tied, "mixed", () => 0.7, NOW)[0]?.direction).toBe("produce");
    expect(buildWordDrillDeck([candidate("new")], "mixed", () => 0.7, NOW)[0]?.direction).toBe("produce");
  });

  it("holds each term key once, keeping the bookmarked occurrence of a shared memory", () => {
    // Memory is per term key, so occurrences of one term share it; the bookmark decides which occurrence is drilled.
    const shared = { understand: mem(1, 10) };
    const words = [candidate("vrij-1", shared, "vrij"), candidate("vrij-2", shared, "vrij", true), candidate("vrij-3", shared, "vrij"), candidate("huis")];
    for (const mode of ["mixed", "understand", "produce"] as const) {
      const deck = buildWordDrillDeck(words, mode, seeded(3), NOW);
      expect(deck.map((entry) => entry.candidate.termKey).sort()).toEqual(["huis", "vrij"]);
      expect(ids(deck)).toContain("vrij-2");
    }
  });

  it("breaks priority ties and shuffles through the random source", () => {
    const words = Array.from({ length: 30 }, (_, index) => candidate(`w${index}`));
    const first = ids(buildWordDrillDeck(words, "understand", seeded(11), NOW));
    expect(ids(buildWordDrillDeck(words, "understand", seeded(11), NOW))).toEqual(first);
    expect(ids(buildWordDrillDeck(words, "understand", seeded(12), NOW))).not.toEqual(first);
    // The weakest words are always chosen, but not always first.
    const weak = words.map((word, index) => (index < 3 ? { ...word, memory: { understand: mem(0.5, 30 + index) } } : word));
    const orders = [1, 2, 3, 4, 5].map((seed) => ids(buildWordDrillDeck(weak, "understand", seeded(seed), NOW)));
    for (const order of orders) expect(order).toEqual(expect.arrayContaining(["w0", "w1", "w2"]));
    expect(orders.some((order) => order.slice(0, 3).sort().join() !== "w0,w1,w2")).toBe(true);
  });
});
