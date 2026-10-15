import { PRONUNCIATION_REFERENCE_MAX, type PracticeAttemptSource } from "@wordinator/contracts/learning";
import {
  componentAttemptText, componentReviewDirection, componentWords, type TutorComponent, type TutorComponentAnswer, type TutorGrade,
} from "@wordinator/contracts/tutor";
import { recordWordReviews, type NewWordReview } from "../learningData";
import { insertPronunciationAttempt, insertPracticeAttempt } from "../learning/attempts";
import { readableLesson, readableWords, wordKey } from "./library";

// What answering a component writes (docs/ai-tutor.md#answer-components): a practice attempt (practice kind `ai`), a word review
// for every lesson word the component tests, and for Say it a pronunciation attempt. Words and lessons are re-resolved under the
// account's read rules; nothing is written for a word or lesson it cannot read or for an archived course. Shared with AI
// practices (C14h), which pass source `ai_practice` and their practice ID.

export type RecordAnswerInput = {
  userId: string; source: Extract<PracticeAttemptSource, "ai_chat" | "ai_practice">; practiceId: string; conversationId: string | null;
  component: TutorComponent; answer: TutorComponentAnswer; grade: TutorGrade; now?: number;
};
export type RecordedAnswer = { attempt: boolean; reviews: number; pronunciation: boolean };

export async function recordComponentAnswer(db: D1Database, input: RecordAnswerInput): Promise<RecordedAnswer> {
  const { userId, component, answer, grade } = input;
  const now = input.now ?? Date.now();
  const refs = componentWords(component);
  const words = await readableWords(db, userId, refs);
  const usable = refs.map((ref) => words.get(wordKey(ref))).filter((word) => word && !word.archived);
  const lessonId = component.payload.lessonId ?? usable[0]?.lessonId ?? null;
  const lesson = lessonId ? await readableLesson(db, userId, lessonId) : null;
  const recorded: RecordedAnswer = { attempt: false, reviews: 0, pronunciation: false };

  const text = componentAttemptText(component, answer);
  if (text && lesson && lesson.course.status !== "archived") {
    await insertPracticeAttempt(db, {
      userId, courseId: lesson.course.id, lessonId: lesson.id, practiceKind: "ai", practiceId: input.practiceId, itemIndex: 0,
      prompt: text.prompt, answer: text.answer, reference: text.reference, matched: grade.matched,
      aiVerdict: grade.verdict, aiNote: grade.note, source: input.source, conversationId: input.conversationId, createdAt: now,
    });
    recorded.attempt = true;
  }

  const reviews: NewWordReview[] = [];
  if (component.kind === "quick_review" && answer.kind === "quick_review") {
    component.payload.cards.forEach((card, index) => {
      const word = words.get(wordKey(card));
      if (word && !word.archived) reviews.push({
        termKey: word.termKey, direction: card.direction, result: answer.results[index] ?? "again", source: input.source,
        courseId: word.courseId, lessonId: word.lessonId, wordId: word.wordId, conversationId: input.conversationId, createdAt: now,
      });
    });
  } else if (component.kind !== "say_it") {
    const seen = new Set<string>();
    for (const word of usable) {
      if (!word || seen.has(word.termKey)) continue;
      seen.add(word.termKey);
      reviews.push({
        termKey: word.termKey, direction: componentReviewDirection(component.kind), result: grade.correct ? "got" : "again", source: input.source,
        courseId: word.courseId, lessonId: word.lessonId, wordId: word.wordId, conversationId: input.conversationId, createdAt: now,
      });
    }
  }
  if (reviews.length) {
    await recordWordReviews(db, userId, reviews, now);
    recorded.reviews = reviews.length;
  }

  if (component.kind === "say_it" && answer.kind === "say_it") {
    const word = usable[0];
    await insertPronunciationAttempt(db, {
      userId, surface: "ai_chat", referenceText: component.payload.sentence.slice(0, PRONUNCIATION_REFERENCE_MAX),
      termKey: word?.termKey ?? null, lessonId: word?.lessonId ?? null, wordId: word?.wordId ?? null, ...answer.scores, createdAt: now,
    });
    recorded.pronunciation = true;
  }
  return recorded;
}
