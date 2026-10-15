import type { AiPracticeContent } from "@wordinator/contracts/tutor";

// Seam for AI practices (C14h, docs/courses.md#ai-practices). The tutor's `save_ai_practice` tool validates its arguments with
// the contracts, resolves every tagged lesson as readable and published, and asks the learner to confirm; only a confirmed card
// reaches `saveAiPractice`, and `list_ai_practices` reads through `listAiPractices`. Until C14h adds the `ai_practices` and
// `ai_practice_lessons` tables, saving refuses with `AI_PRACTICES_UNAVAILABLE` (the tool reports it to the model as a failed
// write) and listing returns nothing. C14h replaces both bodies: validate each `afterBlockId` against the lesson's published
// document, insert the practice and its lesson rows in one batch, and return the new ID.

export type AiPracticeLessonTag = { lessonId: string; courseId: string; afterBlockId: string };
export type SaveAiPracticeInput = { userId: string; conversationId: string; practice: AiPracticeContent; lessons: AiPracticeLessonTag[]; now?: number };
export type SaveAiPracticeResult = { ok: true; practiceId: string } | { ok: false; error: "AI_PRACTICES_UNAVAILABLE" | "ANCHOR_NOT_FOUND" };

export async function saveAiPractice(_db: D1Database, _input: SaveAiPracticeInput): Promise<SaveAiPracticeResult> {
  return { ok: false, error: "AI_PRACTICES_UNAVAILABLE" };
}

export type ListedAiPractice = { practiceId: string; afterBlockId: string; practice: AiPracticeContent; createdAt: number };

// The AI practices tagged to a lesson the caller has already resolved as readable.
export async function listAiPractices(_db: D1Database, _lessonId: string): Promise<ListedAiPractice[]> {
  return [];
}
