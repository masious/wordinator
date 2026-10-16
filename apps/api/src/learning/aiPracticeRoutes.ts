import {
  aiPracticeAnswerRequestSchema, aiPracticeAnswerResponseSchema, lessonAiPracticesResponseSchema, type TutorComponent,
} from "@wordinator/contracts/tutor";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { assertDailyTurnCap, readAiSettings } from "../ai";
import type { AppEnvironment } from "../app";
import { apiError, parseJson } from "../http";
import { findLessonAiPractice, readLessonAiPractices, removeAiPracticeTag } from "../tutor/aiPractices";
import { gradeComponentAnswer, modelJudge, type VerdictJudge } from "../tutor/grading";
import { speakStoredText } from "../tutor/onDemandSpeech";
import { readTutorProfile } from "../tutor/profile";
import { LANGUAGE_NAMES } from "../tutor/prompt";
import { recordComponentAnswer } from "../tutor/recording";

// AI practices on the lesson page (C14h, docs/courses.md#ai-practices), under the group compatibility prefix. `lessonFor`
// resolves the course and lesson with the lesson read's rules (invisible courses and lessons are `404`), and for `edit` also
// requires the course owner or an active contributor (`403 COURSE_EDIT_FORBIDDEN`) and a course that is not archived
// (`409 COURSE_ARCHIVED`). Practices are read only from published lessons; their references never leave the API before an answer.

export type AiPracticeLesson = {
  course: { id: string; archived: boolean; canEdit: boolean };
  lesson: { id: string; publishedDoc: string | null };
  language: "nl" | "de";
};
type AppContext = Context<AppEnvironment>;
type AiPracticeRouteDeps = {
  requireGroupAccess: MiddlewareHandler<AppEnvironment>;
  lessonFor: (context: AppContext, mode: "read" | "edit") => Promise<{ error: Response } | AiPracticeLesson>;
};

const PRACTICES_PATH = "/api/groups/:groupId/courses/:courseId/lessons/:lessonId/ai-practices";

// An open answer that does not match its reference goes to the model judge, metered in `ai_usage` but never a turn start. Once the
// account has reached its daily turn cap the judge is skipped, like an unavailable provider: the answer is then graded by the
// reference comparison alone, stored without a verdict, and not accepted.
function lessonPageJudge(context: AppContext, userId: string, language: "nl" | "de"): VerdictJudge {
  return async (input) => {
    const db = context.env.DB;
    const settings = await readAiSettings(db);
    try {
      await assertDailyTurnCap(db, userId, settings);
    } catch {
      return null;
    }
    const profile = await readTutorProfile(db, userId);
    return modelJudge({
      env: context.env, db, settings, userId, conversationId: null, language, explainIn: LANGUAGE_NAMES[profile.nativeLanguage] ?? "English",
    })(input);
  };
}

export function registerAiPracticeRoutes(app: Hono<AppEnvironment>, deps: AiPracticeRouteDeps) {
  const notFound = (context: AppContext) => apiError(context, 404, "AI_PRACTICE_NOT_FOUND", "This practice is not available.");

  // A practice tagged to the published lesson, with its reference (for grading and speech only).
  async function taggedPractice(context: AppContext) {
    const found = await deps.lessonFor(context, "read"); if ("error" in found) return found;
    const practice = found.lesson.publishedDoc ? await findLessonAiPractice(context.env.DB, found.lesson.id, context.req.param("practiceId") ?? "") : null;
    if (!practice) return { error: notFound(context) };
    return { ...found, practice };
  }

  app.get(PRACTICES_PATH, deps.requireGroupAccess, async (context) => {
    const found = await deps.lessonFor(context, "read"); if ("error" in found) return found.error;
    const practices = await readLessonAiPractices(context.env.DB, found.lesson, context.get("user")!.id);
    return context.json(lessonAiPracticesResponseSchema.parse({ practices, canRemove: found.course.canEdit }));
  });

  // Grades one answer in the API and records it like a tutor component, with source `ai_practice` and the practice's ID, under
  // this lesson. Archived courses are graded but record nothing (the tutor's rule). Answers can be repeated.
  app.post(`${PRACTICES_PATH}/:practiceId/answer`, deps.requireGroupAccess, async (context) => {
    const found = await taggedPractice(context); if ("error" in found) return found.error;
    const parsed = await parseJson(context, aiPracticeAnswerRequestSchema, 8_192); if ("response" in parsed) return parsed.response;
    const userId = context.get("user")!.id;
    const component = { ...found.practice.practice, payload: { ...found.practice.practice.payload, lessonId: found.lesson.id } } as TutorComponent;
    const graded = await gradeComponentAnswer(component, parsed.data.answer, undefined, lessonPageJudge(context, userId, found.language));
    if (!graded.ok) return apiError(context, 400, "ANSWER_INVALID", "This answer does not fit the question.");
    let recorded = false;
    if (!found.course.archived) {
      const written = await recordComponentAnswer(context.env.DB, {
        userId, source: "ai_practice", practiceId: found.practice.practiceId, conversationId: null, component, answer: parsed.data.answer, grade: graded.grade,
      });
      recorded = written.attempt || written.reviews > 0;
    }
    return context.json(aiPracticeAnswerResponseSchema.parse({ grade: graded.grade, recorded }));
  });

  // The sentence of a dictation practice through on-demand audio; the text comes from storage, never from the request.
  app.post(`${PRACTICES_PATH}/:practiceId/speech`, deps.requireGroupAccess, async (context) => {
    const found = await taggedPractice(context); if ("error" in found) return found.error;
    const { practice } = found.practice;
    if (practice.kind !== "dictation") return apiError(context, 404, "SPAN_NOT_FOUND", "There is nothing to play here.");
    return speakStoredText(context, context.env, { userId: context.get("user")!.id, text: practice.payload.sentence, language: found.language, surface: "ai_practice" });
  });

  // Removes the practice from this lesson; a practice left without lessons is deleted.
  app.delete(`${PRACTICES_PATH}/:practiceId`, deps.requireGroupAccess, async (context) => {
    const found = await deps.lessonFor(context, "edit"); if ("error" in found) return found.error;
    if (!(await removeAiPracticeTag(context.env.DB, found.lesson.id, context.req.param("practiceId") ?? ""))) return notFound(context);
    return context.json({ ok: true } as const);
  });
}
