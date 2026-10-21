import { resolveLessonActivitySources, verifyLessonActivitySource, type ActivityCompletion, type ActivityDescriptor, type ActivityMetric, type ActivityType } from "@wordinator/contracts/lesson-activities";
import { lessonShareColumns, shareOfRow, type LessonShareInputs } from "../learning/lessonShare";
import type { ActivityLesson } from "./routes";

// The four progress metrics an activity can move (docs/lesson-activities.md), each 0-1 for one viewer and one published lesson.
// Callers authorize first: the viewer, course and lesson are trusted.

// The viewer's own completed runs in this lesson, counted only when the activity's source fingerprint is the section's current one:
// a republished section is not done anymore. Ordered, so repeated reads of the same state are identical.
export async function completedActivities(db: D1Database, lesson: Pick<ActivityLesson, "lessonId" | "courseId">, uid: string, descriptors: readonly ActivityDescriptor[]): Promise<ActivityCompletion[]> {
  // The score counts each item's first answer (a restart keeps earlier answers, so later tries never raise it).
  const rows = await db.prepare(`SELECT a.source_id AS sourceId, a.activity_type AS type, a.source_fingerprint AS fingerprint, r.completed_at AS completedAt,
      (SELECT COUNT(DISTINCT x.item_id) FROM lesson_activity_answers x WHERE x.run_id = r.id) AS total,
      (SELECT COUNT(*) FROM lesson_activity_answers x WHERE x.run_id = r.id AND x.correct = 1
        AND x.rowid = (SELECT MIN(y.rowid) FROM lesson_activity_answers y WHERE y.run_id = r.id AND y.item_id = x.item_id)) AS correct
    FROM lesson_activity_runs r JOIN lesson_activities a ON a.id = r.activity_id
    WHERE r.user_id = ? AND r.status = 'completed' AND a.lesson_id = ? AND a.course_id = ?
    ORDER BY a.source_id, a.activity_type`).bind(uid, lesson.lessonId, lesson.courseId)
    .all<{ sourceId: string; type: string; fingerprint: string; completedAt: number | null; total: number; correct: number }>();
  return rows.results.flatMap((row) => {
    const type = row.type as ActivityType;
    return verifyLessonActivitySource(descriptors, row.sourceId, type, row.fingerprint) ? [{ sourceId: row.sourceId, type, completedAt: row.completedAt, ...(row.total > 0 ? { correct: row.correct, total: row.total } : { correct: null, total: null }) }] : [];
  });
}

const ratio = (done: number, total: number) => total > 0 ? Math.min(1, done / total) : 0;

export async function readActivityMetrics(db: D1Database, viewer: string, course: { id: string }, lesson: ActivityLesson): Promise<Record<ActivityMetric, number>> {
  const row = await db.prepare(`SELECT ${lessonShareColumns("?1")} FROM course_lessons l WHERE l.id = ?2 AND l.course_id = ?3`)
    .bind(viewer, lesson.lessonId, course.id).first<LessonShareInputs>();
  const descriptors = await resolveLessonActivitySources({ document: lesson.document, title: lesson.title, includeLessonEnd: true });
  const completed = await completedActivities(db, lesson, viewer, descriptors);
  // The reading half of the lesson share: whole once the lesson is completed, else the reading steps reached (or, for a position
  // saved before reading steps were counted, the passed share), as shareOfRow reads them.
  const reading = !row ? 0 : row.shareCompleted === 1 ? 1
    : row.shareReadingTotal !== null ? ratio(row.shareReadingReached ?? 0, row.shareReadingTotal) : ratio(row.sharePassedSteps ?? 0, row.shareTotalSteps ?? 0);
  const grammar = descriptors.filter((item) => item.activityTypes.includes("guided_grammar"));
  const suggested = descriptors.flatMap((item) => item.activityTypes.map((type) => ({ sourceId: item.sourceId, type })));
  const done = (item: { sourceId: string; type: ActivityType }) => completed.some((entry) => entry.sourceId === item.sourceId && entry.type === item.type);
  return {
    lesson_share: row ? shareOfRow(row) : 0, lesson_reading: reading,
    lesson_grammar: ratio(grammar.filter((item) => done({ sourceId: item.sourceId, type: "guided_grammar" })).length, grammar.length),
    lesson_activities: ratio(suggested.filter(done).length, suggested.length),
  };
}

export const metricsSnapshot = async (db: D1Database, viewer: string, course: { id: string }, lesson: ActivityLesson) => JSON.stringify(await readActivityMetrics(db, viewer, course, lesson));

/** A stored snapshot's values by key; a missing or malformed snapshot yields none, so the completion omits those keys. */
export function parseMetricsSnapshot(text: string | null): Partial<Record<ActivityMetric, number>> {
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "number" && value >= 0 && value <= 1));
  } catch { return {}; }
}
