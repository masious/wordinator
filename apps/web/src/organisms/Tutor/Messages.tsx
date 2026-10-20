import { parseTargetSpans, type TutorComponentAnswer, type TutorConfirmationSummary, type TutorPart } from "@wordinator/contracts/tutor";
import { BookOpen, Check, ChevronDown, LoaderCircle, Sparkles, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { Avatar, Button } from "../../ui";
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
  return <div className={styles.userRow}>
    <p className={styles.userBubble} aria-label={t("tutor.you")}><PlainText>{text}</PlainText></p>
    <span className={styles.turnAvatar} role="img" aria-label={t("tutor.userAvatar")}><Avatar name={t("tutor.you")} size="100%" tone="ink" /></span>
  </div>;
}

function LessonSourceChip({ detail }: { detail: ToolResultPart["detail"] }) {
  const { t } = useTranslation();
  const lesson = typeof detail.lessonTitle === "string" ? detail.lessonTitle : null;
  if (!lesson) return null;
  const course = typeof detail.courseTitle === "string" ? detail.courseTitle : null;
  const label = course ? t("tutor.source.lessonInCourse", { lesson, course }) : t("tutor.source.lesson", { lesson });
  return <span className={styles.sourceChip} aria-label={t("tutor.source.label", { source: label })}>
    <BookOpen size={14} aria-hidden="true" /><span>{label}</span>
  </span>;
}

