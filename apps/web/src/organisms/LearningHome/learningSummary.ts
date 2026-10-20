import type { LearningActivityDay } from "@wordinator/contracts/learning";
import type { TFunction } from "i18next";
import type { ActivityCategory } from "../../learningActivity";

// Pure helpers for the home dashboard (C15e, docs/learning-time.md#home-dashboard): the day's share of the goal, the change against
// the previous period, and the durations the cards show. Colours live in the stylesheet, as design tokens.

export type { ActivityCategory };
// The stacking order of a day's bar, from the bottom up, and the legend's order.
export const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = ["lesson", "grammar", "practice", "vocabulary", "aiPractice"];

/** The share of today's goal reached, from 0 to 1 (capped), or null without a goal. A day meets the goal at its full minutes. */
export function goalShare(seconds: number, dailyGoalMinutes: number | null): number | null {
  if (dailyGoalMinutes === null) return null;
  return Math.min(1, Math.max(0, seconds) / (dailyGoalMinutes * 60));
}

/** The change of this period's total against the previous one, as a whole percentage; null when the previous period had no time. */
export function periodChange(total: number, previousTotal: number): number | null {
  if (previousTotal === 0) return null;
  return Math.round(((total - previousTotal) / previousTotal) * 100);
}

/** The day with the given local date, when the range holds it. */
export function dayOf(days: readonly LearningActivityDay[], day: string): LearningActivityDay | undefined {
  return days.find((entry) => entry.day === day);
}

/** The height scale of the bars: the busiest day, and at least a minute so an empty range does not divide by zero. */
export function barScale(days: readonly LearningActivityDay[]): number {
  return Math.max(60, ...days.map((day) => day.total));
}

/**
 * A duration as the lesson box writes it: `0 min`, `Under a minute`, `45 min`, and `4h 20m` from an hour on.
 * Seconds are whole and non-negative.
 */
export function studyTime(t: TFunction, seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (seconds > 0 && minutes === 0) return t("courses.lessonBox.underMinute");
  if (minutes < 60) return t("courses.lessonBox.minutes", { count: minutes });
  return t("learningHome.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}
