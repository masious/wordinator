import { parseTargetSpans, type TutorComponentAnswer, type TutorConfirmationSummary, type TutorPart } from "@wordinator/contracts/tutor";
import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { Button } from "../../ui";
import { AnswerComponent, type ClipSource } from "../TutorComponents";
import { AssistantText } from "./Markdown";
import styles from "./Tutor.module.css";

// What a tutor message shows (docs/ai-tutor.md#messages-and-formatting): the learner's plain text, and the assistant's parts in
// order: Markdown-subset text with spoken spans, tool steps as chips, answer components, confirmation cards, and errors.

type ToolCallPart = Extract<TutorPart, { type: "tool_call" }>;
type ToolResultPart = Extract<TutorPart, { type: "tool_result" }>;
type ConfirmationPart = Extract<TutorPart, { type: "confirmation" }>;
// While a turn streams, text parts hold the raw text so far, still with its `[[...]]` marks.
export type StreamPart = { type: "raw_text"; raw: string } | Exclude<TutorPart, { type: "text" }>;

export function UserMessage({ text }: { text: string }) {
  const { t } = useTranslation();
  return <div className={styles.userRow}><p className={styles.userBubble} aria-label={t("tutor.you")}><PlainText>{text}</PlainText></p></div>;
}

// A tool step: running (spinner), done (check), or failed (cross), opening to its detail.
export function ToolStep({ call, result, running }: { call: Pick<ToolCallPart, "name" | "toolCallId">; result: ToolResultPart | null; running: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const status = result ? (result.ok ? "done" : "failed") : running ? "running" : "done";
  const detail = result?.detail ?? {};
  const values = { ...Object.fromEntries(Object.entries(detail).map(([key, value]) => [key, value === null ? "" : String(value)])) };
  const label = status === "running" ? t(`tutor.steps.running.${call.name}`, { defaultValue: t("tutor.steps.running.default") })
    : detail.next === false && call.name === "get_lesson" ? t("tutor.steps.done.noNextLesson")
    : t(`tutor.steps.done.${call.name}`, { ...values, defaultValue: t("tutor.steps.done.default") });
  const rows = Object.entries(detail).filter(([key]) => !key.endsWith("Id"));
  const expandable = status !== "running" && (rows.length > 0 || Boolean(result?.error));
  return <div className={styles.step} data-status={status}>
    <button type="button" className={styles.chip} aria-expanded={expandable ? open : undefined} aria-controls={expandable ? detailId : undefined}
      disabled={!expandable} onClick={() => setOpen((value) => !value)}>
      <span className={styles.chipIcon} aria-hidden="true">{status === "running" ? <LoaderCircle size={14} className={styles.spinner} /> : status === "done" ? <Check size={14} /> : <X size={14} />}</span>
      <span>{label}</span>
      {status === "failed" && <span className={styles.visuallyHidden}>{t("tutor.steps.failed")}</span>}
      {expandable && <ChevronDown size={14} aria-hidden="true" className={styles.chipChevron} />}
    </button>
    {expandable && open && <div className={styles.stepDetail} id={detailId}>
      {result?.error && <p>{t("tutor.steps.error", { code: result.error })}</p>}
      {rows.length > 0 && <dl>{rows.map(([key, value]) => <div key={key}><dt>{t(`tutor.steps.detail.${key}`, { defaultValue: key })}</dt><dd>{value === null ? "—" : String(value)}</dd></div>)}</dl>}
    </div>}
  </div>;
}

function summaryLine(summary: TutorConfirmationSummary, t: (key: string, options?: Record<string, unknown>) => string) {
  if (summary.action === "save_ai_practice") return t("tutor.confirm.save_ai_practice", { kind: t(`tutorComponents.kinds.${summary.view.kind}`), count: summary.lessons.length });
  return t(`tutor.confirm.${summary.action}`, { lesson: summary.lesson.title, course: summary.course.title });
}

// A confirmation card: what will happen, then Cancel and Confirm (danger for a reset). Once answered it collapses to one muted line.
export function ConfirmationCard({ part, disabled, onRespond }: { part: ConfirmationPart; disabled: boolean; onRespond: (confirmed: boolean) => Promise<unknown> }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const { summary } = part;
  const line = summaryLine(summary, t);
  if (part.answer) {
    const outcome = part.answer === "cancelled" ? t("tutor.confirm.cancelled") : part.outcome && !part.outcome.ok
      ? t("tutor.confirm.refused", { reason: t(`tutor.errors.${part.outcome.error ?? "generic"}`, { defaultValue: part.outcome.error ?? "" }) })
      : t("tutor.confirm.confirmed");
    return <p className={styles.answeredCard} role="status">{outcome} · {line}</p>;
  }
  const respond = async (confirmed: boolean) => {
    setPending(confirmed); setFailed(false);
    try { await onRespond(confirmed); } catch { setFailed(true); } finally { setPending(null); }
  };
  return <section className={styles.card} aria-label={t("tutor.confirm.label")}>
    <p className={styles.cardSummary}>{line}</p>
    {summary.action === "reset_lesson" && <ul className={styles.cardDetails}>
      {summary.deletes.position && <li>{t("tutor.confirm.deletes.position")}</li>}
      {summary.deletes.completion && <li>{t("tutor.confirm.deletes.completion")}</li>}
      <li>{t("tutor.confirm.deletes.practiceProgress", { count: summary.deletes.practiceProgress })}</li>
      <li>{t("tutor.confirm.deletes.attempts", { count: summary.deletes.attempts })}</li>
      <li>{t("tutor.confirm.deletes.reviews", { count: summary.deletes.reviews })}</li>
    </ul>}
    {summary.action === "save_ai_practice" && <ul className={styles.cardDetails}>
      {summary.lessons.map((entry) => <li key={entry.lesson.id}>{t("tutor.confirm.lessonIn", { lesson: entry.lesson.title, course: entry.course.title })}</li>)}
    </ul>}
    {failed && <p className={styles.errorLine} role="alert">{t("tutorComponents.sendFailed")}</p>}
    <div className={styles.cardActions}>
      <Button variant="secondary" disabled={disabled || pending !== null} loading={pending === false} onClick={() => void respond(false)}>{t("common.cancel")}</Button>
      <Button variant={summary.action === "reset_lesson" ? "danger" : "primary"} disabled={disabled || pending !== null} loading={pending === true} onClick={() => void respond(true)}>{t("tutor.confirm.confirm")}</Button>
    </div>
  </section>;
}

export type PartHandlers = {
  disabled: boolean;
  language?: string;
  lang?: string;
  speech?: (spanIndex: number) => ClipSource | null;
  componentClip?: (toolCallId: string) => ClipSource | undefined;
  onAnswer?: (toolCallId: string, answer: TutorComponentAnswer) => Promise<unknown>;
  onConfirm?: (toolCallId: string, confirmed: boolean) => Promise<unknown>;
  onRetry?: () => void;
  focusOpen?: boolean;
};

// The assistant's parts, stored or streaming. Tool calls pair with their results by ID; an `ask_*` call or a confirmation's
// call is shown by its component or card instead of a chip.
export function AssistantParts({ parts, streaming, handlers }: { parts: readonly (TutorPart | StreamPart)[]; streaming: boolean; handlers: PartHandlers }) {
  const { t } = useTranslation();
  const shownBy = new Set(parts.flatMap((part) => part.type === "component" || part.type === "confirmation" ? [part.toolCallId] : []));
  const results = new Map(parts.flatMap((part) => part.type === "tool_result" ? [[part.toolCallId, part] as const] : []));
  const calls = new Set(parts.flatMap((part) => part.type === "tool_call" ? [part.toolCallId] : []));
  let spanBase = 0;
  return <div className={styles.assistant}>
    {parts.map((part, index) => {
      switch (part.type) {
        case "text": {
          const base = spanBase; spanBase += part.spans.length;
          return <AssistantText key={index} text={part.text} spans={part.spans} spanBase={base} speech={handlers.speech} lang={handlers.lang} />;
        }
        case "raw_text": {
          const parsed = parseTargetSpans(part.raw);
          return <AssistantText key={index} text={parsed.text} spans={parsed.spans} lang={handlers.lang} />;
        }
        case "tool_call":
          if (shownBy.has(part.toolCallId) || part.name.startsWith("ask_")) return null;
          return <ToolStep key={index} call={part} result={results.get(part.toolCallId) ?? null} running={streaming} />;
        case "tool_result":
          return calls.has(part.toolCallId) || shownBy.has(part.toolCallId) ? null : <ToolStep key={index} call={part} result={part} running={false} />;
        case "component":
          return <AnswerComponent key={part.toolCallId} view={part.view} answer={part.answer} grade={part.grade} disabled={handlers.disabled || !handlers.onAnswer}
            clip={handlers.componentClip?.(part.toolCallId)} language={handlers.language} autoFocus={handlers.focusOpen && part.answeredAt === null}
            onAnswer={(answer) => handlers.onAnswer ? handlers.onAnswer(part.toolCallId, answer) : undefined} />;
        case "confirmation":
          return <ConfirmationCard key={part.toolCallId} part={part} disabled={handlers.disabled || !handlers.onConfirm}
            onRespond={(confirmed) => handlers.onConfirm ? handlers.onConfirm(part.toolCallId, confirmed) : Promise.resolve()} />;
        case "error":
          return <div key={index} className={styles.errorPart} role="alert">
            <p>{t(`tutor.errors.${part.code}`, { defaultValue: t("tutor.errors.generic") })}</p>
            {handlers.onRetry && <Button variant="secondary" onClick={handlers.onRetry}>{t("tutor.tryAgain")}</Button>}
          </div>;
      }
    })}
  </div>;
}