// A tool step: running (spinner), done (check), or failed (cross), opening to its detail.
export function ToolStep({ call, result, running, showSource = true }: { call: Pick<ToolCallPart, "name" | "toolCallId">; result: ToolResultPart | null; running: boolean; showSource?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const status: StepStatus = result ? (result.ok ? "done" : "failed") : running ? "running" : "done";
  const detail = result?.detail ?? {};
  const values = { ...Object.fromEntries(Object.entries(detail).map(([key, value]) => [key, value === null ? "" : String(value)])) };
  const label = stepLabel(call.name, status, detail, values, t, result?.error ?? null);
  const rows = Object.entries(detail).filter(([key]) => !key.endsWith("Id"));
  const expandable = status !== "running" && (rows.length > 0 || Boolean(result?.error));
  return <div className={styles.step} data-status={status}>
    <div className={styles.stepSummary}>
      <button type="button" className={styles.chip} aria-expanded={expandable ? open : undefined} aria-controls={expandable ? detailId : undefined}
        disabled={!expandable} onClick={() => setOpen((value) => !value)}>
        <span className={styles.chipIcon} aria-hidden="true">{status === "running" ? <LoaderCircle size={14} className={styles.spinner} /> : status === "done" ? <Check size={14} /> : <X size={14} />}</span>
        <span>{label}</span>
        {status === "failed" && <span className={styles.visuallyHidden}>{t("tutor.steps.failed")}</span>}
        {expandable && <ChevronDown size={14} aria-hidden="true" className={styles.chipChevron} />}
      </button>
      {showSource && result?.ok && <LessonSourceChip detail={detail} />}
    </div>
    {expandable && open && <div className={styles.stepDetail} id={detailId}>
      {result?.error && <p>{t("tutor.steps.error", { code: result.error })}</p>}
      {rows.length > 0 && <dl>{rows.map(([key, value]) => <div key={key}><dt>{t(`tutor.steps.detail.${key}`, { defaultValue: key })}</dt><dd>{value === null ? "—" : String(value)}</dd></div>)}</dl>}
    </div>}
  </div>;
}

type StepStatus = "running" | "done" | "failed";
type Translate = (key: string, options?: Record<string, unknown>) => string;

// A step's plain-words label. A failed step has no titles in its detail, so it gets its own label instead of a done label with
// empty placeholders.
function stepLabel(name: string, status: StepStatus, detail: ToolResultPart["detail"], values: Record<string, string>, t: Translate, error: string | null = null) {
  if (status === "running") return t(`tutor.steps.running.${name}`, { defaultValue: t("tutor.steps.running.default") });
  if (status === "failed" && (error === "REPEATED_CALL" || error === "SKIPPED")) return t(`tutor.steps.failedLabel.${error}`);
  if (status === "failed") return t(`tutor.steps.failedLabel.${name}`, { defaultValue: t("tutor.steps.failedLabel.default") });
  if (detail.next === false && name === "get_lesson") return t("tutor.steps.done.noNextLesson");
  return t(`tutor.steps.done.${name}`, { ...values, defaultValue: t("tutor.steps.done.default") });
}

type StepEntry = { key: number; call: Pick<ToolCallPart, "name" | "toolCallId">; result: ToolResultPart | null; running: boolean };

// Consecutive tool steps fold into one chip (Used 4 tools), closed by default, that opens to the single steps.
export function ToolSteps({ steps }: { steps: StepEntry[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (steps.length === 1) { const [step] = steps; return <ToolStep call={step!.call} result={step!.result} running={step!.running} />; }
  const running = steps.some((step) => !step.result && step.running);
  const failedCount = steps.filter((step) => step.result && !step.result.ok).length;
  const status: StepStatus = running ? "running" : "done";
  const label = running ? stepLabel(steps[steps.length - 1]!.call.name, "running", {}, {}, t) : t("tutor.steps.group", { count: steps.length });
  const sources = new Map<string, ToolResultPart["detail"]>();
  for (const step of steps) {
    if (!step.result?.ok) continue;
    const detail = step.result.detail;
    const lesson = typeof detail.lessonTitle === "string" ? detail.lessonTitle : null;
    if (!lesson) continue;
    const course = typeof detail.courseTitle === "string" ? detail.courseTitle : "";
    sources.set(`${course}\u0000${lesson}`, detail);
  }
  return <div className={styles.step} data-status={status}>
    <div className={styles.stepSummary}>
      <button type="button" className={styles.chip} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)}>
        <span className={styles.chipIcon} aria-hidden="true">{running ? <LoaderCircle size={14} className={styles.spinner} /> : <Check size={14} />}</span>
        <span>{label}</span>
        {failedCount > 0 && !running && <span className={styles.chipFailed}>{t("tutor.steps.groupFailed", { count: failedCount })}</span>}
        <ChevronDown size={14} aria-hidden="true" className={styles.chipChevron} />
      </button>
      {[...sources.values()].map((detail) => <LessonSourceChip key={`${String(detail.courseTitle)}:${String(detail.lessonTitle)}`} detail={detail} />)}
    </div>
    {open && <div className={styles.stepList} id={listId}>
      {steps.map((step) => <ToolStep key={step.key} call={step.call} result={step.result} running={step.running} showSource={false} />)}
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
      <li>{t("tutor.confirm.deletes.pronunciations", { count: summary.deletes.pronunciations })}</li>
      <li>{t("tutor.confirm.deletes.bookmarks", { count: summary.deletes.bookmarks })}</li>
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
  // Declines a waiting component: it is answered as skipped and the turn resumes (docs/ai-tutor.md#answer-components).
  onSkip?: (toolCallId: string) => Promise<unknown>;
  onRetry?: () => void;
  focusOpen?: boolean;
  // The message's open questions are answered in the question dock under the chat; here they show as one line.
  docked?: boolean;
};

// The assistant's parts, stored or streaming. Tool calls pair with their results by ID; an `ask_*` call or a confirmation's
// call is shown by its component or card instead of a chip, and consecutive chips fold into one group. The components of one
// message form a practice set: their grades stay hidden until every one is answered or skipped, then show together.
export function AssistantParts({ parts, streaming, handlers }: { parts: readonly (TutorPart | StreamPart)[]; streaming: boolean; handlers: PartHandlers }) {
  const { t } = useTranslation();
  const shownBy = new Set(parts.flatMap((part) => part.type === "component" || part.type === "confirmation" ? [part.toolCallId] : []));
  const results = new Map(parts.flatMap((part) => part.type === "tool_result" ? [[part.toolCallId, part] as const] : []));
  const calls = new Set(parts.flatMap((part) => part.type === "tool_call" ? [part.toolCallId] : []));
  const components = parts.flatMap((part) => part.type === "component" ? [part] : []);
  const open = components.filter((part) => part.answeredAt === null);
  const docked = Boolean(handlers.docked) && !streaming && open.length > 0;
  const setOpen = !streaming && components.length > 1 && open.length > 0;
  const firstOpen = open[0]?.toolCallId;
  let spanBase = 0;
  const nodes: ReactNode[] = [];
  let steps: StepEntry[] = [];
  const flushSteps = () => {
    if (steps.length) nodes.push(<ToolSteps key={`steps-${steps[0]!.key}`} steps={steps} />);
    steps = [];
  };
  parts.forEach((part, index) => {
    switch (part.type) {
      case "tool_call":
        if (shownBy.has(part.toolCallId) || part.name.startsWith("ask_")) return;
        steps.push({ key: index, call: part, result: results.get(part.toolCallId) ?? null, running: streaming });
        return;
      case "tool_result":
        if (!calls.has(part.toolCallId) && !shownBy.has(part.toolCallId)) steps.push({ key: index, call: part, result: part, running: false });
        return;
    }
    flushSteps();
    switch (part.type) {
      case "text": {
        const base = spanBase; spanBase += part.spans.length;
        nodes.push(<AssistantText key={index} text={part.text} spans={part.spans} spanBase={base} speech={handlers.speech} lang={handlers.lang} />);
        return;
      }
      case "raw_text": {
        const parsed = parseTargetSpans(part.raw);
        nodes.push(<AssistantText key={index} text={parsed.text} spans={parsed.spans} lang={handlers.lang} />);
        return;
      }
      case "component": {
        if (docked && part.answeredAt === null) {
          if (part.toolCallId === firstOpen) nodes.push(<p key="docked" className={styles.dockedLine} role="status">{t("tutor.dock.inline", { count: open.length })}</p>);
          return;
        }
        // An open set shows one question at a time: the first open one, under a progress bar. The others show once it is done.
        if (setOpen) {
          if (part.toolCallId !== firstOpen) return;
          const position = components.length - open.length + 1;
          nodes.push(<div key="set-progress" className={styles.setStatus} role="status">
            <span className={styles.setProgress}>{t("tutor.set.progress", { current: position, count: components.length })}</span>
            <span aria-hidden="true" className={styles.setTrack}><span style={{ transform: `scaleX(${(position - 1) / components.length})` }} /></span>
          </div>);
        }
        // A skipped component collapses to one muted line, like an answered card.
        if (part.skipped) nodes.push(<p key={part.toolCallId} className={styles.answeredCard} role="status">{t("tutorComponents.skipped")} · {t(`tutorComponents.kinds.${part.kind}`)}</p>);
        else {
          const { onSkip } = handlers;
          nodes.push(<AnswerComponent key={part.toolCallId} view={part.view} answer={part.answer} grade={setOpen ? null : part.grade} gradeHeld={setOpen}
            disabled={handlers.disabled || !handlers.onAnswer}
            clip={handlers.componentClip?.(part.toolCallId)} language={handlers.language} autoFocus={handlers.focusOpen && part.toolCallId === firstOpen}
            onSkip={onSkip && part.answeredAt === null ? () => onSkip(part.toolCallId) : undefined}
            onAnswer={(answer) => handlers.onAnswer ? handlers.onAnswer(part.toolCallId, answer) : undefined} />);
        }
        return;
      }
      case "confirmation":
        nodes.push(<ConfirmationCard key={part.toolCallId} part={part} disabled={handlers.disabled || !handlers.onConfirm}
          onRespond={(confirmed) => handlers.onConfirm ? handlers.onConfirm(part.toolCallId, confirmed) : Promise.resolve()} />);
        return;
      case "error":
        nodes.push(<div key={index} className={styles.errorPart} role="alert">
          <p>{t(`tutor.errors.${part.code}`, { defaultValue: t("tutor.errors.generic") })}</p>
          {handlers.onRetry && <Button variant="secondary" onClick={handlers.onRetry}>{t("tutor.tryAgain")}</Button>}
        </div>);
        return;
    }
  });
  flushSteps();
  if (streaming && nodes.length === 0) nodes.push(<p key="thinking" className={styles.thinking} role="status">{t("tutor.thinking")}</p>);
  return <div className={styles.assistantRow}>
    <span className={`${styles.turnAvatar} ${styles.tutorAvatar}`} role="img" aria-label={t("tutor.tutorAvatar")}><Sparkles size={16} aria-hidden="true" /></span>
    <article className={styles.assistantCard} aria-label={t("tutor.assistantTurn")}>
      <p className={styles.assistantMeta}><span>{t("tutor.tutorName")}</span><span aria-hidden="true">·</span><span>{t("tutor.aiLabel")}</span></p>
      <div className={styles.assistant}>{nodes}</div>
    </article>
  </div>;
}
