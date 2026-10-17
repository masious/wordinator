import type { CourseDashboardResponse } from "@wordinator/contracts/learning";
import { courseVisibleClause } from "../courseVisibility";
import { recallProbability } from "../wordMemory";
import { readLessonMetrics } from "./metrics";

const RECENT_LESSONS_MAX = 9;
const RECENT_WORD_WINDOW_MS = 7 * 86_400_000;
const DASHBOARD_STRONG_RECALL = 0.9;

type CourseRow = {
  id: string; slug: string; title: string; summary: string; level: string | null; coverKey: string | null;
  status: "draft" | "published"; lessonCount: number; coursePercent: number;
};
type LessonRow = {
  id: string; slug: string; title: string; position: number; imageKey: string | null; courseId: string; activityAt: number;
  passedSteps: number | null; totalSteps: number | null; completed: number;
};
type MemoryRow = { termKey: string; stability: number; lastReviewedAt: number; known: number };
const rowsOf = <T,>(result: D1Result | undefined) => (result?.results ?? []) as T[];

const mediaUrl = (base: string, key: string | null) => key
  ? `${base.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`
  : null;

function progress(course: CourseRow) {
  return Math.max(0, Math.min(100, Math.round(course.coursePercent)));
}

function courseView(course: CourseRow, base: string) {
  return {
    id: course.id, slug: course.slug, title: course.title, summary: course.summary, level: course.level,
    coverUrl: mediaUrl(base, course.coverKey), lessonCount: course.lessonCount, coursePercent: progress(course),
  };
}

function lessonView(lesson: LessonRow, total: number, base: string) {
  const storylinePercent = lesson.completed ? 100 : lesson.totalSteps
    ? Math.floor(100 * (lesson.passedSteps ?? 0) / lesson.totalSteps)
    : 0;
  return {
    id: lesson.id, slug: lesson.slug, title: lesson.title, number: lesson.position + 1, total,
    imageUrl: mediaUrl(base, lesson.imageKey), storylinePercent,
  };
}

async function dashboardMetrics(db: D1Database, lessonId: string, userId: string, now: number) {
  const terms = "SELECT DISTINCT term_key FROM course_lesson_words WHERE lesson_id = ?2 AND term_key IS NOT NULL";
  const [reviews, memory] = await db.batch([
    db.prepare(`SELECT MAX(created_at) AS lastReviewedAt,
      COUNT(DISTINCT CASE WHEN created_at >= ?3 THEN term_key END) AS recent
      FROM word_reviews WHERE user_id = ?1 AND term_key IN (${terms})`).bind(userId, lessonId, now - RECENT_WORD_WINDOW_MS),
    db.prepare(`SELECT term_key AS termKey, stability, last_reviewed_at AS lastReviewedAt, known_override AS known
      FROM word_memory WHERE user_id = ?1 AND term_key IN (${terms})`).bind(userId, lessonId),
  ]);
  const lesson = await readLessonMetrics(db, lessonId, userId, now);
  const byTerm = new Map<string, MemoryRow[]>();
  for (const row of rowsOf<MemoryRow>(memory)) byTerm.set(row.termKey, [...byTerm.get(row.termKey) ?? [], row]);
  const strong = [...byTerm.values()].filter((rows) => rows.some((row) => row.known === 1)
    || rows.every((row) => recallProbability(row, now) >= DASHBOARD_STRONG_RECALL)).length;
  const review = rowsOf<{ lastReviewedAt: number | null; recent: number }>(reviews)[0];
  return {
    wordRecency: { lastReviewedAt: review?.lastReviewedAt ?? null, recent: review?.recent ?? 0, total: lesson.words.total },
    memory: { strong, fading: byTerm.size - strong, new: lesson.words.total - byTerm.size, total: lesson.words.total },
    pronunciation: lesson.pronunciation,
  };
}

