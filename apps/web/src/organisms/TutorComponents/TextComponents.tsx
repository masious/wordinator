import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListenStatusLine, SpeakButton } from "../../molecules/SpeakControls";
import { SENTENCE_ANSWER_WINDOW, useSpokenAnswer } from "../../molecules/speechRecognition";
import { TextAreaField, TextField } from "../../ui";
import { ClipButton } from "./ClipButton";
import { ComponentFrame, GradePending, GradeResult, plainEnter, SubmitRow, useAnswerFlow } from "./shared";
import type { AnswerComponentProps } from "./types";
import styles from "./TutorComponents.module.css";

// Typed answers: Fill in the blank, Translate into Dutch (also spoken), Dictation, and Fix the mistake.

function useFocusOnMount<T extends HTMLElement>(autoFocus: boolean | undefined) {
  const ref = useRef<T | null>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus({ preventScroll: true }); }, [autoFocus]);
  return ref;
}

// The prompt with each … blank shown as an underlined gap, numbered when there are several.
function BlankPrompt({ prompt, blanks }: { prompt: string; blanks: number }) {
  const { t } = useTranslation();
  const pieces = prompt.split("…");
  return <p className={styles.prompt}>{pieces.map((piece, index) => <span key={index}>{piece}
    {index < pieces.length - 1 && <span className={styles.blank} role="img" aria-label={t("tutorComponents.blankLabel", { number: index + 1 })}>{blanks > 1 ? index + 1 : ""}</span>}
  </span>)}</p>;
}

export function FillInComponent({ view, answer, grade, onAnswer, disabled, autoFocus }: AnswerComponentProps<"fill_in">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const [values, setValues] = useState<string[]>(() => answer?.blanks ?? Array.from({ length: view.blanks }, () => ""));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (autoFocus) inputs.current[0]?.focus({ preventScroll: true }); }, [autoFocus]);
  const shown = flow.answered?.blanks ?? values;
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  const ready = values.every((value) => value.trim());
  const submit = () => { if (!locked && ready) void flow.submit({ kind: "fill_in", blanks: values.map((value) => value.trim()) }); };
  return <ComponentFrame kind="fill_in">
    <BlankPrompt prompt={view.prompt} blanks={view.blanks} />
    {view.translation && <p className={styles.muted}>{view.translation}</p>}
    <div className={`${styles.fields} ${grade?.correct ? styles.matched : ""}`}>
      {shown.map((value, index) => <TextField key={index} ref={(input) => { inputs.current[index] = input; }} value={value} disabled={locked} maxLength={200}
        label={view.blanks > 1 ? t("tutorComponents.blankLabel", { number: index + 1 }) : t("tutorComponents.yourAnswer")}
        onChange={(event) => { const text = event.currentTarget.value; setValues((current) => current.map((entry, position) => position === index ? text : entry)); }}
        onKeyDown={(event) => { if (!plainEnter(event)) return; event.preventDefault(); if (index < view.blanks - 1) inputs.current[index + 1]?.focus(); else submit(); }} />)}
    </div>
    {grade ? <GradeResult kind="fill_in" grade={grade} /> : flow.answered ? <GradePending />
      : <SubmitRow disabled={locked || !ready} pending={flow.pending} failed={flow.failed} onSubmit={submit} />}
  </ComponentFrame>;
}

// One typed sentence: the shared body of Translate, Dictation, and Fix the mistake. `spoken` adds a microphone whose answer
// (in the scope's recognizer, with a sentence-long window) fills the field for the learner to check and send.
function SentenceAnswer({ kind, initial, label, answerText, grade, locked, pending, failed, spoken, autoFocus, onSubmit }: {
  kind: "translate" | "dictation" | "fix_mistake"; initial: string; label: string; answerText: string | null; grade: AnswerComponentProps<"translate">["grade"];
  locked: boolean; pending: boolean; failed: boolean; spoken: boolean; autoFocus?: boolean; onSubmit: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  const field = useFocusOnMount<HTMLTextAreaElement>(autoFocus);
  const listening = useSpokenAnswer("", (heard) => setText(heard.heard), undefined, SENTENCE_ANSWER_WINDOW);
  const ready = text.trim().length > 0;
  const submit = () => { if (!locked && ready) onSubmit(text.trim()); };
  return <>
    <div className={`${styles.answerRow} ${grade?.correct ? styles.matched : ""}`}>
      <TextAreaField ref={field} label={label} value={answerText ?? text} disabled={locked} autosize minRows={2} maxLength={1000}
        onChange={(event) => setText(event.currentTarget.value)} onKeyDown={(event) => { if (plainEnter(event)) { event.preventDefault(); submit(); } }} />
      {spoken && listening.available && !locked && <SpeakButton state={listening} onListen={listening.listen} compact />}
    </div>
    {spoken && listening.available && !locked && <ListenStatusLine status={listening.status} />}
    {grade ? <GradeResult kind={kind} grade={grade} /> : answerText !== null ? <GradePending />
      : <SubmitRow disabled={locked || !ready} pending={pending} failed={failed} onSubmit={submit} label={t("tutorComponents.check")} />}
  </>;
}

export function TranslateComponent({ view, answer, grade, onAnswer, disabled, autoFocus }: AnswerComponentProps<"translate">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  return <ComponentFrame kind="translate">
    <p className={styles.prompt}>{view.source}</p>
    <SentenceAnswer kind="translate" initial="" label={t("tutorComponents.translation")} answerText={flow.answered?.text ?? null} grade={grade} locked={locked}
      pending={flow.pending} failed={flow.failed} spoken autoFocus={autoFocus} onSubmit={(text) => void flow.submit({ kind: "translate", text })} />
  </ComponentFrame>;
}

export function DictationComponent({ view, answer, grade, onAnswer, disabled, clip, autoFocus }: AnswerComponentProps<"dictation">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  return <ComponentFrame kind="dictation">
    <div className={styles.promptRow}>
      <p className={styles.muted}>{t("tutorComponents.dictationPrompt")}</p>
      {clip && <ClipButton clip={clip} label={t("tutorComponents.audio.play")} />}
    </div>
    {view.translation && <p className={styles.muted}>{t("tutorComponents.meaning", { meaning: view.translation })}</p>}
    <SentenceAnswer kind="dictation" initial="" label={t("tutorComponents.whatYouHeard")} answerText={flow.answered?.text ?? null} grade={grade} locked={locked}
      pending={flow.pending} failed={flow.failed} spoken={false} autoFocus={autoFocus} onSubmit={(text) => void flow.submit({ kind: "dictation", text })} />
  </ComponentFrame>;
}

export function FixMistakeComponent({ view, answer, grade, onAnswer, disabled, autoFocus }: AnswerComponentProps<"fix_mistake">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  const hintId = useId();
  return <ComponentFrame kind="fix_mistake">
    <p className={styles.prompt}>{view.sentence}</p>
    {view.hint && <p className={styles.muted} id={hintId}>{t("tutorComponents.hint", { hint: view.hint })}</p>}
    <SentenceAnswer kind="fix_mistake" initial={view.sentence} label={t("tutorComponents.corrected")} answerText={flow.answered?.text ?? null} grade={grade} locked={locked}
      pending={flow.pending} failed={flow.failed} spoken={false} autoFocus={autoFocus} onSubmit={(text) => void flow.submit({ kind: "fix_mistake", text })} />
  </ComponentFrame>;
}
