import {
  inlineText, parseStoredLessonDocument, readDialogueTurns, readPracticeBlock, readVocabularyBlock, walkLessonBlocks, wordSearchKey, type LessonDocument,
} from "@wordinator/contracts/lesson-document";
import type { TutorHintRef, TutorHintView, TutorWordRef } from "@wordinator/contracts/tutor";
import { courseVisibleInLibraryClause, READABLE_LIBRARY_JOIN } from "../courseVisibility";

// What the tutor can read (docs/ai-tutor.md#tools): published lessons of courses the account can see in a library it is an
// active member of. Every query here binds the signed-in account's ID; nothing takes another user's ID, and a lesson that is
// unpublished, in an invisible course, or in another library is indistinguishable from a missing one.

export type Language = "nl" | "de";
export type ReadableCourse = { id: string; slug: string; title: string; status: "draft" | "published" | "archived"; groupId: string; language: Language };
export type ReadableLesson = { id: string; slug: string; title: string; position: number; publishedDoc: string; course: ReadableCourse };

const COURSE_COLUMNS = "c.id AS courseId, c.slug AS courseSlug, c.title AS courseTitle, c.status AS courseStatus, c.group_id AS groupId, g.language";
type CourseColumns = { courseId: string; courseSlug: string; courseTitle: string; courseStatus: ReadableCourse["status"]; groupId: string; language: Language };
const toCourse = (row: CourseColumns): ReadableCourse => ({ id: row.courseId, slug: row.courseSlug, title: row.courseTitle, status: row.courseStatus, groupId: row.groupId, language: row.language });

// The FROM clause and its bound values for the readable published lessons of `userId` (aliases `l`, `c`, `g`).
export function readableLessonsFrom(userId: string) {
  const visible = courseVisibleInLibraryClause(userId);
  return {
    sql: `FROM course_lessons l JOIN courses c ON c.id = l.course_id AND c.group_id = l.group_id ${READABLE_LIBRARY_JOIN}
      WHERE l.published_doc IS NOT NULL AND ${visible.sql}`,
    values: [userId, ...visible.values],
  };
}

export type AccountLibrary = { groupId: string; language: Language; creatorUserId: string };

/** The account's library: its oldest active library record (there is one per installation; see storage compatibility). */
export async function accountLibrary(db: D1Database, userId: string): Promise<AccountLibrary | null> {
  return db.prepare(
    `SELECT g.id AS groupId, g.language, g.creator_user_id AS creatorUserId FROM memberships m JOIN groups g ON g.id = m.group_id AND g.deleted_at IS NULL
     WHERE m.user_id = ? AND m.state = 'active' ORDER BY g.created_at, g.id LIMIT 1`,
  ).bind(userId).first<AccountLibrary>();
}

export async function readableLesson(db: D1Database, userId: string, lessonId: string): Promise<ReadableLesson | null> {
  const from = readableLessonsFrom(userId);
  const row = await db.prepare(
    `SELECT l.id, l.slug, l.title, l.position, l.published_doc AS publishedDoc, ${COURSE_COLUMNS} ${from.sql} AND l.id = ?`,
  ).bind(...from.values, lessonId).first<Omit<ReadableLesson, "course"> & CourseColumns>();
  return row ? { id: row.id, slug: row.slug, title: row.title, position: row.position, publishedDoc: row.publishedDoc, course: toCourse(row) } : null;
}

export async function readableCourses(db: D1Database, userId: string): Promise<Array<ReadableCourse & { publishedLessons: number; completedLessons: number }>> {
  const visible = courseVisibleInLibraryClause(userId);
  const rows = await db.prepare(
    `SELECT ${COURSE_COLUMNS},
       (SELECT COUNT(*) FROM course_lessons l WHERE l.course_id = c.id AND l.published_doc IS NOT NULL) AS publishedLessons,
       (SELECT COUNT(*) FROM course_lesson_completions clc JOIN course_lessons l ON l.id = clc.lesson_id AND l.published_doc IS NOT NULL
         WHERE clc.course_id = c.id AND clc.user_id = ?) AS completedLessons
     FROM courses c ${READABLE_LIBRARY_JOIN} WHERE ${visible.sql} ORDER BY c.created_at, c.id LIMIT 50`,
  ).bind(userId, userId, ...visible.values).all<CourseColumns & { publishedLessons: number; completedLessons: number }>();
  return rows.results.map((row) => ({ ...toCourse(row), publishedLessons: row.publishedLessons, completedLessons: row.completedLessons }));
}

export async function readableCourse(db: D1Database, userId: string, courseId: string): Promise<ReadableCourse | null> {
  const visible = courseVisibleInLibraryClause(userId);
  const row = await db.prepare(`SELECT ${COURSE_COLUMNS} FROM courses c ${READABLE_LIBRARY_JOIN} WHERE ${visible.sql} AND c.id = ?`)
    .bind(userId, ...visible.values, courseId).first<CourseColumns>();
  return row ? toCourse(row) : null;
}

