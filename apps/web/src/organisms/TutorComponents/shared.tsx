import type { TutorComponentKind, TutorGrade } from "@wordinator/contracts/tutor";
import { Check, X } from "lucide-react";
import { createContext, useContext, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { Button } from "../../ui";
import styles from "./TutorComponents.module.css";

// Sends one answer: locked while it is sent and once it is answered; a failed send unlocks it again with an error line.
export function useAnswerFlow<A>(stored: A | null, onAnswer: (answer: A) => Promise<unknown> | void) {
  const [sent, setSent] = useState<A | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const answered = stored ?? sent;
  const submit = async (answer: A) => {
    if (pending || answered) return;
    setPending(true); setFailed(false);
    try { await onAnswer(answer); setSent(answer); } catch { setFailed(true); } finally { setPending(false); }
  };
  return { answered, pending, failed, submit };
}

// Enter without modifiers, outside an IME composition.
export const plainEnter = (event: KeyboardEvent) => event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing;

// A waiting component the learner may decline (the tutor's chat, docs/ai-tutor.md#answer-components). `AnswerComponent` provides it
// while the component has no stored answer; the frame then ends with a quiet Skip.
export type SkipAction = { onSkip: () => Promise<unknown> | void; disabled: boolean };
export const SkipContext = createContext<SkipAction | null>(null);

function SkipRow({ action }: { action: SkipAction }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const skip = async () => {
    if (pending) return;
    setPending(true); setFailed(false);
    try { await action.onSkip(); } catch { setFailed(true); } finally { setPending(false); }
  };
  return <div className={styles.skipRow}>
    {failed && <p className={styles.sendError} role="alert">{t("tutorComponents.sendFailed")}</p>}
    <Button variant="quiet" aria-label={t("tutorComponents.skipNamed")} loading={pending} disabled={action.disabled} onClick={() => void skip()}>{t("tutorComponents.skip")}</Button>
  </div>;
}

// The component's inset panel: a mono eyebrow naming the kind, the body, the answer's footer, and Skip where offered.
export function ComponentFrame({ kind, children, labelledBy }: { kind: TutorComponentKind; children: ReactNode; labelledBy?: string }) {
  const { t } = useTranslation();
  const skip = useContext(SkipContext);
  return <section className={styles.frame} aria-label={labelledBy ? undefined : t(`tutorComponents.kinds.${kind}`)} aria-labelledby={labelledBy} data-kind={kind}>
    <p className={styles.eyebrow}>{t(`tutorComponents.kinds.${kind}`)}</p>
    {children}
    {skip && <SkipRow action={skip} />}
  </section>;
}

// The submit row: the check button, its pending state, and a send error.
export function SubmitRow({ label, disabled, pending, failed, onSubmit }: { label?: string; disabled: boolean; pending: boolean; failed: boolean; onSubmit: () => void }) {
  const { t } = useTranslation();
  return <div className={styles.submitRow}>
    {failed && <p className={styles.sendError} role="alert">{t("tutorComponents.sendFailed")}</p>}
    <Button loading={pending} disabled={disabled} onClick={onSubmit}>{label ?? t("tutorComponents.check")}</Button>
  </div>;
}

// The verdict badge of drill cards (docs/design-system.md, C14): Matches!, the tutor's acceptance, or Not quite.
export function VerdictBadge({ ok, label, children }: { ok: boolean; label: string; children?: ReactNode }) {
  return <p className={styles.verdict} data-match={ok || undefined}>
    <span className={styles.verdictIcon} aria-hidden="true">{ok ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}</span>
    <span className={styles.verdictLabel}>{label}</span>
    {children}
  </p>;
}

const SHOWS_ITEMS: readonly TutorComponentKind[] = ["fill_in", "article", "dictation"];

// A graded answer in place: the badge, the tutor's note, the expected answer when it differs, and per-item marks where an answer
// has several parts (blanks, nouns, dictation words).
export function GradeResult({ kind, grade }: { kind: TutorComponentKind; grade: TutorGrade }) {
  const { t } = useTranslation();
  const label = grade.correct ? (grade.matched === false && grade.verdict === "acceptable" ? t("tutorComponents.verdict.accepted") : t("tutorComponents.verdict.match"))
    : t("tutorComponents.verdict.miss");
  const showReference = grade.reference && kind !== "quick_review" && kind !== "say_it" && grade.matched !== true;
  const items = SHOWS_ITEMS.includes(kind) && grade.items.length > 1 ? grade.items : [];
  return <div className={styles.grade} aria-live="polite">
    <VerdictBadge ok={grade.correct} label={label} />
    {items.length > 0 && <ul className={styles.items} aria-label={t("tutorComponents.items")}>
      {items.map((item, index) => <li key={index} data-ok={item.ok || undefined}>
        <span aria-hidden="true">{item.ok ? "✓" : "✗"}</span>
        <span>{item.ok ? item.expected || item.given : t("tutorComponents.itemMiss", { given: item.given || "—", expected: item.expected || "—" })}</span>
      </li>)}
    </ul>}
    {grade.note && <div className={styles.note}><p className={styles.noteLabel}>{t("tutorComponents.note")}</p><p className={styles.noteText}><PlainText>{grade.note}</PlainText></p></div>}
    {showReference && <div className={styles.reference}>
      <p className={styles.noteLabel}>{grade.correct ? t("tutorComponents.referenceAlso") : t("tutorComponents.reference")}</p>
      <p className={styles.referenceText}><PlainText>{grade.reference!}</PlainText></p>
    </div>}
  </div>;
}

// Waiting for the grade after the answer was sent.
export function GradePending() {
  const { t } = useTranslation();
  return <p className={styles.waiting} role="status">{t("tutorComponents.grading")}</p>;
}
