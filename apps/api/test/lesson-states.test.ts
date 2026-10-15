import { describe, expect, it } from "vitest";
import { courseComplete, deriveLessonStates, type LessonStanding } from "../src/learning/lessonStates";

// Lesson states and course completion (C14c, docs/courses.md#lesson-states).
const C: LessonStanding = { completed: true, started: false };
const P: LessonStanding = { completed: false, started: true };
const N: LessonStanding = { completed: false, started: false };

describe("lesson states", () => {
  it("derives completed, in progress, and not started", () => {
    expect(deriveLessonStates([C, P, N])).toEqual(["completed", "in_progress", "not_started"]);
    // A finished lesson practised again keeps its completion.
    expect(deriveLessonStates([{ completed: true, started: true }])).toEqual(["completed"]);
    expect(deriveLessonStates([])).toEqual([]);
  });

  it("marks a lesson missed only behind a later started or completed lesson", () => {
    expect(deriveLessonStates([N, N, P])).toEqual(["missed", "missed", "in_progress"]);
    expect(deriveLessonStates([N, C, N])).toEqual(["missed", "completed", "not_started"]);
    expect(deriveLessonStates([C, N, N])).toEqual(["completed", "not_started", "not_started"]);
    expect(deriveLessonStates([N, N, N])).toEqual(["not_started", "not_started", "not_started"]);
  });

  it("completes a course when every lesson is completed or missed", () => {
    expect(courseComplete(deriveLessonStates([C, C, C]))).toBe(true);
    expect(courseComplete(deriveLessonStates([N, C, N, C]))).toBe(true);
    // The last lesson must be completed: in progress or untouched leaves the course open.
    expect(courseComplete(deriveLessonStates([C, C, P]))).toBe(false);
    expect(courseComplete(deriveLessonStates([C, N, C, N]))).toBe(false);
    expect(courseComplete(deriveLessonStates([]))).toBe(false);
  });
});
