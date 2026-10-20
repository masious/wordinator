import { lessonShare } from "@wordinator/contracts/learning";

// The lesson share (docs/courses.md#progress): half reading, half practices, computed by `lessonShare` in the contracts. These
// helpers read its inputs; `completeIfWhole` in progress.ts completes a lesson once its share is whole. Callers authorize first.

// Whether a saved count is done: it reaches its practice block's current number of questions in the published document, found
// by the block's ID (an `id` key's path is its block).
const PRACTICE_DONE = (doc: string, progress: string) => `EXISTS (SELECT 1 FROM json_tree(${doc}) t WHERE t.key = 'id' AND t.atom = ${progress}.practice_id
  AND json_extract(${doc}, t.path || '.type') = 'practice'
  AND ${progress}.answered >= json_array_length(json_extract(${doc}, t.path || '.props.data'), '$.items'))`;

/**
 * The share's inputs as columns, for a published lesson aliased `l` and the SQL expression `user` (a parameter or a column).
 * Practices count over the published document, so editing a practice can move someone back from done.
 */
export const lessonShareColumns = (user: string) => {
  const position = (column: string) => `(SELECT sp.${column} FROM course_lesson_positions sp WHERE sp.lesson_id = l.id AND sp.user_id = ${user})`;
  return `EXISTS (SELECT 1 FROM course_lesson_completions sc WHERE sc.lesson_id = l.id AND sc.user_id = ${user}) AS shareCompleted,
    ${position("reading_reached")} AS shareReadingReached, ${position("reading_total")} AS shareReadingTotal,
    ${position("passed_steps")} AS sharePassedSteps, ${position("total_steps")} AS shareTotalSteps,
    (SELECT COUNT(*) FROM json_tree(l.published_doc) WHERE json_tree.key = 'type' AND json_tree.atom = 'practice') AS sharePracticesTotal,
    (SELECT COALESCE(SUM(${PRACTICE_DONE("l.published_doc", "spp")}), 0) FROM course_practice_progress spp
      WHERE spp.lesson_id = l.id AND spp.user_id = ${user}) AS sharePracticesDone,
    EXISTS (SELECT 1 FROM course_practice_progress spp WHERE spp.lesson_id = l.id AND spp.user_id = ${user} AND spp.answered > 0) AS sharePracticed`;
};
export type LessonShareInputs = {
  shareCompleted: number; shareReadingReached: number | null; shareReadingTotal: number | null; sharePassedSteps: number | null;
  shareTotalSteps: number | null; sharePracticesTotal: number; sharePracticesDone: number; sharePracticed: number;
};

/** The share of a row of `lessonShareColumns`. A position saved before reading steps were counted uses its passed share. */
export function shareOfRow(row: LessonShareInputs): number {
  const readingShare = row.shareReadingTotal !== null ? (row.shareReadingTotal ? (row.shareReadingReached ?? 0) / row.shareReadingTotal : 0)
    : row.shareTotalSteps ? (row.sharePassedSteps ?? 0) / row.shareTotalSteps : 0;
  return lessonShare({
    completed: row.shareCompleted === 1, readingShare, hasReading: row.shareReadingTotal !== 0,
    practicesDone: row.sharePracticesDone, practicesTotal: row.sharePracticesTotal,
  });
}
/** Whether the lesson is under way: a saved position or an answered practice question. */
export const startedRow = (row: LessonShareInputs) => row.shareTotalSteps !== null || row.sharePracticed === 1;
