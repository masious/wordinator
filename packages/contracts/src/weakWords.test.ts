import { describe, expect, it } from "vitest";
import { WEAK_WORDS_PAGE_SIZE, weakWordsPageSchema, weakWordsQuerySchema, wordTermKeySchema } from "./weakWords";

const id = () => crypto.randomUUID();

describe("weak words contracts", () => {
  it("accepts only folded term keys", () => {
    for (const key of ["vrij", "de hond", "uber"]) expect(wordTermKeySchema.safeParse(key).success).toBe(true);
    for (const key of ["", "Vrij", "de  hond", " vrij", "über"]) expect(wordTermKeySchema.safeParse(key).success, key).toBe(false);
  });

  it("takes an optional cursor and caps a page with its memory flag", () => {
    expect(weakWordsQuerySchema.parse({})).toEqual({});
    expect(weakWordsQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
    const lessonId = id();
    const item = {
      word: { id: id(), lessonId, term: "vrij", meaning: "free", forms: null, example: null, note: null, speech: { term: null, example: null } },
      termKey: "vrij", recent: ["got", "again"], course: { id: id(), slug: "dutch", title: "Dutch" }, lesson: { id: lessonId, slug: "hallo", title: "Hallo" },
    };
    expect(weakWordsPageSchema.parse({ items: [item], nextCursor: null, hasMemory: true }).items).toHaveLength(1);
    expect(weakWordsPageSchema.safeParse({ items: [item], nextCursor: null }).success).toBe(false);
    expect(weakWordsPageSchema.safeParse({ items: Array.from({ length: WEAK_WORDS_PAGE_SIZE + 1 }, () => item), nextCursor: null, hasMemory: true }).success).toBe(false);
    expect(weakWordsPageSchema.safeParse({ items: [{ ...item, recent: ["got", "got", "got", "got", "got", "got"] }], nextCursor: null, hasMemory: true }).success).toBe(false);
  });
});
