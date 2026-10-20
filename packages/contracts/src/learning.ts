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

// The lesson metrics read (docs/courses.md#lesson-box): the viewer's own figures for one lesson, computed at read time.
// `pronunciation` averages the Azure fluency score (0–100, rounded) of the viewer's pronunciation attempts on the lesson's words;
// `fluency` is null when there are none. `words` counts the lesson's distinct terms (`total`), those with word memory
// (`practised`), and those remembered well now (`strong`); recall itself is never returned. `lastStudiedAt` is the viewer's latest
// activity on the lesson (reading position, practice attempt, word review, or spoken attempt), in epoch milliseconds, or null.
export const lessonMetricsResponseSchema = z.strictObject({
  pronunciation: z.strictObject({ attempts: z.number().int().nonnegative(), fluency: z.number().int().min(0).max(100).nullable() }),
  words: z.strictObject({ total: z.number().int().nonnegative(), practised: z.number().int().nonnegative(), strong: z.number().int().nonnegative() })
    .refine((words) => words.strong <= words.practised && words.practised <= words.total, { message: "Counts must nest." }),
  lastStudiedAt: z.number().int().nonnegative().nullable(),
  time: z.lazy(() => lessonTimeSchema),
});
export type LessonMetricsResponse = z.infer<typeof lessonMetricsResponseSchema>;

// The private course-library dashboard (docs/courses.md#library-page). It is derived for the signed-in viewer: no account ID is
// accepted from the client, and recall probabilities stay server-side. The dashboard exposes only the three memory bands.
const dashboardProgressSchema = z.number().int().min(0).max(100);
const dashboardCourseRefSchema = z.strictObject({
  id: opaqueIdSchema, slug: z.string(), title: z.string(), summary: z.string(), level: z.string().nullable(),
  coverUrl: z.string().url().nullable(), lessonCount: z.number().int().nonnegative(), coursePercent: dashboardProgressSchema,
});
const dashboardLessonRefSchema = z.strictObject({
  id: opaqueIdSchema, slug: z.string(), title: z.string(), number: z.number().int().positive(), total: z.number().int().positive(),
  imageUrl: z.string().url().nullable(), storylinePercent: dashboardProgressSchema,
});
export const courseDashboardResponseSchema = z.strictObject({
  resume: z.strictObject({ course: dashboardCourseRefSchema, lesson: dashboardLessonRefSchema }).nullable(),
  recentLessons: z.array(z.strictObject({
    course: dashboardCourseRefSchema.pick({ id: true, slug: true, title: true, coursePercent: true }),
    lesson: dashboardLessonRefSchema, activityAt: z.number().int().nonnegative(),
    metrics: z.strictObject({
      wordRecency: z.strictObject({
        lastReviewedAt: z.number().int().nonnegative().nullable(), recent: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
      }).refine((value) => value.recent <= value.total, { message: "Recent words cannot exceed total words." }),
      memory: z.strictObject({
        strong: z.number().int().nonnegative(), fading: z.number().int().nonnegative(), new: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
      }).refine((value) => value.strong + value.fading + value.new === value.total, { message: "Memory bands must equal total words." }),
      pronunciation: z.strictObject({ attempts: z.number().int().nonnegative(), fluency: z.number().int().min(0).max(100).nullable() }),
    }),
  })).max(9),
  notStarted: z.array(dashboardCourseRefSchema.omit({ summary: true, coursePercent: true })),
});
export type CourseDashboardResponse = z.infer<typeof courseDashboardResponseSchema>;

// ---- Learning time (C15) ----

// docs/learning-time.md owns what is measured and how it is sent; docs/data-model.md#learning_time the rows.
export const LEARNING_TIME_ENTRIES_MAX = 20;
export const LEARNING_TIME_SECONDS_MAX = 600;
export const learningActivitySchema = z.enum(["reading", "practice", "ai_practice", "tutor", "drill", "words"]);
export type LearningActivity = z.infer<typeof learningActivitySchema>;
export const readingFocusSchema = z.enum(["lesson", "grammar"]);
export type ReadingFocus = z.infer<typeof readingFocusSchema>;
// The skill an AI practice works on; the tutor names it when it saves the practice.
export const aiPracticeFocusSchema = z.enum(["grammar", "vocabulary", "reading", "listening", "writing"]);
export type AiPracticeFocus = z.infer<typeof aiPracticeFocusSchema>;

// A calendar day in the learner's own time zone, `YYYY-MM-DD`.
export const localDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value); }, { message: "Give a real day." });
export const localDayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const timeSecondsSchema = z.number().int().min(1).max(LEARNING_TIME_SECONDS_MAX);
// One target's seconds. An AI practice's focus is read from the practice on the server, never taken from the client.
export const learningTimeEntrySchema = z.discriminatedUnion("activity", [
  z.strictObject({ activity: z.literal("reading"), focus: readingFocusSchema, courseId: opaqueIdSchema, lessonId: opaqueIdSchema, seconds: timeSecondsSchema }),
  z.strictObject({ activity: z.literal("practice"), courseId: opaqueIdSchema, lessonId: opaqueIdSchema, practiceId: opaqueIdSchema, seconds: timeSecondsSchema }),
  z.strictObject({ activity: z.literal("ai_practice"), courseId: opaqueIdSchema, lessonId: opaqueIdSchema, practiceId: opaqueIdSchema, seconds: timeSecondsSchema }),
  z.strictObject({ activity: z.literal("drill"), courseId: opaqueIdSchema.optional(), seconds: timeSecondsSchema }),
  z.strictObject({ activity: z.literal("tutor"), seconds: timeSecondsSchema }),
  z.strictObject({ activity: z.literal("words"), seconds: timeSecondsSchema }),
]);
export type LearningTimeEntry = z.infer<typeof learningTimeEntrySchema>;
// `POST /api/groups/:groupId/learning-time`; answered with 204.
export const learningTimeRequestSchema = z.strictObject({
  day: localDaySchema,
  entries: z.array(learningTimeEntrySchema).min(1).max(LEARNING_TIME_ENTRIES_MAX),
});
export type LearningTimeRequest = z.input<typeof learningTimeRequestSchema>;

