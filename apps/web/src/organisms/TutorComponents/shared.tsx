import { parseTargetSpans, type TutorComponentKind, type TutorGrade, type TutorHintView } from "@wordinator/contracts/tutor";
import { Check, Lightbulb, X } from "lucide-react";
import { createContext, useContext, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { Button } from "../../ui";
import styles from "./TutorComponents.module.css";

// Draft mode: a question of the chat's question dock (docs/ai-tutor.md#practice-sets). Its answer is a draft the learner can
// change until the set is sent, so submitting saves the draft without locking the component. The component's Check row hands
// its readiness and submit to the dock, whose footer (Previous, Skip, Next or Check answers) replaces it; Skip is the dock's too.
export type DraftMode = { register: (entry: { ready: boolean; submit: () => void } | null) => void };
export const DraftContext = createContext<DraftMode | null>(null);

// Sends one answer: locked while it is sent and once it is answered; a failed send unlocks it again with an error line. In draft
// mode the answer is saved as `draft` and the component stays open.
export function useAnswerFlow<A>(stored: A | null, onAnswer: (answer: A) => Promise<unknown> | void) {
  const draftMode = useContext(DraftContext);
  const [sent, setSent] = useState<A | null>(null);
  const [draft, setDraft] = useState<A | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const answered = stored ?? sent;
  const submit = async (answer: A) => {
    if (draftMode) { setDraft(answer); await onAnswer(answer); return; }
    if (pending || answered) return;
    setPending(true); setFailed(false);
    try { await onAnswer(answer); setSent(answer); } catch { setFailed(true); } finally { setPending(false); }
  };
  return { answered, draft, pending, failed, submit };
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
  const draft = useContext(DraftContext);
  useEffect(() => { draft?.register({ ready: !disabled, submit: onSubmit }); });
  useEffect(() => () => draft?.register(null), [draft]);
  if (draft) return null;
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

// A graded answer in place: the badge, per-item marks where an answer has several parts (blanks, nouns, dictation words), and
// one feedback box holding the expected answer when it differs and the tutor's note, each under a narrow label column.
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
    {(showReference || grade.note) && <dl className={styles.feedback} data-match={grade.correct || undefined}>
      {showReference && <div className={styles.feedbackRow}>
        <dt className={styles.noteLabel}>{grade.correct ? t("tutorComponents.referenceAlso") : t("tutorComponents.reference")}</dt>
        <dd className={styles.referenceText}><MarkedText text={grade.reference!} /></dd>
      </div>}
      {grade.note && <div className={styles.feedbackRow}>
        <dt className={styles.noteLabel}>{t("tutorComponents.note")}</dt>
        <dd className={styles.noteText}><PlainText>{grade.note}</PlainText></dd>
      </div>}
    </dl>}
  </div>;
}

// Word hints (docs/ai-tutor.md#word-hints): the component's hints, which ones the learner opened, and whether the answer is in
// (then every hint shows, the opened ones marked). `AnswerComponent` provides it; the question kinds that take hints show the row.
export type HintState = { hints: readonly TutorHintView[]; opened: ReadonlySet<number>; open: (index: number) => void; answered: boolean };
export const HintsContext = createContext<HintState | null>(null);

// The question's hints: each shows only its cue (the question's own words) until the learner opens it, without any request.
export function HintRow() {
  const { t } = useTranslation();
  const state = useContext(HintsContext);
  if (!state || state.hints.length === 0) return null;
  return <div className={styles.hints}>
    <p className={styles.hintsLabel}><Lightbulb size={14} aria-hidden="true" />{t("tutorComponents.hints.label")}</p>
    <ul className={styles.hintList}>
      {state.hints.map((hint, index) => {
        const shown = state.answered || state.opened.has(index);
        return <li key={`${hint.lessonId}:${hint.wordId}`}>
          {shown
            ? <span className={styles.hintOpen} data-used={state.opened.has(index) || undefined}>
              <span className={styles.hintCue}>{hint.cue}</span>
              <span className={styles.hintTerm}>{hint.term}</span>
              {hint.forms && <span className={styles.muted}>{hint.forms}</span>}
            </span>
            : <button type="button" className={styles.hintButton} aria-label={t("tutorComponents.hints.open", { cue: hint.cue })} onClick={() => state.open(index)}>{hint.cue}</button>}
        </li>;
      })}
    </ul>
  </div>;
}

// Whether an answered component's grade is held back until the rest of its practice set is answered.
export const GradeHeldContext = createContext(false);

// Waiting for the grade after the answer was sent, or, in a practice set, for the set's other answers.
export function GradePending() {
  const { t } = useTranslation();
  const held = useContext(GradeHeldContext);
  return <p className={styles.waiting} role="status">{held ? t("tutorComponents.gradeHeld") : t("tutorComponents.grading")}</p>;
}

// Display text with the tutor's `[[...]]` target-language marks shown as emphasised spans instead of literal brackets.
export function MarkedText({ text }: { text: string }) {
  const { text: plain, spans } = parseTargetSpans(text);
  if (!spans.length) return <>{plain}</>;
  const pieces: ReactNode[] = [];
  let index = 0;
  spans.forEach((span, position) => {
    if (span.start > index) pieces.push(plain.slice(index, span.start));
    pieces.push(<span key={`s${position}`} className={styles.target}>{plain.slice(span.start, span.end)}</span>);
    index = span.end;
  });
  if (index < plain.length) pieces.push(plain.slice(index));
  return <>{pieces}</>;
}
