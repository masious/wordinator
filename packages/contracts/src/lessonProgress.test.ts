import { describe, expect, it } from "vitest";
import { lessonProgressResponseSchema, lessonStateSchema } from ".";

// The Progress tab payload (C14c, docs/courses.md#lesson-progress-tab).
const row = {
  lessonId: "40000000-0000-4000-8000-000000000001", slug: "greetings", title: "Greetings", state: "missed", storylinePercent: 0,
  practicesDone: 0, practicesTotal: 2, wordsReviewed: 1, wordsTotal: 4, aiPracticeCount: 0, practiceIds: ["50000000-0000-4000-8000-000000000001"],
};

describe("lesson progress contracts", () => {
  it("accepts the four derived states only", () => {
    expect(lessonStateSchema.options).toEqual(["not_started", "in_progress", "completed", "missed"]);
    expect(lessonStateSchema.safeParse("skipped").success).toBe(false);
  });

  it("validates the payload and its bounds", () => {
    const payload = { complete: false, publishedLessons: 1, completedLessons: 0, missedLessons: 1, lessons: [row] };
    expect(lessonProgressResponseSchema.parse(payload)).toEqual(payload);
    expect(lessonProgressResponseSchema.safeParse({ ...payload, lessons: [{ ...row, storylinePercent: 101 }] }).success).toBe(false);
    expect(lessonProgressResponseSchema.safeParse({ ...payload, lessons: [{ ...row, practicesDone: -1 }] }).success).toBe(false);
  });
});
