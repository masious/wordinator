// The AI tutor (C14g, docs/ai-tutor.md). `app.ts` mounts the routes at `/api/ai`; AI practices (C14h) reuse the grading,
// recording, and save seams.
export { tutorRoutes } from "./routes";
export { gradeComponentAnswer, modelJudge, parseVerdict, type Verdict, type VerdictInput, type VerdictJudge } from "./grading";
export { recordComponentAnswer, type RecordAnswerInput, type RecordedAnswer } from "./recording";
export {
  aiPracticeCounts, findLessonAiPractice, lessonAiPracticeDeletion, listAiPractices, readLessonAiPractices, removeAiPracticeTag, saveAiPractice,
  type AiPracticeLessonTag, type SaveAiPracticeInput, type SaveAiPracticeResult,
} from "./aiPractices";
export { readableLesson, readableWords, type ReadableLesson } from "./library";
