import { describe, expect, it } from "vitest";
import { practiceAttemptRequestSchema, pronunciationAttemptRequestSchema, PRONUNCIATION_WORDS_MAX } from "./learning";

describe("practiceAttemptRequestSchema", () => {
  it("accepts an item and a non-empty answer up to 2,000 characters", () => {
    expect(practiceAttemptRequestSchema.safeParse({ item: 0, answer: "Ik ben moe." }).success).toBe(true);
    expect(practiceAttemptRequestSchema.safeParse({ item: 49, answer: "a".repeat(2_000) }).success).toBe(true);
  });

  it("refuses empty or long answers and items outside a practice", () => {
    for (const body of [{ item: 0, answer: "" }, { item: 0, answer: "  \n " }, { item: 0, answer: "a".repeat(2_001) }, { item: -1, answer: "a" },
      { item: 50, answer: "a" }, { item: 1.5, answer: "a" }, { answer: "a" }, { item: 0 }]) {
      expect(practiceAttemptRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it("drops a client's own match result", () => {
    expect(practiceAttemptRequestSchema.parse({ item: 0, answer: "a", matched: true })).toEqual({ item: 0, answer: "a" });
  });
});

describe("pronunciationAttemptRequestSchema", () => {
  const valid = {
    surface: "drill", referenceText: "Zullen we", overall: 82, accuracy: 90.5, fluency: 70, completeness: 100,
    words: [{ word: "Zullen", accuracy: 95, error: "none" }, { word: "we", accuracy: null, error: "omission" }],
  } as const;
  const lessonId = "8f8a3c55-8b0f-4f43-a3c4-3c5a8f2a4c11"; const wordId = "0d0b1a52-69f0-4c4f-8a37-0c8a3c2c7d21";

  it("accepts an assessment with or without a lesson word", () => {
    expect(pronunciationAttemptRequestSchema.safeParse(valid).success).toBe(true);
    expect(pronunciationAttemptRequestSchema.safeParse({ ...valid, surface: "word_card", lessonId, wordId }).success).toBe(true);
    expect(pronunciationAttemptRequestSchema.safeParse({ ...valid, surface: "ai_chat", termKey: "zullen we" }).success).toBe(true);
  });

  it("bounds scores, words, and the reference text", () => {
    for (const body of [
      { ...valid, overall: 101 }, { ...valid, fluency: -1 }, { ...valid, accuracy: Number.NaN },
      { ...valid, words: [{ word: "x", accuracy: 120, error: "none" }] }, { ...valid, words: [{ word: "x", accuracy: 50, error: "other" }] },
      { ...valid, words: Array.from({ length: PRONUNCIATION_WORDS_MAX + 1 }, () => valid.words[0]) },
      { ...valid, referenceText: "" }, { ...valid, referenceText: "a".repeat(201) }, { ...valid, surface: "lesson" },
    ]) expect(pronunciationAttemptRequestSchema.safeParse(body).success).toBe(false);
    expect(pronunciationAttemptRequestSchema.safeParse({ ...valid, words: Array.from({ length: PRONUNCIATION_WORDS_MAX }, () => valid.words[0]) }).success).toBe(true);
  });

  it("needs a lesson and a word together", () => {
    expect(pronunciationAttemptRequestSchema.safeParse({ ...valid, lessonId }).success).toBe(false);
    expect(pronunciationAttemptRequestSchema.safeParse({ ...valid, wordId }).success).toBe(false);
    expect(pronunciationAttemptRequestSchema.safeParse({ ...valid, lessonId: "lesson", wordId }).success).toBe(false);
  });
});