export type ListedLesson = {
  lessonId: string; number: number; title: string; state: "completed" | "in_progress" | "not_started";
  courseId: string; courseNumber: number; courseTitle: string; archived: boolean;
};
const LESSON_LIST_MAX = 100;

/**
 * The readable published lessons in library order (courses oldest first, lessons by position), numbered within their course and
 * courses numbered in the library, so the tutor can resolve "lesson 3 of the second course" or a title to a lesson ID. A query
 * keeps the lessons whose title or course title contains it, ignoring case.
 */
export async function readableLessonList(db: D1Database, userId: string, filter: { courseId: string | null; query: string | null }): Promise<ListedLesson[]> {
  const from = readableLessonsFrom(userId);
  const like = filter.query === null ? null : `%${filter.query.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const rows = await db.prepare(
    `SELECT * FROM (
       SELECT l.id AS lessonId, l.title, c.id AS courseId, c.title AS courseTitle, c.status = 'archived' AS archived,
         ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY l.position, l.created_at, l.id) AS number,
         DENSE_RANK() OVER (ORDER BY c.created_at, c.id) AS courseNumber,
         EXISTS (SELECT 1 FROM course_lesson_completions clc WHERE clc.lesson_id = l.id AND clc.user_id = ?) AS completed,
         EXISTS (SELECT 1 FROM course_lesson_positions p WHERE p.lesson_id = l.id AND p.user_id = ?) AS started
       ${from.sql}) listed
     WHERE (? IS NULL OR listed.courseId = ?) AND (? IS NULL OR lower(listed.title) LIKE ? ESCAPE '\\' OR lower(listed.courseTitle) LIKE ? ESCAPE '\\')
     ORDER BY listed.courseNumber, listed.number LIMIT ${LESSON_LIST_MAX}`,
  ).bind(userId, userId, ...from.values, filter.courseId, filter.courseId, like, like, like)
    .all<Omit<ListedLesson, "state" | "archived"> & { archived: number; completed: number; started: number }>();
  return rows.results.map(({ completed, started, archived, ...row }) => ({
    ...row, archived: archived === 1, state: completed === 1 ? "completed" : started === 1 ? "in_progress" : "not_started",
  }));
}

/**
 * The lesson to study next: in the readable course the account was most recently active in (a saved position, a completion, or
 * a practice attempt), the most recently moved unfinished lesson, otherwise the first published lesson not completed. Without
 * any activity, the first lesson of the first readable course. Null when everything is completed or nothing is readable.
 */
export async function nextLesson(db: D1Database, userId: string): Promise<ReadableLesson | null> {
  const from = readableLessonsFrom(userId);
  const recent = await db.prepare(
    `SELECT readable.courseId, MAX(activity.at) AS at FROM (
        SELECT lesson_id, updated_at AS at FROM course_lesson_positions WHERE user_id = ?
        UNION ALL SELECT lesson_id, completed_at FROM course_lesson_completions WHERE user_id = ?
        UNION ALL SELECT lesson_id, created_at FROM practice_attempts WHERE user_id = ? AND lesson_id IS NOT NULL
      ) activity
     JOIN (SELECT l.id AS lessonId, c.id AS courseId ${from.sql} AND c.status <> 'archived') readable ON readable.lessonId = activity.lesson_id
     GROUP BY readable.courseId ORDER BY at DESC LIMIT 1`,
  ).bind(userId, userId, userId, ...from.values).first<{ courseId: string }>();
  const course = recent?.courseId ?? (await db.prepare(
    `SELECT c.id AS courseId ${from.sql} AND c.status <> 'archived' ORDER BY c.created_at, c.id LIMIT 1`,
  ).bind(...from.values).first<{ courseId: string }>())?.courseId;
  if (!course) return null;
  const moved = await db.prepare(
    `SELECT l.id ${from.sql} AND l.course_id = ? AND EXISTS (SELECT 1 FROM course_lesson_positions p WHERE p.lesson_id = l.id AND p.user_id = ?)
       AND NOT EXISTS (SELECT 1 FROM course_lesson_completions clc WHERE clc.lesson_id = l.id AND clc.user_id = ?)
     ORDER BY (SELECT p.updated_at FROM course_lesson_positions p WHERE p.lesson_id = l.id AND p.user_id = ?) DESC LIMIT 1`,
  ).bind(...from.values, course, userId, userId, userId).first<{ id: string }>();
  const first = moved ?? await db.prepare(
    `SELECT l.id ${from.sql} AND l.course_id = ? AND NOT EXISTS (SELECT 1 FROM course_lesson_completions clc WHERE clc.lesson_id = l.id AND clc.user_id = ?)
     ORDER BY l.position, l.created_at, l.id LIMIT 1`,
  ).bind(...from.values, course, userId).first<{ id: string }>();
  return first ? readableLesson(db, userId, first.id) : null;
}

export type IndexedTutorWord = TutorWordRef & {
  courseId: string; termKey: string; term: string; meaning: string; forms: string | null; example: string | null; lessonTitle: string; archived: boolean;
};
export const wordKey = (ref: TutorWordRef) => `${ref.lessonId}:${ref.wordId}`;

/** The given lesson words that are in the published index of a lesson the account can read, keyed by `wordKey`. */
export async function readableWords(db: D1Database, userId: string, refs: readonly TutorWordRef[]): Promise<Map<string, IndexedTutorWord>> {
  const found = new Map<string, IndexedTutorWord>();
  if (!refs.length) return found;
  const from = readableLessonsFrom(userId);
  const rows = await db.prepare(
    `SELECT w.lesson_id AS lessonId, w.word_id AS wordId, w.course_id AS courseId, w.term_key AS termKey, w.term, w.meaning, w.forms, w.example,
       rl.title AS lessonTitle, rl.status = 'archived' AS archived
     FROM json_each(?) ref
     JOIN course_lesson_words w ON w.lesson_id = json_extract(ref.value, '$[0]') AND w.word_id = json_extract(ref.value, '$[1]')
     JOIN (SELECT l.id, l.title, c.status ${from.sql}) rl ON rl.id = w.lesson_id`,
  ).bind(JSON.stringify(refs.map((ref) => [ref.lessonId, ref.wordId])), ...from.values)
    .all<Omit<IndexedTutorWord, "termKey" | "archived"> & { termKey: string | null; archived: number }>();
  for (const row of rows.results) found.set(wordKey(row), { ...row, termKey: row.termKey ?? wordSearchKey(row.term), archived: row.archived === 1 });
  return found;
}

// A component's hints with their words from the published index, in the model's order; an unreadable word is left out.
export function hintViews(refs: readonly TutorHintRef[], words: ReadonlyMap<string, IndexedTutorWord>): TutorHintView[] {
  return refs.flatMap((ref) => {
    const word = words.get(wordKey(ref));
    return word ? [{ lessonId: ref.lessonId, wordId: ref.wordId, cue: ref.cue, term: word.term, meaning: word.meaning, forms: word.forms }] : [];
  });
}

// ---- Lesson content for the model ----

const LESSON_CONTENT_MAX = 16_000;

/**
 * A compact reading of a published lesson for the model: its blocks in reading order with their IDs (anchors for AI practices),
 * new words with their IDs (for components and reviews), examples, dialogues, and practices with their authors' versions. Item
 * notes are editor-only and left out. Long lessons are cut, which the result says.
 */
export function lessonForModel(lesson: ReadableLesson): Record<string, unknown> {
  const document: LessonDocument | null = parseStoredLessonDocument(JSON.parse(lesson.publishedDoc));
  const blocks: Array<Record<string, unknown>> = [];
  let size = 0;
  let truncated = false;
  for (const { block } of document ? walkLessonBlocks(document.blocks) : []) {
    let entry: Record<string, unknown> | null = null;
    switch (block.type) {
      case "heading": case "paragraph": case "bulletListItem": case "numberedListItem": case "callout": {
        const text = inlineText(block.content).trim();
        if (text) entry = { id: block.id, type: block.type, text };
        break;
      }
      case "example": entry = { id: block.id, type: "example", sentence: inlineText(block.content), translation: block.props.translation || null, note: block.props.note || null }; break;
      case "dialogue": entry = { id: block.id, type: "dialogue", turns: safely(() => readDialogueTurns(block)) ?? [] }; break;
      case "vocabulary": entry = {
        id: block.id, type: "vocabulary",
        words: (safely(() => readVocabularyBlock(block).words) ?? []).map((word) => ({
          wordId: word.id, term: word.term, meaning: word.meaning, forms: word.forms || null, example: word.example || null,
        })),
      }; break;
      case "practice": {
        const practice = safely(() => readPracticeBlock(block));
        if (practice) entry = {
          id: block.id, type: "practice", instruction: practice.instruction, passage: practice.passage?.content ?? null,
          items: practice.items.map((item) => ({ prompt: item.prompt, authorsVersion: item.authorsVersion.filter(Boolean) })),
        };
        break;
      }
      default: break;
    }
    if (!entry) continue;
    size += JSON.stringify(entry).length;
    if (size > LESSON_CONTENT_MAX) { truncated = true; break; }
    blocks.push(entry);
  }
  return {
    lessonId: lesson.id, title: lesson.title, course: { courseId: lesson.course.id, title: lesson.course.title, archived: lesson.course.status === "archived" },
    blocks, ...(truncated ? { truncated: true } : {}),
  };
}

function safely<T>(read: () => T): T | null {
  try { return read(); } catch { return null; }
}
