import type { LessonState } from "@wordinator/contracts";

// Lesson states and course completion (docs/courses.md#lesson-states), derived at read time and never stored. Pure, so the
// course progress read and the tutor derive them the same way.

/** One published lesson as the viewer stands in it, in outline order. `started` means a saved position. */
export type LessonStanding = { completed: boolean; started: boolean };

/**
 * Completed with a completion; in progress with a saved position; missed when neither, while a later published lesson is in
 * progress or completed; otherwise not started.
 */
export function deriveLessonStates(lessons: readonly LessonStanding[]): LessonState[] {
  const states: LessonState[] = new Array(lessons.length);
  let laterTouched = false;
  for (let index = lessons.length - 1; index >= 0; index -= 1) {
    const lesson = lessons[index]!;
    states[index] = lesson.completed ? "completed" : lesson.started ? "in_progress" : laterTouched ? "missed" : "not_started";
    laterTouched ||= lesson.completed || lesson.started;
  }
  return states;
}

/** A course is complete when it has published lessons and every one is completed or missed, so the last is always completed. */
export const courseComplete = (states: readonly LessonState[]) =>
  states.length > 0 && states.every((state) => state === "completed" || state === "missed");
