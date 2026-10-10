import { describe, expect, it } from "vitest";
import { WORD_SEARCH_PAGE_MAX, WORD_SEARCH_QUERY_MAX, wordSearchKey, wordSearchPageSchema, wordSearchQuerySchema } from "./lessonDocument";

const id = () => crypto.randomUUID();

describe("word search contracts", () => {
  it("folds case, diacritics, ß, and whitespace into one search key", () => {
    expect(wordSearchKey("  Über  den\tFluß ")).toBe("uber den fluss");
    expect(wordSearchKey("CAFÉ")).toBe(wordSearchKey("cafe"));
    expect(wordSearchKey("Ťažký")).toBe("tazky");
    expect(wordSearchKey("собака")).toBe("собака");
    expect(wordSearchKey("́")).toBe("");
  });

  it("requires a bounded query and caps the page size", () => {
    expect(wordSearchQuerySchema.parse({ q: " hund " })).toEqual({ q: "hund", limit: 20 });
    expect(wordSearchQuerySchema.parse({ q: "hund", limit: "5", cursor: "abc" })).toEqual({ q: "hund", limit: 5, cursor: "abc" });
    for (const query of [{}, { q: "   " }, { q: "x".repeat(WORD_SEARCH_QUERY_MAX + 1) }, { q: "hund", limit: String(WORD_SEARCH_PAGE_MAX + 1) }, { q: "hund", limit: "0" }]) {
      expect(wordSearchQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("validates a page of matches with their course and lesson", () => {
    const lessonId = id();
    const item = {
      word: { id: id(), lessonId, term: "der Hund", meaning: "the dog", forms: null, example: null, note: null, speech: { term: null, example: null } },
      course: { id: id(), slug: "german", title: "German" }, lesson: { id: lessonId, slug: "animals", title: "Animals" },
    };
    expect(wordSearchPageSchema.parse({ items: [item], nextCursor: null }).items).toHaveLength(1);
    expect(wordSearchPageSchema.safeParse({ items: Array.from({ length: WORD_SEARCH_PAGE_MAX + 1 }, () => item), nextCursor: null }).success).toBe(false);
    expect(wordSearchPageSchema.safeParse({ items: [{ ...item, lesson: undefined }], nextCursor: null }).success).toBe(false);
  });
});
