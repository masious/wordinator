import type { LearningActivityResponse } from "@wordinator/contracts/learning";
import { describe, expect, it } from "vitest";
import { categoryOf, withSentTime } from "./learningActivity";

// The activity categories of clock targets and sent entries (docs/learning-time.md#activity).
const id = "50000000-0000-4000-8000-000000000001";
const zero = { lesson: 0, grammar: 0, practice: 0, vocabulary: 0, aiPractice: 0, total: 0, aiPracticeFocus: { grammar: 0, vocabulary: 0, reading: 0, listening: 0, writing: 0 } };

describe("categoryOf", () => {
  it("files every activity under its category", () => {
    expect(categoryOf({ activity: "reading", focus: "lesson", courseId: id, lessonId: id })).toBe("lesson");
    expect(categoryOf({ activity: "reading", focus: "grammar", courseId: id, lessonId: id })).toBe("grammar");
    expect(categoryOf({ activity: "practice", courseId: id, lessonId: id, practiceId: id })).toBe("practice");
    expect(categoryOf({ activity: "drill" })).toBe("vocabulary");
    expect(categoryOf({ activity: "words" })).toBe("vocabulary");
    expect(categoryOf({ activity: "ai_practice", courseId: id, lessonId: id, practiceId: id })).toBe("aiPractice");
    expect(categoryOf({ activity: "tutor" })).toBe("aiPractice");
  });
});

describe("withSentTime", () => {
  const data: LearningActivityResponse = { range: "week", from: "2026-10-14", to: "2026-10-20", previousTotal: 0, dailyGoalMinutes: null, streak: 0,
    days: [{ ...zero, day: "2026-10-19" }, { ...zero, day: "2026-10-20", lesson: 60, total: 60 }], totals: { ...zero, lesson: 60, total: 60 } };

  it("adds sent seconds to their day and the totals by category", () => {
    const next = withSentTime(data, "2026-10-20", [{ activity: "words", seconds: 30 }, { activity: "reading", focus: "lesson", courseId: id, lessonId: id, seconds: 15 }]);
    expect(next.days[1]).toMatchObject({ lesson: 75, vocabulary: 30, total: 105 });
    expect(next.days[0]).toEqual(data.days[0]);
    expect(next.totals).toMatchObject({ lesson: 75, vocabulary: 30, total: 105 });
  });

  it("leaves a read without that day unchanged", () => {
    expect(withSentTime(data, "2026-10-21", [{ activity: "tutor", seconds: 30 }])).toBe(data);
  });
});
