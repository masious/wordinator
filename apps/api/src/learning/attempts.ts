import { answerMatches, hasAuthorsVersion, type PracticePayload } from "@wordinator/contracts";
import { wordSearchKey } from "@wordinator/contracts/lesson-document";
import {
  PRACTICE_ATTEMPT_TEXT_MAX, practiceAttemptRequestSchema, pronunciationAttemptRequestSchema,
  type PracticeAttemptKind, type PracticeAttemptSource, type PracticeAttemptVerdict, type PronunciationScores, type PronunciationSurface,
} from "@wordinator/contracts/learning";
import type { Context, Hono, MiddlewareHandler } from "hono";
import type { AppEnvironment } from "../app";
import { apiError, parseJson } from "../http";

// Practice and pronunciation attempts (C14b): docs/courses.md#practice-attempts and docs/words.md#pronunciation-assessment. Rows
// are private to their account. The insert helpers trust what they are given, so callers authorize and resolve first; the tutor
// and AI-practice phases reuse them with their own source, verdict, and conversation.

// The separator the author's version list and the web use between a fill-in item's blanks.
const BLANK_SEPARATOR = " · ";

export type NewPracticeAttempt = {
  userId: string; courseId: string; lessonId: string | null; practiceKind: PracticeAttemptKind; practiceId: string; itemIndex: number;
  prompt: string; answer: string; reference: string | null; matched: boolean | null;
  aiVerdict?: PracticeAttemptVerdict | null; aiNote?: string | null; source: PracticeAttemptSource; conversationId?: string | null; createdAt?: number;
};

const capped = (value: string) => value.slice(0, PRACTICE_ATTEMPT_TEXT_MAX);

/** The statement that appends one practice attempt; run it alone or inside a caller's batch. */
export function practiceAttemptStatement(db: D1Database, row: NewPracticeAttempt): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO practice_attempts (id, user_id, course_id, lesson_id, practice_kind, practice_id, item_index, prompt, answer, reference, matched,
       ai_verdict, ai_note, source, conversation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), row.userId, row.courseId, row.lessonId, row.practiceKind, row.practiceId, row.itemIndex,
    capped(row.prompt), capped(row.answer), row.reference === null ? null : capped(row.reference), row.matched === null ? null : row.matched ? 1 : 0,
    row.aiVerdict ?? null, row.aiNote ?? null, row.source, row.conversationId ?? null, row.createdAt ?? Date.now(),
  );
}

/** Appends one practice attempt. */
export async function insertPracticeAttempt(db: D1Database, row: NewPracticeAttempt): Promise<void> {
  await practiceAttemptStatement(db, row).run();
}

/**
 * What a lesson practice item's attempt stores besides the answer: its prompt, the author's version as the reference (blanks joined
 * by ` · `), and the match decided here with the contracts' `answerMatches`. An item with nothing to check has no reference and no
 * match result.
 */
export function lessonPracticeCheck(item: PracticePayload["items"][number], answer: string): { prompt: string; reference: string | null; matched: boolean | null } {
  if (!hasAuthorsVersion(item)) return { prompt: item.prompt, reference: null, matched: null };
  return { prompt: item.prompt, reference: (item.authorsVersion as string[]).join(BLANK_SEPARATOR), matched: answerMatches(item, answer) };
}

export type NewPronunciationAttempt = PronunciationScores & {
  userId: string; surface: PronunciationSurface; referenceText: string; termKey: string | null; lessonId: string | null; wordId: string | null;
  createdAt?: number;
};