// A median over the learners who finished, in seconds, with how many learners it covers.
export const typicalTimeSchema = z.strictObject({ seconds: z.number().int().nonnegative(), learners: z.number().int().positive() });
export type TypicalTime = z.infer<typeof typicalTimeSchema>;
// The lesson box's times (docs/learning-time.md#lesson-and-practice-times): the viewer's own reading and practice (lesson and AI
// practices) seconds in the lesson, and the typical times, null until anyone finished.
export const lessonTimeSchema = z.strictObject({
  readingSeconds: z.number().int().nonnegative(),
  practiceSeconds: z.number().int().nonnegative(),
  typical: z.strictObject({ reading: typicalTimeSchema.nullable(), practice: typicalTimeSchema.nullable() }),
});
export type LessonTime = z.infer<typeof lessonTimeSchema>;

// ---- Activity and goal (C15d) ----

// docs/learning-time.md#daily-goal-and-streak owns the goal; `null` is no goal.
export const DAILY_GOAL_MINUTES_MIN = 5;
export const DAILY_GOAL_MINUTES_MAX = 240;
export const learningGoalSchema = z.strictObject({
  dailyGoalMinutes: z.number().int().min(DAILY_GOAL_MINUTES_MIN).max(DAILY_GOAL_MINUTES_MAX).nullable(),
});
export type LearningGoal = z.infer<typeof learningGoalSchema>;

const seconds = z.number().int().nonnegative();
// Seconds per category (docs/learning-time.md#activity). `aiPractice` is AI practice and tutor time together.
export const timeCategoriesSchema = z.strictObject({ lesson: seconds, grammar: seconds, practice: seconds, vocabulary: seconds, aiPractice: seconds, total: seconds });
export type TimeCategories = z.infer<typeof timeCategoriesSchema>;
// The AI practice part of a period, split by each practice's focus (tutor time has none).
export const aiPracticeFocusSecondsSchema = z.strictObject({ grammar: seconds, vocabulary: seconds, reading: seconds, listening: seconds, writing: seconds });
export const activityTotalsSchema = timeCategoriesSchema.extend({ aiPracticeFocus: aiPracticeFocusSecondsSchema });
export type ActivityTotals = z.infer<typeof activityTotalsSchema>;
export const learningActivityDaySchema = activityTotalsSchema.extend({ day: localDaySchema });
export type LearningActivityDay = z.infer<typeof learningActivityDaySchema>;

// `GET /api/groups/:groupId/learning-activity?range=week|month&end=YYYY-MM-DD`: the days are the learner's local days ending on `end`.
export const LEARNING_ACTIVITY_DAYS = { week: 7, month: 30 } as const;
export const learningActivityRangeSchema = z.enum(["week", "month"]);
export type LearningActivityRange = z.infer<typeof learningActivityRangeSchema>;
export const learningActivityQuerySchema = z.object({ range: learningActivityRangeSchema, end: localDaySchema });
export const learningActivityResponseSchema = z.strictObject({
  range: learningActivityRangeSchema,
  from: localDaySchema,
  to: localDaySchema,
  // One row per day from `from` to `to`, zero-filled.
  days: z.array(learningActivityDaySchema),
  totals: activityTotalsSchema,
  // The seconds of the same number of days just before `from`, for the change against the previous period.
  previousTotal: seconds,
  dailyGoalMinutes: learningGoalSchema.shape.dailyGoalMinutes,
  streak: z.number().int().nonnegative(),
});
export type LearningActivityResponse = z.infer<typeof learningActivityResponseSchema>;

// ---- Lesson share (docs/courses.md#progress) ----

/**
 * How much of a lesson a learner has done, from 0 to 1. Reading and practices weigh half each: reading is the share of the
 * lesson's reading steps (every step but practice questions) reached, and each practice counts once every one of its questions
 * has an answer. A lesson without practices is all reading; one without reading steps is all practices. A completion counts whole.
 */
export type LessonShareInput = {
  completed: boolean; readingShare: number; hasReading: boolean; practicesDone: number; practicesTotal: number;
};
export function lessonShare({ completed, readingShare, hasReading, practicesDone, practicesTotal }: LessonShareInput): number {
  if (completed) return 1;
  const reading = Math.min(1, Math.max(0, readingShare));
  const practice = practicesTotal > 0 ? Math.min(practicesDone, practicesTotal) / practicesTotal : 0;
  if (practicesTotal === 0) return hasReading ? reading : 0;
  return hasReading ? (reading + practice) / 2 : practice;
}
/** A share as a whole percentage, rounded down; the epsilon keeps sums such as 1/3 + 2/3 from losing a point. */
export const sharePercent = (share: number) => Math.max(0, Math.min(100, Math.floor(share * 100 + 1e-9)));
