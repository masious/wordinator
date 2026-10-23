import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LessonActivityViewPayload } from "@wordinator/contracts/lesson-activities";
import { LessonBlocks } from "../LessonDocument/LessonDocument";
import { Button, Surface } from "../../ui";
import { useAnswerAttempt } from "./activityAnswers";
import { AnswerResult, ChoiceOptions, CorrectBadge } from "./ChoiceOptions";
import activityStyles from "./LessonActivity.module.css";
import styles from "./GuidedGrammarActivity.module.css";

// One guided step: read-only lesson blocks, then a three-option choice question. The page owns the run and its cursor.
export type GuidedGrammarStep = Extract<LessonActivityViewPayload, { type: "guided_grammar" }>["steps"][number];
export type GuidedGrammarActivityProps = {
  // The activity endpoint; answers post to `${endpoint}/answers`.
  endpoint: string;
  runId: string;
  steps: readonly GuidedGrammarStep[];
  // The run's saved step cursor: the step shown on load, so a resumed run starts where it stopped.
  cursor: number;
  advancing: boolean;
  // Continue on every step but the last; the last step's Continue completes the activity.
  onContinue: () => void;
  onComplete: () => void;
};

export function GuidedGrammarActivity({ endpoint, runId, steps, cursor, advancing, onContinue, onComplete }: GuidedGrammarActivityProps) {
  const step = steps[cursor];
  if (!step) return null;
  const last = cursor + 1 >= steps.length;
  return <div className={styles.guided}>
    <StepBar current={cursor} total={steps.length} />
    <div className={styles.body}><LessonBlocks blocks={step.blocks} /></div>
    <StepQuestion key={step.question.id} endpoint={endpoint} runId={runId} question={step.question} last={last} advancing={advancing}
      onContinue={last ? onComplete : onContinue} />
  </div>;
}

// One segment per step: finished steps fill, the current step is outlined by its soft tint.
function StepBar({ current, total }: { current: number; total: number }) {
  const { t } = useTranslation();
  return <div className={styles.steps} role="progressbar" aria-label={t("lessonActivities.types.guided_grammar")} aria-valuemin={1}
    aria-valuemax={total} aria-valuenow={current + 1} aria-valuetext={t("lessonActivities.progress", { current: current + 1, total })}>
    {Array.from({ length: total }, (_, index) => <span key={index} className={styles.segment}
      data-done={index < current || undefined} data-current={index === current || undefined} />)}
  </div>;
}

// The choice question follows ActivityItem: select an option, Check answer, then the marked options, the explanation, and Retry and
// Continue.
type StepQuestionProps = { endpoint: string; runId: string; question: GuidedGrammarStep["question"]; last: boolean; advancing: boolean; onContinue: () => void };
function StepQuestion({ endpoint, runId, question, last, advancing, onContinue }: StepQuestionProps) {
  const { t } = useTranslation();
  const attempt = useAnswerAttempt(endpoint, runId, question.id, () => undefined);
  const [selected, setSelected] = useState("");
  const result = attempt.result;
  const retry = () => { attempt.retry(); setSelected(""); };

  return <Surface className={activityStyles.panel}>
    <p className={activityStyles.prompt}>{question.prompt}</p>
    <ChoiceOptions prompt={question.prompt} options={question.options} selected={selected} result={result} onSelect={setSelected} />
    {/* The explanation sits under the options, which already mark the correct one. */}
    {result?.explanation && <p className={activityStyles.note}>{result.explanation}</p>}
    {result
      ? <AnswerResult status={result.correct ? <CorrectBadge /> : <strong className={activityStyles.wrong}>{t("lessonActivities.choiceWrong")}</strong>}
        continueLabel={last ? t("lessonActivities.finish") : t("lessonActivities.continue")} advancing={advancing} onRetry={retry} onContinue={onContinue} />
      : <div className={activityStyles.actions}>
        <Button loading={attempt.pending} disabled={!selected || attempt.pending} onClick={() => attempt.check({ kind: "choice", optionId: selected })}>{t("lessonActivities.checkAnswer")}</Button>
      </div>}
    {attempt.error && <p className={activityStyles.alert} role="alert">{t("lessonActivities.answerFailed")}</p>}
  </Surface>;
}