/** The viewer-only learning dashboard. Visibility is evaluated in SQL before any private activity is joined. */
export async function readCourseDashboard(
  db: D1Database, groupId: string, userId: string, creatorUserId: string, mediaBase: string, now = Date.now(),
): Promise<CourseDashboardResponse> {
  const visible = courseVisibleClause(userId, creatorUserId);
  const lessonCount = "(SELECT COUNT(*) FROM course_lessons l WHERE l.course_id = c.id AND l.published_doc IS NOT NULL)";
  const coursePercent = `CASE WHEN ${lessonCount} = 0 THEN 0 ELSE 100.0 * (
    (SELECT COUNT(*) FROM course_lesson_completions x JOIN course_lessons l ON l.id = x.lesson_id AND l.published_doc IS NOT NULL
      WHERE x.course_id = c.id AND x.user_id = ?)
    + (SELECT COALESCE(SUM(CAST(p.passed_steps AS REAL) / p.total_steps), 0) FROM course_lesson_positions p
      JOIN course_lessons l ON l.id = p.lesson_id AND l.published_doc IS NOT NULL
      WHERE p.course_id = c.id AND p.user_id = ? AND NOT EXISTS (
        SELECT 1 FROM course_lesson_completions x WHERE x.lesson_id = p.lesson_id AND x.user_id = p.user_id))) / ${lessonCount} END`;
  const courses = await db.prepare(`SELECT c.id, c.slug, c.title, c.summary, c.level, c.cover_key AS coverKey, c.status,
      ${lessonCount} AS lessonCount, ${coursePercent} AS coursePercent
    FROM courses c WHERE c.group_id = ? AND c.status <> 'archived' AND ${visible.sql}
    ORDER BY c.created_at, c.id`).bind(userId, userId, groupId, ...visible.values).all<CourseRow>();
  const byId = new Map(courses.results.map((course) => [course.id, course]));
  if (!courses.results.length) return { resume: null, recentLessons: [], notStarted: [] };

  const image = `(SELECT json_extract(l.published_doc, t.path || '.props.url') FROM json_tree(l.published_doc) t
    WHERE t.key = 'type' AND t.atom = 'image' AND json_extract(l.published_doc, t.path || '.props.url') != '' ORDER BY t.id LIMIT 1)`;
  const recent = await db.prepare(`SELECT l.id, l.slug, l.title, l.position, ${image} AS imageKey, l.course_id AS courseId,
      MAX(activity.at) AS activityAt, p.passed_steps AS passedSteps, p.total_steps AS totalSteps,
      EXISTS (SELECT 1 FROM course_lesson_completions x WHERE x.lesson_id = l.id AND x.user_id = ?) AS completed
    FROM (SELECT lesson_id, updated_at AS at FROM course_lesson_positions WHERE user_id = ?
      UNION ALL SELECT lesson_id, completed_at FROM course_lesson_completions WHERE user_id = ?) activity
    JOIN course_lessons l ON l.id = activity.lesson_id AND l.published_doc IS NOT NULL
    LEFT JOIN course_lesson_positions p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.group_id = ? AND l.course_id IN (SELECT value FROM json_each(?))
    GROUP BY l.id ORDER BY activityAt DESC, l.id LIMIT ${RECENT_LESSONS_MAX}`)
    .bind(userId, userId, userId, userId, groupId, JSON.stringify([...byId.keys()])).all<LessonRow>();

  const touchedCourseId = recent.results[0]?.courseId;
  const resumeCourse = byId.get(touchedCourseId ?? "") ?? courses.results.find((course) => course.lessonCount > 0) ?? null;
  let resume: CourseDashboardResponse["resume"] = null;
  if (resumeCourse) {
    const target = await db.prepare(`SELECT l.id, l.slug, l.title, l.position, ${image} AS imageKey, l.course_id AS courseId,
        COALESCE(p.updated_at, 0) AS activityAt, p.passed_steps AS passedSteps, p.total_steps AS totalSteps,
        EXISTS (SELECT 1 FROM course_lesson_completions x WHERE x.lesson_id = l.id AND x.user_id = ?) AS completed
      FROM course_lessons l LEFT JOIN course_lesson_positions p ON p.lesson_id = l.id AND p.user_id = ?
      WHERE l.course_id = ? AND l.published_doc IS NOT NULL
      ORDER BY (p.lesson_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM course_lesson_completions x WHERE x.lesson_id = l.id AND x.user_id = ?)) DESC,
        CASE WHEN p.lesson_id IS NOT NULL THEN p.updated_at ELSE 0 END DESC,
        (NOT EXISTS (SELECT 1 FROM course_lesson_completions x WHERE x.lesson_id = l.id AND x.user_id = ?)) DESC,
        l.position, l.created_at, l.id LIMIT 1`).bind(userId, userId, resumeCourse.id, userId, userId).first<LessonRow>();
    if (target) resume = { course: courseView(resumeCourse, mediaBase), lesson: lessonView(target, resumeCourse.lessonCount, mediaBase) };
  }

  const recentLessons = await Promise.all(recent.results.map(async (lesson) => {
    const course = byId.get(lesson.courseId)!;
    return {
      course: { id: course.id, slug: course.slug, title: course.title, coursePercent: progress(course) },
      lesson: lessonView(lesson, course.lessonCount, mediaBase), activityAt: lesson.activityAt,
      metrics: await dashboardMetrics(db, lesson.id, userId, now),
    };
  }));
  const started = await db.prepare(`SELECT DISTINCT course_id AS courseId FROM (
      SELECT course_id FROM course_lesson_positions WHERE user_id = ?
      UNION SELECT course_id FROM course_lesson_completions WHERE user_id = ?
      UNION SELECT course_id FROM word_reviews WHERE user_id = ? AND course_id IS NOT NULL)`)
    .bind(userId, userId, userId).all<{ courseId: string }>();
  const startedIds = new Set(started.results.map((row) => row.courseId));
  const notStarted = courses.results.filter((course) => course.status === "published" && !startedIds.has(course.id) && course.lessonCount > 0)
    .map((course) => ({ id: course.id, slug: course.slug, title: course.title, level: course.level,
      coverUrl: mediaUrl(mediaBase, course.coverKey), lessonCount: course.lessonCount }));
  return { resume, recentLessons, notStarted };
}
