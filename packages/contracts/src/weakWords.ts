import { z } from "zod";
import { COURSE_WORD_TERM_MAX, cursorSchema, opaqueIdSchema } from "./index";
import { courseWordSchema, wordRecentResultsSchema, wordSearchKey } from "./lessonDocument";

// The Weak words view (C14, docs/words.md#weak-words-view): the learner's remembered terms, weakest first, one row per term
// key with its last results across both directions and a visible occurrence to show. Pages are twenty rows; the cursor is
// opaque and pins the order computed for the first page.
export const WEAK_WORDS_PAGE_SIZE = 20;

export const weakWordsQuerySchema = z.object({ cursor: cursorSchema.optional() });
export type WeakWordsQuery = z.infer<typeof weakWordsQuerySchema>;

// A term key as `wordSearchKey` writes it: already folded, so a key is its own key.
export const wordTermKeySchema = z.string().min(1).max(COURSE_WORD_TERM_MAX * 2).refine((value) => wordSearchKey(value) === value, { message: "Not a term key." });

export const weakWordSchema = z.object({
  word: courseWordSchema,
  termKey: wordTermKeySchema,
  // The last five results in either direction, oldest first.
  recent: wordRecentResultsSchema,
  course: z.object({ id: opaqueIdSchema, slug: z.string(), title: z.string() }),
  lesson: z.object({ id: opaqueIdSchema, slug: z.string(), title: z.string() }),
});
export type WeakWord = z.infer<typeof weakWordSchema>;

// `hasMemory` says whether the learner has memory of any word they can still see, known ones included, so the drill setup
// can offer Weak words without bookmarks.
export const weakWordsPageSchema = z.object({
  items: z.array(weakWordSchema).max(WEAK_WORDS_PAGE_SIZE), nextCursor: z.string().nullable(), hasMemory: z.boolean(),
});
export type WeakWordsPage = z.infer<typeof weakWordsPageSchema>;
