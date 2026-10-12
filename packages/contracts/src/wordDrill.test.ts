import { describe, expect, it } from "vitest";
import { WORD_DRILL_SESSION_SIZE, wordDrillDeckSchema, wordDrillGradeRequestSchema, wordDrillGradeResponseSchema, wordDrillQuerySchema } from "./lessonDocument";

const id = () => crypto.randomUUID();

describe("word drill contracts", () => {
  it("names a lesson only for a lesson drill and defaults to mixed", () => {
    const lessonId = id();
    expect(wordDrillQuerySchema.parse({ source: "weak" })).toEqual({ source: "weak", direction: "mixed" });
    expect(wordDrillQuerySchema.parse({ source: "lesson", lessonId, direction: "produce" })).toEqual({ source: "lesson", lessonId, direction: "produce" });
    for (const query of [{}, { source: "lesson" }, { source: "weak", lessonId }, { source: "lesson", lessonId: "nope" }, { source: "all" }, { source: "weak", direction: "both" }]) {
      expect(wordDrillQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("caps a deck at the session size", () => {
    const lessonId = id();
    const card = {
      word: { id: id(), lessonId, term: "vrij", meaning: "free", forms: null, example: null, note: null, speech: { term: null, example: null } },
      direction: "understand", course: { id: id(), slug: "dutch", title: "Dutch" }, lesson: { id: lessonId, slug: "hallo", title: "Hallo" },
    };
    expect(wordDrillDeckSchema.parse({ cards: [card] }).cards).toHaveLength(1);
    expect(wordDrillDeckSchema.safeParse({ cards: Array.from({ length: WORD_DRILL_SESSION_SIZE + 1 }, () => card) }).success).toBe(false);
    expect(wordDrillDeckSchema.safeParse({ cards: [{ ...card, direction: "mixed" }] }).success).toBe(false);
  });

  it("accepts only a result and returns a box from 1 to 5", () => {
    expect(wordDrillGradeRequestSchema.parse({ result: "again" })).toEqual({ result: "again" });
    expect(wordDrillGradeRequestSchema.safeParse({ result: "maybe" }).success).toBe(false);
    expect(wordDrillGradeResponseSchema.parse({ box: 5 })).toEqual({ box: 5 });
    for (const box of [0, 6, 2.5]) expect(wordDrillGradeResponseSchema.safeParse({ box }).success).toBe(false);
  });
});
