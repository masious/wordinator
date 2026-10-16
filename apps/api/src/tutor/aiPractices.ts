import { parseStoredLessonDocument, walkLessonBlocks } from "@wordinator/contracts/lesson-document";
import { aiPracticeContentSchema, componentHints, tutorComponentView, type AiPracticeContent, type LessonAiPractice } from "@wordinator/contracts/tutor";
import { hintViews, readableWords } from "./library";

// AI practices (C14h, docs/courses.md#ai-practices): practices the tutor saved with the learner's confirmation, tagged to one or
// more lessons after a block of each lesson's published document. The tutor's `save_ai_practice` tool validates its arguments
// with the contracts, resolves every tagged lesson as readable, published, and not archived, and asks the learner to confirm;
// only a confirmed card reaches `saveAiPractice`. The lesson routes in `app.ts` authorize the course and lesson first; the
// helpers here trust the lesson they are given.

export type AiPracticeLessonTag = { lessonId: string; courseId: string; afterBlockId: string };
export type SaveAiPracticeInput = { userId: string; conversationId: string; practice: AiPracticeContent; lessons: AiPracticeLessonTag[]; now?: number };
export type SaveAiPracticeResult = { ok: true; practiceId: string } | { ok: false; error: "AI_PRACTICES_UNAVAILABLE" | "ANCHOR_NOT_FOUND" };

/** Every block ID of a published document, at any depth, in reading order. An unreadable document has none. */
export function publishedBlockIds(publishedDoc: string | null): string[] {
  if (!publishedDoc) return [];
  try {
    const document = parseStoredLessonDocument(JSON.parse(publishedDoc));
    return document ? [...walkLessonBlocks(document.blocks)].map(({ block }) => block.id) : [];
  } catch {
    return [];
  }
}

/**
 * Stores a confirmed practice and its tags in one batch. Every anchor must be a block of its lesson's current published
 * document (a block only in the draft, or a lesson that is no longer published, is `ANCHOR_NOT_FOUND`). A lesson named twice is
 * tagged once, at its first anchor. Each tag goes after the practices already sharing its anchor.
 */
