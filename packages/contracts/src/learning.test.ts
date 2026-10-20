import { describe, expect, it } from "vitest";
import { lessonShare, sharePercent, courseDashboardResponseSchema, learningActivityQuerySchema, learningGoalSchema, learningTimeRequestSchema, lessonMetricsResponseSchema, localDayOf, practiceAttemptRequestSchema, pronunciationAttemptRequestSchema, PRONUNCIATION_WORDS_MAX } from "./learning";

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

describe("lessonMetricsResponseSchema", () => {
  const words = { total: 4, practised: 2, strong: 1 };
  const time = { readingSeconds: 120, practiceSeconds: 0, typical: { reading: { seconds: 300, learners: 2 }, practice: null } };
  it("carries an attempt count and a whole fluency score, or none, with word counts and the last study time", () => {
    for (const pronunciation of [{ attempts: 0, fluency: null }, { attempts: 3, fluency: 74 }, { attempts: 1, fluency: 100 }]) {
      for (const lastStudiedAt of [null, 1_700_000_000_000]) {
        const body = { pronunciation, words, lastStudiedAt, time };
        expect(lessonMetricsResponseSchema.parse(body)).toEqual(body);
      }
    }
  });

  it("refuses scores outside 0–100, fractions, negative counts, counts that do not nest, and extra fields", () => {
    const base = { words, lastStudiedAt: null };
    for (const body of [
      { ...base, pronunciation: { attempts: 1, fluency: 101 } }, { ...base, pronunciation: { attempts: 1, fluency: 70.5 } }, { ...base, pronunciation: { attempts: -1, fluency: null } },
      { ...base, pronunciation: { attempts: 1, fluency: 70, recall: 0.9 } }, { ...base, pronunciation: { attempts: 1, fluency: 70 }, userId: "x" },
      { pronunciation: { attempts: 0, fluency: null }, words: { total: 1, practised: 2, strong: 0 }, lastStudiedAt: null },
      { pronunciation: { attempts: 0, fluency: null }, words: { total: 2, practised: 1, strong: 2 }, lastStudiedAt: null },
      { pronunciation: { attempts: 0, fluency: null }, words: { ...words, recall: 0.5 }, lastStudiedAt: null },
      { pronunciation: { attempts: 0, fluency: null }, words, lastStudiedAt: -1 },
    ]) expect(lessonMetricsResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe("courseDashboardResponseSchema", () => {
  const id = "8f8a3c55-8b0f-4f43-a3c4-3c5a8f2a4c11";
  const course = { id, slug: "dutch", title: "Dutch", summary: "Learn.", level: "A1", coverUrl: null, lessonCount: 2, coursePercent: 25 };
  const lesson = { id, slug: "hello", title: "Hello", number: 1, total: 2, imageUrl: null, storylinePercent: 50 };
  const body = { resume: { course, lesson }, recentLessons: [{ course: { id, slug: "dutch", title: "Dutch", coursePercent: 25 }, lesson, activityAt: 1,
    metrics: { wordRecency: { lastReviewedAt: null, recent: 1, total: 2 }, memory: { strong: 1, fading: 0, new: 1, total: 2 }, pronunciation: { attempts: 0, fluency: null } } }], notStarted: [] };
  it("accepts a private dashboard without recall probabilities", () => expect(courseDashboardResponseSchema.parse(body)).toEqual(body));
  it("requires nested memory bands and bounds recent lessons", () => {
    expect(courseDashboardResponseSchema.safeParse({ ...body, recentLessons: [{ ...body.recentLessons[0], metrics: { ...body.recentLessons[0]!.metrics, memory: { strong: 2, fading: 1, new: 1, total: 2 } } }] }).success).toBe(false);
    expect(courseDashboardResponseSchema.safeParse({ ...body, userId: id }).success).toBe(false);
    expect(courseDashboardResponseSchema.safeParse({ ...body, recentLessons: Array.from({ length: 10 }, () => body.recentLessons[0]) }).success).toBe(false);
  });
});

describe("learningTimeRequestSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const ok = (entries: unknown[], day = "2026-10-20") => learningTimeRequestSchema.safeParse({ day, entries }).success;
  it("takes each activity with its own target shape", () => {
    expect(ok([
      { activity: "reading", focus: "grammar", courseId: id, lessonId: id, seconds: 60 },
      { activity: "practice", courseId: id, lessonId: id, practiceId: id, seconds: 1 },
      { activity: "ai_practice", courseId: id, lessonId: id, practiceId: id, seconds: 600 },
      { activity: "drill", courseId: id, seconds: 30 }, { activity: "drill", seconds: 30 },
      { activity: "tutor", seconds: 30 }, { activity: "words", seconds: 30 },
    ])).toBe(true);
  });
  it("refuses other shapes, seconds outside 1–600, too many entries, and days that do not exist", () => {
    expect(ok([])).toBe(false);
    expect(ok([{ activity: "reading", courseId: id, lessonId: id, seconds: 60 }])).toBe(false);
    expect(ok([{ activity: "ai_practice", focus: "grammar", courseId: id, lessonId: id, practiceId: id, seconds: 60 }])).toBe(false);
    expect(ok([{ activity: "tutor", courseId: id, seconds: 60 }])).toBe(false);
    expect(ok([{ activity: "words", seconds: 0 }])).toBe(false);
    expect(ok([{ activity: "words", seconds: 601 }])).toBe(false);
    expect(ok([{ activity: "words", seconds: 1.5 }])).toBe(false);
    expect(ok(Array.from({ length: 21 }, () => ({ activity: "words", seconds: 1 })))).toBe(false);
    for (const day of ["2026-02-30", "2026-1-01", "20261020", "2026-13-01"]) expect(ok([{ activity: "words", seconds: 1 }], day)).toBe(false);
  });
  it("names a date's local day", () => {
    expect(localDayOf(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("learningGoalSchema", () => {
  it("accepts 5–240 whole minutes or no goal", () => {
    for (const dailyGoalMinutes of [5, 240, null]) expect(learningGoalSchema.safeParse({ dailyGoalMinutes }).success).toBe(true);
    for (const dailyGoalMinutes of [4, 241, 7.5, "15", undefined]) expect(learningGoalSchema.safeParse({ dailyGoalMinutes }).success).toBe(false);
    expect(learningGoalSchema.safeParse({ dailyGoalMinutes: 15, extra: true }).success).toBe(false);
  });
});

describe("learningActivityQuerySchema", () => {
  it("takes a week or a month ending on a day", () => {
    expect(learningActivityQuerySchema.safeParse({ range: "week", end: "2026-10-20" }).success).toBe(true);
    expect(learningActivityQuerySchema.safeParse({ range: "month", end: "2026-10-20" }).success).toBe(true);
    expect(learningActivityQuerySchema.safeParse({ range: "year", end: "2026-10-20" }).success).toBe(false);
    expect(learningActivityQuerySchema.safeParse({ range: "week", end: "2026-13-01" }).success).toBe(false);
  });
});

describe("lessonShare", () => {
  const base = { completed: false, readingShare: 0, hasReading: true, practicesDone: 0, practicesTotal: 0 };
  it("weighs reading and practices half each, and counts a completion whole", () => {
    expect(lessonShare({ ...base, readingShare: 0.5, practicesDone: 1, practicesTotal: 4 })).toBe(0.375);
    expect(lessonShare({ ...base, readingShare: 1, practicesDone: 4, practicesTotal: 4 })).toBe(1);
    expect(lessonShare({ ...base, completed: true })).toBe(1);
  });
  it("is all reading without practices and all practices without reading steps", () => {
    expect(lessonShare({ ...base, readingShare: 0.75 })).toBe(0.75);
    expect(lessonShare({ ...base, hasReading: false, practicesDone: 1, practicesTotal: 2 })).toBe(0.5);
    expect(lessonShare({ ...base, hasReading: false })).toBe(0);
  });
  it("keeps its inputs in bounds", () => {
    expect(lessonShare({ ...base, readingShare: 1.4, practicesDone: 5, practicesTotal: 2 })).toBe(1);
    expect(lessonShare({ ...base, readingShare: -1 })).toBe(0);
  });
  it("turns a share into a whole percentage, rounded down", () => {
    expect(sharePercent(0.375)).toBe(37);
    expect(sharePercent(1 / 3 + 2 / 3)).toBe(100);
    expect(sharePercent(0.999)).toBe(99);
  });
});
