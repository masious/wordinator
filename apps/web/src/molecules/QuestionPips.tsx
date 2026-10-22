import styles from "./QuestionPips.module.css";

export type QuestionPipState = "open" | "answered" | "skipped" | "done" | "missed";
export type QuestionPipItem = { id: string; label: string; state: QuestionPipState };

// A compact, keyboard-focusable status marker for a sequence of questions or practices.
export function QuestionPips({ items, current, label, disabled, onSelect }: {
  items: readonly QuestionPipItem[]; current: number; label: string; disabled?: boolean; onSelect: (index: number) => void;
}) {
  return <ol className={styles.pips} aria-label={label}>
    {items.map((item, index) => <li key={item.id}>
      <button type="button" className={styles.pip} data-state={item.state} aria-current={index === current ? "step" : undefined}
        aria-label={item.label} disabled={disabled} onClick={() => onSelect(index)} />
    </li>)}
  </ol>;
}