export async function saveAiPractice(db: D1Database, input: SaveAiPracticeInput): Promise<SaveAiPracticeResult> {
  const tags = input.lessons.filter((tag, index) => input.lessons.findIndex((other) => other.lessonId === tag.lessonId) === index);
  const rows = await db.prepare("SELECT id, course_id AS courseId, published_doc AS publishedDoc FROM course_lessons WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(tags.map((tag) => tag.lessonId))).all<{ id: string; courseId: string; publishedDoc: string | null }>();
  for (const tag of tags) {
    const row = rows.results.find((lesson) => lesson.id === tag.lessonId && lesson.courseId === tag.courseId);
    if (!row || !publishedBlockIds(row.publishedDoc).includes(tag.afterBlockId)) return { ok: false, error: "ANCHOR_NOT_FOUND" };
  }
  const practiceId = crypto.randomUUID();
  const now = input.now ?? Date.now();
  await db.batch([
    db.prepare("INSERT INTO ai_practices (id, kind, payload, created_by_user_id, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(practiceId, input.practice.kind, JSON.stringify(input.practice.payload), input.userId, input.conversationId, now),
    ...tags.map((tag) => db.prepare(
      `INSERT INTO ai_practice_lessons (practice_id, lesson_id, course_id, after_block_id, position)
       SELECT ?1, ?2, ?3, ?4, COALESCE(MAX(position) + 1, 0) FROM ai_practice_lessons WHERE lesson_id = ?2 AND after_block_id = ?4`,
    ).bind(practiceId, tag.lessonId, tag.courseId, tag.afterBlockId)),
  ]);
  return { ok: true, practiceId };
}

export type ListedAiPractice = { practiceId: string; afterBlockId: string; position: number; practice: AiPracticeContent; createdAt: number };

type PracticeRow = { practiceId: string; kind: string; payload: string; afterBlockId: string; position: number; createdAt: number };
const PRACTICE_SELECT = `SELECT p.id AS practiceId, p.kind, p.payload, t.after_block_id AS afterBlockId, t.position, p.created_at AS createdAt
  FROM ai_practice_lessons t JOIN ai_practices p ON p.id = t.practice_id`;

// A stored row read back through the contracts; a row they no longer accept is skipped rather than failing the lesson.
function toListed(row: PracticeRow): ListedAiPractice | null {
  try {
    const parsed = aiPracticeContentSchema.safeParse({ kind: row.kind, payload: JSON.parse(row.payload) });
    return parsed.success ? { practiceId: row.practiceId, afterBlockId: row.afterBlockId, position: row.position, practice: parsed.data, createdAt: row.createdAt } : null;
  } catch {
    return null;
  }
}

/** The AI practices tagged to a lesson the caller has already resolved as readable, by anchor and position (the tutor's `list_ai_practices`). */
export async function listAiPractices(db: D1Database, lessonId: string): Promise<ListedAiPractice[]> {
  const rows = await db.prepare(`${PRACTICE_SELECT} WHERE t.lesson_id = ? ORDER BY t.after_block_id, t.position, p.created_at, p.id`).bind(lessonId).all<PracticeRow>();
  return rows.results.map(toListed).filter((practice): practice is ListedAiPractice => practice !== null);
}

/** One practice tagged to the lesson, with its reference answer, or null when it is not tagged there. */
export async function findLessonAiPractice(db: D1Database, lessonId: string, practiceId: string): Promise<ListedAiPractice | null> {
  const row = await db.prepare(`${PRACTICE_SELECT} WHERE t.lesson_id = ? AND t.practice_id = ?`).bind(lessonId, practiceId).first<PracticeRow>();
  return row ? toListed(row) : null;
}

// A small seeded generator, so a word order practice offers the same shuffled chunks on every read.
function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The lesson page's AI practices in reading order: after their anchor block of the published document, by position among
 * practices sharing it; a practice whose anchor is no longer in the document comes last, with `afterBlockId: null`. Only views
 * are returned, never references. An unpublished lesson shows none.
 */
export async function readLessonAiPractices(db: D1Database, lesson: { id: string; publishedDoc: string | null }, userId: string): Promise<LessonAiPractice[]> {
  if (!lesson.publishedDoc) return [];
  const order = new Map(publishedBlockIds(lesson.publishedDoc).map((id, index) => [id, index]));
  const listed = await listAiPractices(db, lesson.id);
  // Hints show the words' current index entries, as far as the reader can read them.
  const words = await readableWords(db, userId, listed.flatMap((practice) => componentHints(practice.practice)));
  const rank = (practice: ListedAiPractice) => order.get(practice.afterBlockId) ?? Number.MAX_SAFE_INTEGER;
  return listed
    .sort((a, b) => rank(a) - rank(b) || a.position - b.position || a.createdAt - b.createdAt || a.practiceId.localeCompare(b.practiceId))
    .map((practice) => ({
      id: practice.practiceId, kind: practice.practice.kind, afterBlockId: order.has(practice.afterBlockId) ? practice.afterBlockId : null,
      view: tutorComponentView(practice.practice, { hints: hintViews(componentHints(practice.practice), words), random: seededRandom(practice.practiceId) }), createdAt: practice.createdAt,
    }));
}

/** The number of AI practices tagged to each of the given lessons; lessons without any are left out. */
export async function aiPracticeCounts(db: D1Database, lessonIds: readonly string[]): Promise<Map<string, number>> {
  if (!lessonIds.length) return new Map();
  const rows = await db.prepare(
    "SELECT lesson_id AS lessonId, COUNT(*) AS n FROM ai_practice_lessons WHERE lesson_id IN (SELECT value FROM json_each(?)) GROUP BY lesson_id",
  ).bind(JSON.stringify([...new Set(lessonIds)])).all<{ lessonId: string; n: number }>();
  return new Map(rows.results.map((row) => [row.lessonId, row.n]));
}

/**
 * Removes a practice's tag from a lesson and deletes the practice when no tags remain, in one batch. False when the practice
 * was not tagged to the lesson.
 */
export async function removeAiPracticeTag(db: D1Database, lessonId: string, practiceId: string): Promise<boolean> {
  const [removed] = await db.batch([
    db.prepare("DELETE FROM ai_practice_lessons WHERE practice_id = ? AND lesson_id = ?").bind(practiceId, lessonId),
    db.prepare("DELETE FROM ai_practices WHERE id = ? AND NOT EXISTS (SELECT 1 FROM ai_practice_lessons WHERE practice_id = ?)").bind(practiceId, practiceId),
  ]);
  return (removed?.meta.changes ?? 0) > 0;
}

/**
 * Statements for the lesson deletion batch: delete the practices tagged only to this lesson (their tags cascade), then the
 * lesson's remaining tags. They run before the lesson row is deleted.
 */
export function lessonAiPracticeDeletion(db: D1Database, lessonId: string): D1PreparedStatement[] {
  return [
    db.prepare(
      `DELETE FROM ai_practices WHERE id IN (SELECT practice_id FROM ai_practice_lessons WHERE lesson_id = ?1)
         AND NOT EXISTS (SELECT 1 FROM ai_practice_lessons o WHERE o.practice_id = ai_practices.id AND o.lesson_id <> ?1)`,
    ).bind(lessonId),
    db.prepare("DELETE FROM ai_practice_lessons WHERE lesson_id = ?").bind(lessonId),
  ];
}
