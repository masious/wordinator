import {
  PRONUNCIATION_REFERENCE_MAX, PRONUNCIATION_WORDS_MAX, type PracticeAttemptRequest, type PronunciationAttemptRequest, type PronunciationSurface,
} from "@wordinator/contracts/learning";
import type { AssessedWord, PronunciationAssessment } from "./speechRecognition";

// Learning attempts (C14b): each lesson answer check and each Microsoft pronunciation assessment is sent to the API after the
// learner has already seen its result (docs/courses.md#practice-attempts, docs/words.md#pronunciation-assessment). Sending is
// fire-and-forget: the response is not read, and a failed save is ignored and never blocks or shows an error.
function send(path: string, body: unknown) {
  try {
    void fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
  } catch { /* A failed save is ignored. */ }
}

export type AttemptLesson = { groupId: string; courseId: string; lessonId: string };
export const practiceAttemptPath = ({ groupId, courseId, lessonId }: AttemptLesson, blockId: string) =>
  `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/blocks/${encodeURIComponent(blockId)}/attempts`;

/** Records one checked item of a published lesson practice. The server decides the match. */
export function sendPracticeAttempt(lesson: AttemptLesson, blockId: string, item: number, answer: string) {
  send(practiceAttemptPath(lesson, blockId), { item, answer } satisfies PracticeAttemptRequest);
}

export const pronunciationAttemptPath = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}/pronunciation-attempts`;

export function pronunciationAttemptBody(surface: PronunciationSurface, referenceText: string, assessment: PronunciationAssessment, word?: AssessedWord): PronunciationAttemptRequest {
  return {
    surface, referenceText: referenceText.slice(0, PRONUNCIATION_REFERENCE_MAX),
    overall: assessment.overall, accuracy: assessment.accuracy, fluency: assessment.fluency, completeness: assessment.completeness,
    words: assessment.words.slice(0, PRONUNCIATION_WORDS_MAX),
    ...(word ? { lessonId: word.lessonId, wordId: word.wordId } : {}),
  };
}

/** Records one Microsoft assessment of a spoken term. */
export function sendPronunciationAttempt(groupId: string, surface: PronunciationSurface, referenceText: string, assessment: PronunciationAssessment, word?: AssessedWord) {
  send(pronunciationAttemptPath(groupId), pronunciationAttemptBody(surface, referenceText, assessment, word));
}
