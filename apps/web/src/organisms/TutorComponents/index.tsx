import { answerHintsUsed, type TutorComponentAnswer, type TutorComponentView, type TutorGrade } from "@wordinator/contracts/tutor";
import { useContext, useState } from "react";
import { ArticleComponent, ChoiceComponent } from "./ChoiceComponents";
import { QuickReviewComponent, SayItComponent } from "./SpeechComponents";
import { SpotWordsComponent } from "./SpotWords";
import { DictationComponent, FillInComponent, FixMistakeComponent, TranslateComponent } from "./TextComponents";
import { DraftContext, GradeHeldContext, HintsContext, SkipContext } from "./shared";
import type { AnswerComponentProps, ClipSource } from "./types";
import { WordOrderComponent } from "./WordOrder";

// The answer components (docs/ai-tutor.md#answer-components). Use one component directly when the kind is known, or
// `AnswerComponent` with any view; every one takes the contracts' view, the stored answer and grade, and `onAnswer`.
export { ArticleComponent, ChoiceComponent, DictationComponent, FillInComponent, FixMistakeComponent, QuickReviewComponent, SayItComponent, SpotWordsComponent, TranslateComponent, WordOrderComponent };
export { ClipButton, CLIP_RETRIES, CLIP_RETRY_MS, resetOnDemandSpeech, useOnDemandSpeechAvailable } from "./ClipButton";
export { BareFrameContext, DraftContext, GradeResult, MarkedText, VerdictBadge, type DraftMode } from "./shared";
export type { AnswerComponentProps, ClipResult, ClipSource, ComponentAnswerOf, ComponentViewOf } from "./types";

export type AnyAnswerComponentProps = {
  view: TutorComponentView; answer: TutorComponentAnswer | null; grade: TutorGrade | null;
  onAnswer: (answer: TutorComponentAnswer) => Promise<unknown> | void;
  disabled?: boolean; clip?: ClipSource; language?: string; autoFocus?: boolean;
  // Offers a quiet Skip while the component has no stored answer (the tutor's chat); a rejection shows the send error.
  onSkip?: () => Promise<unknown>;
  // An answered question of a practice set whose grade waits for the set's other questions.
  gradeHeld?: boolean;
};

// Renders the component of `view.kind`. The stored answer must be of the same kind (the API guarantees it); any other is ignored.
export function AnswerComponent({ view, answer, onSkip, onAnswer, gradeHeld = false, ...rest }: AnyAnswerComponentProps) {
  const same = answer && answer.kind === view.kind ? answer : null;
  const skip = onSkip && !same ? { onSkip, disabled: Boolean(rest.disabled) } : null;
  const hints = "hints" in view ? view.hints ?? [] : [];
  // Opened hints are local until the answer goes out with them; a stored answer restores which ones were opened.
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set(same ? answerHintsUsed(same)
    .map((ref) => hints.findIndex((hint) => hint.lessonId === ref.lessonId && hint.wordId === ref.wordId)).filter((index) => index >= 0) : []));
  const [sent, setSent] = useState(false);
  // A draft (the question dock) keeps the unopened hints closed: the learner may still come back to the question.
  const draft = Boolean(useContext(DraftContext));
  const send = async (value: TutorComponentAnswer) => {
    const used = [...opened].sort((a, b) => a - b).flatMap((index) => hints[index] ? [{ lessonId: hints[index].lessonId, wordId: hints[index].wordId }] : []);
    await onAnswer(used.length ? { ...value, hintsUsed: used } as TutorComponentAnswer : value);
    if (!draft) setSent(true);
  };
  const hintState = { hints, opened, answered: Boolean(same) || sent || rest.grade !== null, open: (index: number) => setOpened((current) => new Set([...current, index])) };
  return <GradeHeldContext.Provider value={gradeHeld}>
    <HintsContext.Provider value={hintState}>
      <SkipContext.Provider value={skip}><KindComponent view={view} answer={same} onAnswer={send} {...rest} /></SkipContext.Provider>
    </HintsContext.Provider>
  </GradeHeldContext.Provider>;
}

function KindComponent({ view, answer: same, ...rest }: Omit<AnyAnswerComponentProps, "onSkip" | "gradeHeld">) {
  // The kind only narrows the type; `view.kind` already picked the component.
  const props = <K extends TutorComponentView["kind"]>(_kind: K) => ({ ...rest, view, answer: same }) as unknown as AnswerComponentProps<K>;
  switch (view.kind) {
    case "fill_in": return <FillInComponent {...props("fill_in")} />;
    case "translate": return <TranslateComponent {...props("translate")} />;
    case "word_order": return <WordOrderComponent {...props("word_order")} />;
    case "article": return <ArticleComponent {...props("article")} />;
    case "choice": return <ChoiceComponent {...props("choice")} />;
    case "quick_review": return <QuickReviewComponent {...props("quick_review")} />;
    case "say_it": return <SayItComponent {...props("say_it")} />;
    case "dictation": return <DictationComponent {...props("dictation")} />;
    case "fix_mistake": return <FixMistakeComponent {...props("fix_mistake")} />;
    case "spot_words": return <SpotWordsComponent {...props("spot_words")} />;
  }
}
