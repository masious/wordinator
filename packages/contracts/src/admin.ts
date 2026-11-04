import { z } from "zod";
import { aiProviderSchema } from "./ai";
import { timeCategoriesSchema } from "./learning";

// Superuser analytics (C14e). docs/settings-and-administration.md#analytics owns what is counted. Every response holds
// counts, token totals, and costs only, never message text, answers, words, or scores, so the objects are strict: a
// field added by mistake fails the contract instead of reaching the page.

export const ADMIN_ANALYTICS_RANGES = [7, 30, 90] as const;
export type AdminAnalyticsRange = (typeof ADMIN_ANALYTICS_RANGES)[number];

// `?days=7|30|90`, 7 when missing.
export const adminAnalyticsQuerySchema = z.object({
  days: z.enum(["7", "30", "90"]).default("7").transform((value) => Number(value) as AdminAnalyticsRange),
});

const count = z.number().int().nonnegative();
// A UTC calendar day, `YYYY-MM-DD`.
export const utcDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Every response names its range: `from` and `to` are the first and last UTC day, both inclusive, and `daily` has one
// row per day in order, zero-filled.
const rangeFields = { days: z.union([z.literal(7), z.literal(30), z.literal(90)]), from: utcDaySchema, to: utcDaySchema };
// Accounts are listed by username (null only for an account that never finished setup) and keyed by their opaque ID.
const accountFields = { userId: z.string(), username: z.string().nullable() };

export const practiceAttemptCountsSchema = z.strictObject({ lesson: count, aiChat: count, aiPractice: count });
export type PracticeAttemptCounts = z.infer<typeof practiceAttemptCountsSchema>;

const learningCounts = {
  lessonsCompleted: count,
  drillReviews: count,
  practiceAttempts: practiceAttemptCountsSchema,
  pronunciationAttempts: count,
};

export const learningAnalyticsResponseSchema = z.strictObject({
  ...rangeFields,
  // `activeAccounts`: accounts with any word review (not seeds), practice or pronunciation attempt, saved position,
  // lesson completion, or tutor turn that day.
  daily: z.array(z.strictObject({ day: utcDaySchema, activeAccounts: count, ...learningCounts })),
  // Accounts with any activity in the range, by username. `activeDays` counts the days they were active.
  accounts: z.array(z.strictObject({ ...accountFields, activeDays: count, ...learningCounts })),
});
export type LearningAnalyticsResponse = z.infer<typeof learningAnalyticsResponseSchema>;

const aiCounts = {
  // Tutor turns (`ai_usage.turn_start`), every model request including fallbacks, and the failed ones among them.
  turns: count,
  requests: count,
  failures: count,
  tokensIn: count,
  tokensOut: count,
  costMicroUsd: count,
};

export const aiAnalyticsResponseSchema = z.strictObject({
  ...rangeFields,
  daily: z.array(z.strictObject({ day: utcDaySchema, ...aiCounts })),
  accounts: z.array(z.strictObject({ ...accountFields, ...aiCounts })),
  models: z.array(z.strictObject({ provider: aiProviderSchema, model: z.string(), ...aiCounts })),
});
export type AiAnalyticsResponse = z.infer<typeof aiAnalyticsResponseSchema>;

const speechCounts = {
  // Every on-demand speech request and its characters, split into cache hits (free) and Azure calls.
  requests: count,
  characters: count,
  cacheHits: count,
  azureCalls: count,
  azureCharacters: count,
};

export const speechAnalyticsResponseSchema = z.strictObject({
  ...rangeFields,
  daily: z.array(z.strictObject({ day: utcDaySchema, ...speechCounts })),
  accounts: z.array(z.strictObject({ ...accountFields, ...speechCounts })),
});
export type SpeechAnalyticsResponse = z.infer<typeof speechAnalyticsResponseSchema>;

// Learning time by category (C15d, docs/learning-time.md#analytics): seconds per UTC day label and account, from the learners'
// local days in that range. Only durations, never the activity's targets.
export const timeAnalyticsResponseSchema = z.strictObject({
  ...rangeFields,
  daily: z.array(z.strictObject({ day: utcDaySchema, ...timeCategoriesSchema.shape })),
  accounts: z.array(z.strictObject({ ...accountFields, ...timeCategoriesSchema.shape })),
});
export type TimeAnalyticsResponse = z.infer<typeof timeAnalyticsResponseSchema>;

