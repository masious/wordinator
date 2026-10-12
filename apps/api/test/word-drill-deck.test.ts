import { env } from "cloudflare:test";
import { nextWordDrillBox, WORD_DRILL_SESSION_SIZE } from "@wordinator/contracts/lesson-document";
import { describe, expect, it } from "vitest";
import { buildWordDrillDeck, type WordDrillCandidate } from "../src/wordDrill";

type Candidate = WordDrillCandidate & { id: string };
const candidate = (id: string, states: Candidate["states"] = {}, termKey = id): Candidate => ({ id, termKey, states });
// A seeded linear congruential generator, so ties and shuffles are reproducible.
const seeded = (seed: number) => () => ((seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32) / 2 ** 32);
const ids = (deck: { candidate: Candidate }[]) => deck.map((entry) => entry.candidate.id);
const noShuffle = (deck: Candidate[], size: number) => buildWordDrillDeck(deck, "understand", () => 0.999_999, size);

describe("word drill deck", () => {
  it("ranks box 1, then never drilled, then boxes 2 to 5, oldest first within a tier", () => {
    const words = [
      candidate("box5", { understand: { box: 5, lastDrilledAt: 1 } }),
      candidate("box2-new", { understand: { box: 2, lastDrilledAt: 20 } }),
      candidate("box2-old", { understand: { box: 2, lastDrilledAt: 10 } }),
      candidate("new"),
      candidate("again", { understand: { box: 1, lastDrilledAt: 30 } }),
      candidate("box3", { understand: { box: 3, lastDrilledAt: 5 } }),
    ];
    // Taking fewer cards than words shows the priority, since the shuffle cannot add words back.
    for (const [size, expected] of [[1, ["again"]], [2, ["again", "new"]], [4, ["again", "new", "box2-old", "box2-new"]], [5, ["again", "new", "box2-old", "box2-new", "box3"]]] as const) {
      expect(new Set(ids(noShuffle(words, size)))).toEqual(new Set(expected));
    }
  });

  it("caps the session and returns fewer cards when fewer words are eligible", () => {
    const many = Array.from({ length: WORD_DRILL_SESSION_SIZE + 5 }, (_, index) => candidate(`w${index}`));
    expect(buildWordDrillDeck(many, "mixed", seeded(1))).toHaveLength(WORD_DRILL_SESSION_SIZE);
    expect(buildWordDrillDeck(many.slice(0, 3), "mixed", seeded(1))).toHaveLength(3);
    expect(buildWordDrillDeck([], "mixed", seeded(1))).toEqual([]);
  });

  it("uses the session's direction, or each word's weaker direction in a mixed session", () => {
    const words = [
      candidate("produce-weaker", { understand: { box: 3, lastDrilledAt: 1 }, produce: { box: 2, lastDrilledAt: 1 } }),
      candidate("understand-again", { understand: { box: 1, lastDrilledAt: 9 } }),
      candidate("produce-new", { understand: { box: 2, lastDrilledAt: 1 } }),
      candidate("understand-older", { understand: { box: 4, lastDrilledAt: 1 }, produce: { box: 4, lastDrilledAt: 2 } }),
    ];
    const directions = Object.fromEntries(buildWordDrillDeck(words, "mixed", seeded(7)).map((entry) => [entry.candidate.id, entry.direction]));
    expect(directions).toEqual({ "produce-weaker": "produce", "understand-again": "understand", "produce-new": "produce", "understand-older": "understand" });
    expect(new Set(buildWordDrillDeck(words, "produce", seeded(7)).map((entry) => entry.direction))).toEqual(new Set(["produce"]));
  });

  it("breaks direction ties at random", () => {
    const tied = [candidate("tied", { understand: { box: 2, lastDrilledAt: 4 }, produce: { box: 2, lastDrilledAt: 4 } })];
    expect(buildWordDrillDeck(tied, "mixed", () => 0.2)[0]?.direction).toBe("understand");
    expect(buildWordDrillDeck(tied, "mixed", () => 0.7)[0]?.direction).toBe("produce");
  });

  it("holds each term key once, keeping the weakest word", () => {
    const words = [
      candidate("vrij-1", { understand: { box: 4, lastDrilledAt: 1 } }, "vrij"),
      candidate("vrij-2", { understand: { box: 1, lastDrilledAt: 9 } }, "vrij"),
      candidate("vrij-3", {}, "vrij"),
      candidate("huis"),
    ];
    for (const mode of ["mixed", "understand", "produce"] as const) {
      const deck = buildWordDrillDeck(words, mode, seeded(3));
      expect(deck.map((entry) => entry.candidate.termKey).sort()).toEqual(["huis", "vrij"]);
    }
    expect(ids(buildWordDrillDeck(words, "understand", seeded(3)))).toContain("vrij-2");
    // In Produce every vrij is new, so the tie falls to the random source; either way one remains.
    expect(ids(buildWordDrillDeck(words, "produce", seeded(3))).filter((id) => id.startsWith("vrij"))).toHaveLength(1);
  });

  it("breaks priority ties and shuffles through the random source", () => {
    const words = Array.from({ length: 30 }, (_, index) => candidate(`w${index}`));
    const first = ids(buildWordDrillDeck(words, "understand", seeded(11)));
    expect(ids(buildWordDrillDeck(words, "understand", seeded(11)))).toEqual(first);
    expect(ids(buildWordDrillDeck(words, "understand", seeded(12)))).not.toEqual(first);
    // The weakest words are always chosen, but not always first.
    const weak = words.map((word, index) => (index < 3 ? { ...word, states: { understand: { box: 1, lastDrilledAt: index } } } : word));
    const orders = [1, 2, 3, 4, 5].map((seed) => ids(buildWordDrillDeck(weak, "understand", seeded(seed))));
    for (const order of orders) expect(order).toEqual(expect.arrayContaining(["w0", "w1", "w2"]));
    expect(orders.some((order) => order.slice(0, 3).sort().join() !== "w0,w1,w2")).toBe(true);
  });
});

describe("word drill boxes", () => {
  it("starts at box 2 on Got it, drops to box 1 on Again, and stops at box 5", () => {
    expect(nextWordDrillBox(null, "got")).toBe(2);
    expect(nextWordDrillBox(null, "again")).toBe(1);
    expect(nextWordDrillBox(1, "got")).toBe(2);
    expect(nextWordDrillBox(3, "got")).toBe(4);
    expect(nextWordDrillBox(5, "got")).toBe(5);
    for (const box of [1, 2, 3, 4, 5]) expect(nextWordDrillBox(box, "again")).toBe(1);
  });

  it("migrates the drill state table with its checks", async () => {
    const table = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'course_word_drill_states'").first<{ sql: string }>();
    expect(table?.sql).toContain("PRIMARY KEY (`user_id`, `lesson_id`, `word_id`, `direction`)");
    expect(table?.sql).not.toContain("group_id");
    for (const check of ["direction_check", "result_check", "box_check"]) expect(table?.sql).toContain(`course_word_drill_states_${check}`);
    const index = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'course_word_drill_states_user_idx'").first();
    expect(index).not.toBeNull();
  });
});