/** Appends one pronunciation attempt. Word scores are stored as JSON text. */
export async function insertPronunciationAttempt(db: D1Database, row: NewPronunciationAttempt): Promise<void> {
  await db.prepare(
    `INSERT INTO pronunciation_attempts (id, user_id, surface, reference_text, term_key, lesson_id, word_id, overall, accuracy, fluency, completeness,
       word_scores, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), row.userId, row.surface, row.referenceText, row.termKey, row.lessonId, row.wordId,
    row.overall, row.accuracy, row.fluency, row.completeness, JSON.stringify(row.words), row.createdAt ?? Date.now(),
  ).run();
}

// The resolvers app.ts already has: a practice under the route's course and lesson (refusing archived courses when writing), and a
// lesson the viewer can read named without its course.
type Resolved<T> = Promise<{ error: Response | undefined } | T>;
export type AttemptRouteDeps = {
  requireGroupAccess: MiddlewareHandler<AppEnvironment>;
  practiceBlock: (context: Context<AppEnvironment>, write: boolean) => Resolved<{
    course: { id: string; groupId: string }; lessonId: string; block: { id: string }; published: boolean; practice: PracticePayload;
  }>;
  readableLesson: (context: Context<AppEnvironment>, lessonId: string) => Resolved<{ course: { id: string; groupId: string } }>;
};

export function registerAttemptRoutes(app: Hono<AppEnvironment>, deps: AttemptRouteDeps) {
  // One checked item of a published lesson practice. The client's match result is never read: the item comes from the published
  // document and the match is decided here. Draft previews and archived courses record nothing.
  app.post("/api/groups/:groupId/courses/:courseId/lessons/:lessonId/blocks/:blockId/attempts", deps.requireGroupAccess, async (context) => {
    const found = await deps.practiceBlock(context, true); if ("error" in found) return found.error;
    const parsed = await parseJson(context, practiceAttemptRequestSchema); if ("response" in parsed) return parsed.response;
    if (!found.published) return apiError(context, 409, "PRACTICE_NOT_PUBLISHED", "Attempts are saved only for published practices.");
    const item = found.practice.items[parsed.data.item];
    if (!item) return apiError(context, 404, "PRACTICE_ITEM_NOT_FOUND", "This question is not available.");
    await insertPracticeAttempt(context.env.DB, {
      userId: context.get("user")!.id, courseId: found.course.id, lessonId: found.lessonId, practiceKind: "lesson", practiceId: found.block.id,
      itemIndex: parsed.data.item, answer: parsed.data.answer, source: "lesson", ...lessonPracticeCheck(item, parsed.data.answer),
    });
    return context.body(null, 204);
  });

  // One Microsoft assessment. A lesson word must be in the published index of a lesson the viewer can read; its term key then
  // comes from the index rather than the client.
  app.post("/api/groups/:groupId/pronunciation-attempts", deps.requireGroupAccess, async (context) => {
    const parsed = await parseJson(context, pronunciationAttemptRequestSchema); if ("response" in parsed) return parsed.response;
    const { surface, referenceText, lessonId, wordId, overall, accuracy, fluency, completeness, words } = parsed.data;
    let termKey = parsed.data.termKey ?? null;
    if (lessonId && wordId) {
      const notFound = () => apiError(context, 404, "WORD_NOT_FOUND", "This word is not available.");
      const lesson = await deps.readableLesson(context, lessonId); if ("error" in lesson) return notFound();
      const indexed = await context.env.DB.prepare(
        `SELECT w.term, w.term_key AS termKey FROM course_lesson_words w
         JOIN course_lessons l ON l.id = w.lesson_id AND l.group_id = w.group_id AND l.course_id = w.course_id AND l.published_doc IS NOT NULL
         WHERE w.group_id = ? AND w.course_id = ? AND w.lesson_id = ? AND w.word_id = ?`,
      ).bind(lesson.course.groupId, lesson.course.id, lessonId, wordId).first<{ term: string; termKey: string | null }>();
      if (!indexed) return notFound();
      termKey = indexed.termKey ?? wordSearchKey(indexed.term);
    }
    await insertPronunciationAttempt(context.env.DB, {
      userId: context.get("user")!.id, surface, referenceText, termKey, lessonId: lessonId ?? null, wordId: wordId ?? null,
      overall, accuracy, fluency, completeness, words,
    });
    return context.body(null, 204);
  });
}
