import type { TutorComponentAnswer, TutorComponentView, TutorGrade } from "@wordinator/contracts/tutor";
import { ArticleComponent, ChoiceComponent } from "./ChoiceComponents";
import { QuickReviewComponent, SayItComponent } from "./SpeechComponents";
import { DictationComponent, FillInComponent, FixMistakeComponent, TranslateComponent } from "./TextComponents";
import { SkipContext } from "./shared";
import type { AnswerComponentProps, ClipSource } from "./types";
import { WordOrderComponent } from "./WordOrder";

// The answer components (docs/ai-tutor.md#answer-components). Use one component directly when the kind is known, or
// `AnswerComponent` with any view; every one takes the contracts' view, the stored answer and grade, and `onAnswer`.
export { ArticleComponent, ChoiceComponent, DictationComponent, FillInComponent, FixMistakeComponent, QuickReviewComponent, SayItComponent, TranslateComponent, WordOrderComponent };
export { ClipButton, CLIP_RETRIES, CLIP_RETRY_MS, resetOnDemandSpeech, useOnDemandSpeechAvailable } from "./ClipButton";
export { GradeResult, VerdictBadge } from "./shared";
export type { AnswerComponentProps, ClipResult, ClipSource, ComponentAnswerOf, ComponentViewOf } from "./types";

export type AnyAnswerComponentProps = {
  view: TutorComponentView; answer: TutorComponentAnswer | null; grade: TutorGrade | null;
  onAnswer: (answer: TutorComponentAnswer) => Promise<unknown> | void;
  disabled?: boolean; clip?: ClipSource; language?: string; autoFocus?: boolean;
  // Offers a quiet Skip while the component has no stored answer (the tutor's chat); a rejection shows the send error.
  onSkip?: () => Promise<unknown>;
};

// Renders the component of `view.kind`. The stored answer must be of the same kind (the API guarantees it); any other is ignored.
export function AnswerComponent({ view, answer, onSkip, ...rest }: AnyAnswerComponentProps) {
  const same = answer && answer.kind === view.kind ? answer : null;
  const skip = onSkip && !same ? { onSkip, disabled: Boolean(rest.disabled) } : null;
  return <SkipContext.Provider value={skip}><KindComponent view={view} answer={same} {...rest} /></SkipContext.Provider>;
}

function KindComponent({ view, answer: same, ...rest }: Omit<AnyAnswerComponentProps, "onSkip">) {
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
  }
}
