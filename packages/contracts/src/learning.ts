import { z } from "zod";
import { COURSE_PRACTICE_ITEMS_MAX, COURSE_WORD_TERM_MAX, opaqueIdSchema } from "./index";

// Learning data the web and the tutor record (C14b). docs/courses.md#practice-attempts owns practice attempts,
// docs/words.md#pronunciation-assessment owns pronunciation attempts, and docs/data-model.md their rows. The shapes here are shared
// by the lesson surfaces and the tutor phases, which add their own source, verdict, and conversation on the server.

// ---- Practice attempts ----

// Prompt, answer, and reference are each capped at this length in `practice_attempts`.
export const PRACTICE_ATTEMPT_TEXT_MAX = 2_000;
export const practiceAttemptKindSchema = z.enum(["lesson", "ai"]);
export type PracticeAttemptKind = z.infer<typeof practiceAttemptKindSchema>;
export const practiceAttemptSourceSchema = z.enum(["lesson", "ai_chat", "ai_practice"]);
export type PracticeAttemptSource = z.infer<typeof practiceAttemptSourceSchema>;
export const practiceAttemptVerdictSchema = z.enum(["acceptable", "error"]);
export type PracticeAttemptVerdict = z.infer<typeof practiceAttemptVerdictSchema>;

// A checked answer as the learner typed it (a fill-in item's blanks joined by ` · `). An empty answer records nothing, so it is refused.
export const practiceAttemptAnswerSchema = z.string().max(PRACTICE_ATTEMPT_TEXT_MAX)
  .refine((value) => value.trim().length > 0, { message: "An attempt needs an answer." });

// One checked item of a lesson practice. The server reads the item's author's version from the published document and decides the
// match itself; anything else the client sends (such as its own match result) is ignored.
export const practiceAttemptRequestSchema = z.object({
  item: z.number().int().nonnegative().max(COURSE_PRACTICE_ITEMS_MAX - 1),
  answer: practiceAttemptAnswerSchema,
});
export type PracticeAttemptRequest = z.input<typeof practiceAttemptRequestSchema>;

// ---- Pronunciation attempts ----

export const PRONUNCIATION_REFERENCE_MAX = 200;
export const PRONUNCIATION_WORDS_MAX = 50;
export const pronunciationSurfaceSchema = z.enum(["drill", "word_card", "ai_chat"]);
export type PronunciationSurface = z.infer<typeof pronunciationSurfaceSchema>;
export const pronunciationScoreSchema = z.number().min(0).max(100);
export const pronunciationWordErrorSchema = z.enum(["none", "mispronunciation", "omission", "insertion"]);
// One word of the reference (or an extra word): its accuracy, null for a word that was not heard, and Azure's error type.
export const pronunciationWordScoreSchema = z.strictObject({
  word: z.string().min(1).max(COURSE_WORD_TERM_MAX),
  accuracy: pronunciationScoreSchema.nullable(),
  error: pronunciationWordErrorSchema,
});
export type PronunciationWordScore = z.infer<typeof pronunciationWordScoreSchema>;
// Microsoft's scores of one utterance, 0–100.
export const pronunciationScoresSchema = z.strictObject({
  overall: pronunciationScoreSchema,
  accuracy: pronunciationScoreSchema,
  fluency: pronunciationScoreSchema,
  completeness: pronunciationScoreSchema,
  words: z.array(pronunciationWordScoreSchema).max(PRONUNCIATION_WORDS_MAX),
});
export type PronunciationScores = z.infer<typeof pronunciationScoresSchema>;

// One assessment. A lesson and word, when given, come together and must be in the published index of a lesson the learner can read;
// the server then takes the term key from the index. Without them the term key is stored as sent (the tutor's Say it).
export const pronunciationAttemptRequestSchema = pronunciationScoresSchema.extend({
  surface: pronunciationSurfaceSchema,
  referenceText: z.string().trim().min(1).max(PRONUNCIATION_REFERENCE_MAX),
  termKey: z.string().trim().min(1).max(COURSE_WORD_TERM_MAX).optional(),
  lessonId: opaqueIdSchema.optional(),
  wordId: opaqueIdSchema.optional(),
}).refine((value) => (value.lessonId === undefined) === (value.wordId === undefined), { message: "Give a lesson and a word together.", path: ["wordId"] });
export type PronunciationAttemptRequest = z.input<typeof pronunciationAttemptRequestSchema>;