// Image library (docs/settings-and-administration.md#image-library): every stored course image with where it is used.
// `cover` is a course cover, `lesson` an image block's upload, and the other kinds are dialogue scene assets.
export const ADMIN_IMAGE_KINDS = ["cover", "lesson", "location", "scene", "mask", "portrait"] as const;
export const adminImageKindSchema = z.enum(ADMIN_IMAGE_KINDS);
export type AdminImageKind = z.infer<typeof adminImageKindSchema>;
// `dialogue` filters to every dialogue scene kind at once.
export const adminImageKindFilterSchema = z.enum([...ADMIN_IMAGE_KINDS, "dialogue"]);
export type AdminImageKindFilter = z.infer<typeof adminImageKindFilterSchema>;
export const ADMIN_IMAGES_PAGE_SIZE = 60;
const ADMIN_IMAGE_KEY_MAX = 512;
// The cursor is the last item's `createdAt|key`; the list runs newest first.
const adminImagesCursorSchema = z.string().max(ADMIN_IMAGE_KEY_MAX + 20).regex(/^\d{1,16}\|.+$/).transform((value) => {
  const split = value.indexOf("|");
  return { createdAt: Number(value.slice(0, split)), key: value.slice(split + 1) };
});
const emptyAsMissing = (value: unknown) => value === "" || value === null ? undefined : value;
export const adminImagesQuerySchema = z.object({
  kind: z.preprocess(emptyAsMissing, adminImageKindFilterSchema.optional()),
  courseId: z.preprocess(emptyAsMissing, z.string().max(64).optional()),
  lessonId: z.preprocess(emptyAsMissing, z.string().max(64).optional()),
  usage: z.preprocess(emptyAsMissing, z.enum(["used", "unused"]).optional()),
  cursor: z.preprocess(emptyAsMissing, adminImagesCursorSchema.optional()),
});
export type AdminImagesQuery = z.input<typeof adminImagesQuerySchema>;

export const adminImageSchema = z.strictObject({
  key: z.string(),
  url: z.url(),
  kind: adminImageKindSchema,
  // Lesson images and covers do not record their size.
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  // A cover takes its course's creation time.
  createdAt: z.number().int().nonnegative(),
  course: z.strictObject({ id: z.string(), slug: z.string(), title: z.string(), status: z.enum(["draft", "published", "archived"]) }),
  lesson: z.strictObject({ id: z.string(), slug: z.string(), title: z.string(), position: z.number().int().nonnegative() }).nullable(),
  // Dialogue scene assets name their dialogue block and slot; `section` is the heading the dialogue sits under and `line`
  // the turn a line scene or mask belongs to, both from the published document, or the draft when it has none.
  dialogue: z.strictObject({
    blockId: z.string(), speaker: z.string().nullable(), lineIndex: z.number().int().nonnegative().nullable(),
    section: z.string().nullable(), line: z.strictObject({ speaker: z.string(), text: z.string() }).nullable(),
  }).nullable(),
  // Whether the lesson's draft or published document uses the image (a lesson image's key or a dialogue asset's block).
  // A cover is always in use by its course.
  usedInDraft: z.boolean(),
  usedInPublished: z.boolean(),
});
export type AdminImage = z.infer<typeof adminImageSchema>;
export const adminImagesResponseSchema = z.strictObject({ images: z.array(adminImageSchema), nextCursor: z.string().nullable() });
export type AdminImagesResponse = z.infer<typeof adminImagesResponseSchema>;
// Courses and their lessons, for the filters.
export const adminImageFiltersResponseSchema = z.strictObject({
  courses: z.array(z.strictObject({
    id: z.string(), title: z.string(),
    lessons: z.array(z.strictObject({ id: z.string(), title: z.string(), position: z.number().int().nonnegative() })),
  })),
});
export type AdminImageFiltersResponse = z.infer<typeof adminImageFiltersResponseSchema>;
// `POST /api/admin/images/replace` takes multipart `key` and `image` and answers with the replaced image under its new key.
export const adminImageReplaceKeySchema = z.string().trim().min(1).max(ADMIN_IMAGE_KEY_MAX);
export const adminImageReplaceResponseSchema = z.strictObject({ image: adminImageSchema, previousKey: z.string() });
export type AdminImageReplaceResponse = z.infer<typeof adminImageReplaceResponseSchema>;

// `GET` and `PUT /api/admin/ai-settings` read and replace the whole value with the contracts' `aiSettingsSchema`
// (`@wordinator/contracts/ai`); an invalid body is `400 AI_SETTINGS_INVALID`.
export const ADMIN_ERROR_CODES = ["SUPERUSER_REQUIRED", "AI_SETTINGS_INVALID", "IMAGE_NOT_FOUND"] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];
