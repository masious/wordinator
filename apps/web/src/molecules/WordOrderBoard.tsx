import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import styles from "./WordOrderBoard.module.css";

// Word order: chunks move between the pool and the answer row by clicking (or Enter and Space on a focused chip) and by dragging.
// On the answer row, the arrow keys move the focused chip one place earlier or later. Controlled: `order` lists positions in `chunks`
// (chunks may repeat, so indexes, not text, identify them) and every change goes through `onChange`.
type Drag = { from: "pool" | "answer"; chunk: number };

export function WordOrderBoard({ chunks, order, onChange, disabled, answered, autoFocus, initialFocus, matched, label }: {
  chunks: readonly string[]; order: readonly number[]; onChange: (order: number[]) => void; disabled?: boolean;
  // A settled answer shown as inert chips instead of the pool.
  answered?: readonly string[] | null;
  // Focuses the first chip on mount; `initialFocus` only marks it with data-autofocus for a parent that moves focus itself.
  autoFocus?: boolean; initialFocus?: boolean; matched?: boolean; label?: string;
}) {
  const { t } = useTranslation();
  const [focusChunk, setFocusChunk] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const chips = useRef(new Map<number, HTMLButtonElement>());
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => { if (autoFocus) frame.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); }, [autoFocus]);
  useEffect(() => { if (focusChunk !== null) { chips.current.get(focusChunk)?.focus(); setFocusChunk(null); } }, [focusChunk, order]);
  const locked = Boolean(disabled);
  const pool = chunks.map((_, index) => index).filter((index) => !order.includes(index));
  const answerLabel = label ?? t("wordOrder.answer");

  const place = (chunk: number, at = order.length) => {
    const without = order.filter((entry) => entry !== chunk);
    const position = Math.min(at, without.length);
    onChange([...without.slice(0, position), chunk, ...without.slice(position)]);
  };
  const remove = (chunk: number) => onChange(order.filter((entry) => entry !== chunk));
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
  const firstChunk = order[0] ?? pool[0];
  const chip = (chunk: number, from: Drag["from"], position: number) => <li key={chunk}>
    <button type="button" className={styles.chipButton} disabled={locked} draggable={!locked} data-word-chip
      data-autofocus={(initialFocus && chunk === firstChunk) || undefined}
      ref={(element) => { if (element) chips.current.set(chunk, element); else chips.current.delete(chunk); }}
      aria-label={from === "pool" ? t("wordOrder.place", { chunk: chunks[chunk] }) : t("wordOrder.remove", { chunk: chunks[chunk], position: position + 1 })}
      onClick={() => { if (from === "pool") place(chunk); else remove(chunk); }}
      onKeyDown={from === "answer" ? (event) => move(event, chunk) : undefined}
      onDragStart={(event) => { drag.current = { from, chunk }; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", chunks[chunk] ?? ""); }}
      onDragOver={from === "answer" ? (event) => event.preventDefault() : undefined}
      onDrop={from === "answer" ? (event) => dropOnAnswer(event, position) : undefined}>{chunks[chunk]}</button>
  </li>;

  return <div ref={frame} className={`${styles.board} ${matched ? styles.matched : ""}`}>
    <p className={styles.rowLabel} aria-hidden="true">{answerLabel}</p>
    <ul className={`${styles.chipRow} ${styles.answerChips}`} aria-label={answerLabel}
      onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnAnswer(event)}>
      {answered ? answered.map((text, index) => <li key={index}><button type="button" className={styles.chipButton} disabled>{text}</button></li>)
        : order.map((chunk, position) => chip(chunk, "answer", position))}
    </ul>
    {!answered && <>
      <p className={styles.rowLabel}>{t("wordOrder.pool")}</p>
      <ul className={`${styles.chipRow} ${styles.poolChips}`} aria-label={t("wordOrder.pool")} data-word-pool onDragOver={(event) => event.preventDefault()} onDrop={dropOnPool}>
        {pool.map((chunk, position) => chip(chunk, "pool", position))}
      </ul>
      <p className={styles.help}>{t("wordOrder.help")}</p>
    </>}
  </div>;
}
