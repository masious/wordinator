import { Check } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui";
import styles from "./LessonActivity.module.css";

type Option = { id: string; text: string };
type Checked = { correct: boolean; reference: string | null };

// A green badge with a check: on the correct option's corner (`corner`), or as a checked answer's result. Its words are its label.
export function CorrectBadge({ corner = false, label }: { corner?: boolean; label?: string }) {
  const { t } = useTranslation();
  return <span className={styles.correctBadge} data-corner={corner || undefined}><Check aria-hidden="true" />{label ?? t("lessonActivities.correct")}</span>;
}

// A checked answer's result row, with no box around it: the result (`status`, the Correct badge or a sentence) at the start, Try
// again and Continue at the end. Continue takes focus when the row appears, so Enter moves on.
export function AnswerResult({ status, continueLabel, advancing, onRetry, onContinue }: {
  status: ReactNode; continueLabel: string; advancing: boolean; onRetry: () => void; onContinue: () => void;
}) {
  const { t } = useTranslation();
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => { next.current?.focus({ preventScroll: true }); }, []);
  return <div className={styles.result}>
    <div role="status">{status}</div>
    <div className={styles.actions}>
      <Button variant="secondary" onClick={onRetry}>{t("lessonActivities.retry")}</Button>
      <Button ref={next} loading={advancing} disabled={advancing} onClick={onContinue}>{continueLabel}</Button>
    </div>
  </div>;
}

// A choice question's options. Before an answer is checked the reader selects one; once checked they lock, the correct option turns
// green with a Correct answer badge at its corner (the check names it by its text, `reference`), and a wrong pick is marked too.
export function ChoiceOptions({ prompt, options, selected, result, onSelect }: {
  prompt: string; options: readonly Option[]; selected: string; result: Checked | null; onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const correctId = result ? options.find((option) => option.text === result.reference)?.id : undefined;
  return <div className={styles.choices} role="group" aria-label={prompt}>
    {options.map((option) => {
      const correct = option.id === correctId;
      const wrong = result !== null && !result.correct && option.id === selected;
      return <Button key={option.id} variant={selected === option.id && !result ? "primary" : "secondary"} className={styles.choice}
        data-correct={correct || undefined} data-wrong={wrong || undefined} aria-pressed={selected === option.id} disabled={result !== null}
        onClick={() => onSelect(option.id)}>
        {option.text}
        {correct && <>{" "}<CorrectBadge corner label={t("lessonActivities.correctChoice")} /></>}
      </Button>;
    })}
  </div>;
}
