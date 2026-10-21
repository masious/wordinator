import type { LearningActivityResponse, LearningTimeEntry, TimeCategories } from "@wordinator/contracts/learning";
import type { TimeTarget } from "./learningTime";

// The activity categories (docs/learning-time.md#activity), shared by the clock's pending seconds and the cached activity reads.

export type ActivityCategory = Exclude<keyof TimeCategories, "total">;

/** The category a clock target or sent entry counts towards. */
export function categoryOf(target: TimeTarget): ActivityCategory {
  switch (target.activity) {
    case "reading": return target.focus === "grammar" ? "grammar" : "lesson";
    case "practice": return "practice";
    case "drill": case "words": return "vocabulary";
    case "ai_practice": case "tutor": case "lesson_activity": return "aiPractice";
  }
}

/**
 * A cached activity read with sent seconds added to `day` and the totals, so a display that adds the clock's pending seconds
 * does not drop after a send. The AI practice focus split and the streak wait for the next read.
 */
export function withSentTime(data: LearningActivityResponse, day: string, entries: readonly LearningTimeEntry[]): LearningActivityResponse {
  if (!data.days.some((row) => row.day === day)) return data;
  const add = <T extends TimeCategories>(row: T): T => entries.reduce((next, entry) => {
    const category = categoryOf(entry);
    return { ...next, [category]: next[category] + entry.seconds, total: next.total + entry.seconds };
  }, row);
  return { ...data, days: data.days.map((row) => row.day === day ? add(row) : row), totals: add(data.totals) };
}
