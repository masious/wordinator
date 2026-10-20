import type { LearningActivityDay } from "@wordinator/contracts/learning";
import i18n from "i18next";
import { describe, expect, it } from "vitest";
import "../../i18n";
import { barScale, dayOf, goalShare, periodChange, studyTime } from "./learningSummary";

// The home dashboard's pure helpers (docs/learning-time.md#home-dashboard).
const t = i18n.getFixedT("en");
const day = (date: string, total: number): LearningActivityDay => ({
  day: date, lesson: total, grammar: 0, practice: 0, vocabulary: 0, aiPractice: 0, total,
  aiPracticeFocus: { grammar: 0, vocabulary: 0, reading: 0, listening: 0, writing: 0 },
});

describe("goalShare", () => {
  it("is the share of the goal reached, capped at 1, and null without a goal", () => {
    expect(goalShare(900, 30)).toBe(0.5);
    expect(goalShare(1800, 30)).toBe(1);
    expect(goalShare(3600, 30)).toBe(1);
    expect(goalShare(0, 15)).toBe(0);
    expect(goalShare(900, null)).toBeNull();
  });
});

describe("periodChange", () => {
  it("is the whole-percentage change against the previous period, and null when it had no time", () => {
    expect(periodChange(1080, 900)).toBe(20);
    expect(periodChange(450, 900)).toBe(-50);
    expect(periodChange(900, 900)).toBe(0);
    expect(periodChange(900, 0)).toBeNull();
    expect(periodChange(0, 0)).toBeNull();
  });
});

describe("studyTime", () => {
  it("writes the lesson box's durations and hours from an hour on", () => {
    expect(studyTime(t, 0)).toBe("0 min");
    expect(studyTime(t, 30)).toBe("Under a minute");
    expect(studyTime(t, 60)).toBe("1 min");
    expect(studyTime(t, 45 * 60 + 59)).toBe("45 min");
    expect(studyTime(t, 4 * 3600 + 20 * 60)).toBe("4h 20m");
  });
});

describe("dayOf and barScale", () => {
  const days = [day("2026-10-19", 600), day("2026-10-20", 1200)];
  it("finds the day in the range", () => {
    expect(dayOf(days, "2026-10-20")?.total).toBe(1200);
    expect(dayOf(days, "2026-10-21")).toBeUndefined();
  });
  it("scales bars to the busiest day, with a minute as the floor", () => {
    expect(barScale(days)).toBe(1200);
    expect(barScale([day("2026-10-20", 0)])).toBe(60);
  });
});
