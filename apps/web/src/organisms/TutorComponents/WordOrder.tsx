import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ComponentFrame, GradePending, GradeResult, HintRow, MarkedText, SubmitRow, useAnswerFlow } from "./shared";
import type { AnswerComponentProps } from "./types";
import styles from "./TutorComponents.module.css";

// Word order: chunks move between the pool and the answer row by clicking (or Enter and Space on a focused chip) and by dragging.
// On the answer row, the arrow keys move the focused chip one place earlier or later.
type Drag = { from: "pool" | "answer"; chunk: number };

export function WordOrderComponent({ view, answer, grade, onAnswer, disabled, autoFocus }: AnswerComponentProps<"word_order">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  // Positions refer to `view.chunks` (chunks may repeat, so indexes, not text, identify them).
  const [order, setOrder] = useState<number[]>([]);
  const [focusChunk, setFocusChunk] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const chips = useRef(new Map<number, HTMLButtonElement>());
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => { if (autoFocus) frame.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); }, [autoFocus]);
  useEffect(() => { if (focusChunk !== null) { chips.current.get(focusChunk)?.focus(); setFocusChunk(null); } }, [focusChunk, order]);
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  const pool = view.chunks.map((_, index) => index).filter((index) => !order.includes(index));

  const place = (chunk: number, at = order.length) => setOrder((current) => {
    const without = current.filter((entry) => entry !== chunk);
    const position = Math.min(at, without.length);
    return [...without.slice(0, position), chunk, ...without.slice(position)];
  });
  const remove = (chunk: number) => setOrder((current) => current.filter((entry) => entry !== chunk));
  const move = (event: KeyboardEvent<HTMLButtonElement>, chunk: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = order.indexOf(chunk); const next = index + (event.key === "ArrowLeft" ? -1 : 1);
    if (next < 0 || next >= order.length) return;
    place(chunk, next); setFocusChunk(chunk);
  };
  const dropOnAnswer = (event: DragEvent, at?: number) => {
    event.preventDefault(); event.stopPropagation();
    if (drag.current && !locked) place(drag.current.chunk, at);
    drag.current = null;
  };
  const dropOnPool = (event: DragEvent) => {
    event.preventDefault();
    if (drag.current?.from === "answer" && !locked) remove(drag.current.chunk);
    drag.current = null;
  };
  const chip = (chunk: number, from: Drag["from"], position: number) => <li key={chunk}>
    <button type="button" className={styles.chipButton} disabled={locked} draggable={!locked}
      ref={(element) => { if (element) chips.current.set(chunk, element); else chips.current.delete(chunk); }}
      aria-label={from === "pool" ? t("tutorComponents.wordOrder.place", { chunk: view.chunks[chunk] }) : t("tutorComponents.wordOrder.remove", { chunk: view.chunks[chunk], position: position + 1 })}
      onClick={() => { if (from === "pool") place(chunk); else remove(chunk); }}
      onKeyDown={from === "answer" ? (event) => move(event, chunk) : undefined}
      onDragStart={(event) => { drag.current = { from, chunk }; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", view.chunks[chunk] ?? ""); }}
      onDragOver={from === "answer" ? (event) => event.preventDefault() : undefined}
      onDrop={from === "answer" ? (event) => dropOnAnswer(event, position) : undefined}>{view.chunks[chunk]}</button>
  </li>;

  const shownAnswer = flow.answered ? flow.answered.chunks : null;
  return <ComponentFrame kind="word_order">
    <div ref={frame} className={styles.grade}>
      {view.translation && <p className={styles.prompt}><MarkedText text={view.translation} /></p>}
      <HintRow />
      <p className={styles.rowLabel} aria-hidden="true">{t("tutorComponents.wordOrder.answer")}</p>
      <ul className={`${styles.chipRow} ${styles.answerChips}`} aria-label={t("tutorComponents.wordOrder.answer")}
        onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnAnswer(event)}>
        {shownAnswer ? shownAnswer.map((text, index) => <li key={index}><button type="button" className={styles.chipButton} disabled>{text}</button></li>)
          : order.map((chunk, position) => chip(chunk, "answer", position))}
      </ul>
      {!shownAnswer && <>
        <p className={styles.rowLabel}>{t("tutorComponents.wordOrder.pool")}</p>
        <ul className={`${styles.chipRow} ${styles.poolChips}`} aria-label={t("tutorComponents.wordOrder.pool")} onDragOver={(event) => event.preventDefault()} onDrop={dropOnPool}>
          {pool.map((chunk, position) => chip(chunk, "pool", position))}
        </ul>
        <p className={styles.muted}>{t("tutorComponents.wordOrder.help")}</p>
      </>}
    </div>
    {grade ? <GradeResult kind="word_order" grade={grade} /> : flow.answered ? <GradePending />
      : <SubmitRow disabled={locked || pool.length > 0} pending={flow.pending} failed={flow.failed}
        onSubmit={() => void flow.submit({ kind: "word_order", chunks: order.map((chunk) => view.chunks[chunk]!) })} />}
  </ComponentFrame>;
}
