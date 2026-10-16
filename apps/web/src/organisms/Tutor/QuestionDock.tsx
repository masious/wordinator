import type { TutorComponentAnswer, TutorPart, TutorSetAnswer } from "@wordinator/contracts/tutor";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton } from "../../ui";
import { AnswerComponent, DraftContext, type ClipSource, type DraftMode } from "../TutorComponents";
import styles from "./Tutor.module.css";

type OpenComponent = Extract<TutorPart, { type: "component" }>;
type Draft = { answer: TutorComponentAnswer } | { skip: true };
type Submitter = { ready: boolean; submit: () => void };

// Kinds whose own action (a picked option, Enter in a typed answer) moves to the next question; a review or a spoken answer stays
// so its result can be read first.
const ADVANCES = new Set(["choice", "fill_in", "translate", "dictation", "fix_mistake"]);

// The question dock (docs/ai-tutor.md#practice-sets): while the tutor's last message has open questions, it replaces the composer.
// One question shows at a time under its position and step pips; answers are drafts the learner can revisit with Previous or a
// pip, Skip marks one skipped, and Next becomes Check answers on the last question, which sends the whole set at once (questions
// left unanswered go as skips). The questions stay mounted while hidden, so what was typed survives moving between them.
// Minimized, the dock keeps only its head (position, pips, and the toggle), leaving the chat's height to earlier messages; the
// questions stay mounted then too, and a pip or the toggle brings them back where the learner left off.
export function QuestionDock({ components, onSubmit, clip, language, disabled }: {
  components: readonly OpenComponent[]; onSubmit: (answers: TutorSetAnswer[]) => Promise<unknown>;
  clip?: (toolCallId: string) => ClipSource | undefined; language: string; disabled: boolean;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bodyId = useId();
  const draftsRef = useRef(drafts);
  const submitters = useRef(new Map<string, Submitter>());
  const stepping = useRef(false);
  const count = components.length;
  const last = index === count - 1;
  const current = components[index]!;

  const write = (next: Record<string, Draft>) => { draftsRef.current = next; setDrafts(next); };
  const save = useCallback((toolCallId: string, kind: string, answer: TutorComponentAnswer) => {
    write({ ...draftsRef.current, [toolCallId]: { answer } });
    // An answer given inside the question (not through Next) moves on by itself where that reads naturally.
    if (!stepping.current && ADVANCES.has(kind)) setIndex((position) => Math.min(position + 1, count - 1));
  }, [count]);
  const modes = useMemo(() => new Map(components.map((part): [string, DraftMode] => [part.toolCallId, {
    register: (entry) => {
      if (entry) submitters.current.set(part.toolCallId, entry); else submitters.current.delete(part.toolCallId);
      const value = entry?.ready ?? false;
      setReady((state) => state[part.toolCallId] === value ? state : { ...state, [part.toolCallId]: value });
    },
  }])), [components]);

  // Saves what the current question holds (its Check row's submit), when it has an answer ready.
  const saveCurrent = () => {
    const submitter = submitters.current.get(current.toolCallId);
    if (!submitter?.ready) return;
    stepping.current = true;
    try { submitter.submit(); } finally { stepping.current = false; }
  };
  const go = (position: number) => { saveCurrent(); setIndex(Math.max(0, Math.min(position, count - 1))); setMinimized(false); };
  // A lone question's Skip sends it at once; in a set it marks the question and moves on.
  const skip = () => {
    write({ ...draftsRef.current, [current.toolCallId]: { skip: true } });
    if (count === 1) void send(false); else if (!last) setIndex(index + 1);
  };
  const send = async (withCurrent = true) => {
    if (withCurrent) saveCurrent();
    const answers = components.map((part): TutorSetAnswer => {
      const draft = draftsRef.current[part.toolCallId];
      return draft && "answer" in draft ? { toolCallId: part.toolCallId, answer: draft.answer } : { toolCallId: part.toolCallId, skip: true };
    });
    setSending(true); setFailed(false);
    try { await onSubmit(answers); } catch { setFailed(true); } finally { setSending(false); }
  };

  const state = (part: OpenComponent) => {
    const draft = drafts[part.toolCallId];
    return draft ? ("skip" in draft ? "skipped" : "answered") : ready[part.toolCallId] ? "answered" : "open";
  };
  const currentReady = Boolean(ready[current.toolCallId]) || state(current) === "answered";
  const unanswered = components.filter((part) => part !== current && state(part) !== "answered").length + (currentReady ? 0 : 1);
  const locked = disabled || sending;

  return <section className={styles.dock} aria-label={t("tutor.dock.label")} data-minimized={minimized || undefined}>
    <div className={styles.dockHead}>
      <p className={styles.dockPosition} role="status">{count > 1 ? t("tutor.dock.position", { current: index + 1, count }) : t("tutor.dock.single")}</p>
      <div className={styles.dockTools}>
        {count > 1 && <ol className={styles.dockPips}>
          {components.map((part, position) => <li key={part.toolCallId}>
            <button type="button" className={styles.dockPip} data-state={state(part)} aria-current={position === index ? "step" : undefined} disabled={locked}
              aria-label={t("tutor.dock.goTo", { number: position + 1, state: t(`tutor.dock.states.${state(part)}`) })} onClick={() => go(position)} />
          </li>)}
        </ol>}
        <IconButton tone="quiet" label={minimized ? t("tutor.dock.expand") : t("tutor.dock.minimize")} aria-expanded={!minimized} aria-controls={bodyId}
          onClick={() => setMinimized((value) => !value)}>
          {minimized ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </IconButton>
      </div>
    </div>
    <div className={styles.dockBody} id={bodyId}>
      {components.map((part, position) => <div key={part.toolCallId} hidden={position !== index}>
        <DraftContext.Provider value={modes.get(part.toolCallId)!}>
          <AnswerComponent view={part.view} answer={null} grade={null} gradeHeld disabled={locked} clip={clip?.(part.toolCallId)} language={language}
            autoFocus={position === index} onAnswer={(answer) => save(part.toolCallId, part.kind, answer)} />
        </DraftContext.Provider>
        {state(part) === "skipped" && <p className={styles.dockNote}>{t("tutor.dock.skipped")}</p>}
      </div>)}
    </div>
    <div className={styles.dockFoot}>
      {count > 1 && <Button variant="quiet" disabled={index === 0 || locked} onClick={() => go(index - 1)}><ArrowLeft size={16} aria-hidden="true" />{t("tutor.dock.previous")}</Button>}
      <span className={styles.dockSpacer} />
      {last && unanswered > 0 && count > 1 && <p className={styles.dockNote}>{t("tutor.dock.unanswered", { count: unanswered })}</p>}
      {failed && <p className={styles.errorLine} role="alert">{t("tutor.dock.failed")}</p>}
      {state(current) !== "skipped" && <Button variant="quiet" disabled={locked} onClick={skip}>{t("tutor.dock.skip")}</Button>}
      {last
        ? <Button loading={sending} disabled={locked || (count === 1 ? !currentReady : unanswered === count)} onClick={() => void send()} trailingIcon={<Check size={16} />}>
          {count > 1 ? t("tutor.dock.checkAll") : t("tutorComponents.check")}
        </Button>
        : <Button variant="secondary" disabled={locked} onClick={() => go(index + 1)} trailingIcon={<ArrowRight size={16} />}>{t("tutor.dock.next")}</Button>}
    </div>
  </section>;
}
