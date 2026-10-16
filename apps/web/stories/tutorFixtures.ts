import { parseTargetSpans, tutorComponentViewSchema, tutorGradeSchema, tutorPartSchema, type TutorGrade, type TutorPart } from "@wordinator/contracts/tutor";
import type { ClipSource } from "../src/organisms/TutorComponents";
import { courseId, lessonId, speechUrl } from "./fixtures";

// Tutor fixtures (docs/ai-tutor.md). Parts, views, and grades are parsed with the contracts' schemas, like every other fixture.

export const wordId = "70000000-0000-4000-8000-000000000001";
let nextId = 0;
export const toolCallId = () => `80000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;

// Every clip plays the fixture tone.
export const clip = (key: string): ClipSource => ({ key, load: async () => ({ status: "ready", url: speechUrl }) });

export const view = (value: unknown) => tutorComponentViewSchema.parse(value);
export const grade = (fields: Partial<TutorGrade> & Pick<TutorGrade, "correct">): TutorGrade =>
  tutorGradeSchema.parse({ matched: null, verdict: null, note: null, reference: null, items: [], score: null, ...fields });
export const part = (value: unknown): TutorPart => tutorPartSchema.parse(value);

// A text part from the model's raw text, with its `[[...]]` marks turned into spoken spans, as the API stores it.
export const text = (raw: string): TutorPart => part({ type: "text", ...parseTargetSpans(raw) });

export const lesson = { id: lessonId, title: "Deze jas is warmer" };
export const course = { id: courseId, title: "Dutch Foundations — Part III: Home and Surroundings" };
