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

  it("names a course only for a course drill", () => {
    const courseId = id(); const lessonId = id();
    expect(wordDrillQuerySchema.parse({ source: "course", courseId })).toEqual({ source: "course", courseId, direction: "mixed" });
    for (const query of [{ source: "course" }, { source: "course", courseId: "nope" }, { source: "course", courseId, lessonId }, { source: "weak", courseId }, { source: "lesson", lessonId, courseId }]) {
      expect(wordDrillQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("names a word batch only for a lesson drill", () => {
    const lessonId = id(); const courseId = id();
    expect(wordDrillQuerySchema.parse({ source: "lesson", lessonId, batch: "2" })).toEqual({ source: "lesson", lessonId, batch: 2, direction: "mixed" });
    for (const query of [{ source: "weak", batch: 1 }, { source: "course", courseId, batch: 1 }, { source: "lesson", lessonId, batch: 0 }, { source: "lesson", lessonId, batch: "x" }, { source: "lesson", lessonId, batch: 1.5 }]) {
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

  it("accepts only a result and returns at most the last five results", () => {
    expect(wordDrillGradeRequestSchema.parse({ result: "again" })).toEqual({ result: "again" });
    expect(wordDrillGradeRequestSchema.safeParse({ result: "maybe" }).success).toBe(false);
    const recent = ["got", "again", "got", "got", "again"];
    expect(wordDrillGradeResponseSchema.parse({ recent })).toEqual({ recent });
    expect(wordDrillGradeResponseSchema.parse({ recent: ["got"] })).toEqual({ recent: ["got"] });
    for (const bad of [[...recent, "got"], ["maybe"], undefined]) expect(wordDrillGradeResponseSchema.safeParse({ recent: bad }).success).toBe(false);
    expect(wordDrillGradeResponseSchema.safeParse({ box: 2 }).success).toBe(false);
  });
});
