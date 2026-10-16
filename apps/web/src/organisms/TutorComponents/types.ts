import type { TutorComponentAnswer, TutorComponentKind, TutorComponentView, TutorGrade } from "@wordinator/contracts/tutor";

// The answer components (docs/ai-tutor.md#answer-components) are shared by the tutor's chat and the lesson page's AI practices
// (docs/courses.md#ai-practices). Each one renders a contracts view, sends one answer through `onAnswer`, and shows the grade in
// place once it has one; the surface decides where the answer goes and where audio comes from.

export type ComponentViewOf<K extends TutorComponentKind> = Extract<TutorComponentView, { kind: K }>;
export type ComponentAnswerOf<K extends TutorComponentKind> = Extract<TutorComponentAnswer, { kind: K }>;

// One on-demand clip request (docs/speech.md#on-demand-audio): ready with its URL, still being made (`202`, asked again after a
// second), over the daily character cap, not available at all (no Azure key: speaker buttons hide for the visit), or failed.
export type ClipResult =
  | { status: "ready"; url: string }
  | { status: "pending" }
  | { status: "limit"; resetsAt: number }
  | { status: "unavailable" }
  | { status: "failed" };
// `key` names the clip for the visit's URL cache, so a second press plays at once; `load` asks the surface's speech route.
export type ClipSource = { key: string; load: () => Promise<ClipResult> };

export type AnswerComponentProps<K extends TutorComponentKind> = {
  view: ComponentViewOf<K>;
  // The stored answer and grade. A component with an answer is read-only; the grade shows once it arrives.
  answer: ComponentAnswerOf<K> | null;
  grade: TutorGrade | null;
  // Sends the answer once. A rejection re-opens the component with a short error, so the learner can send it again.
  onAnswer: (answer: ComponentAnswerOf<K>) => Promise<unknown> | void;
  // Read-only without an answer, such as in an archived conversation or while another request runs.
  disabled?: boolean;
  // Say it and Dictation play their sentence from here; without it they show no speaker button.
  clip?: ClipSource;
  // The library language's name (Quick review's Produce prompt).
  language?: string;
  // Moves focus into the component when it appears, so its keys work at once.
  autoFocus?: boolean;
};
