import { Popover } from "@mantine/core";
import type { TutorWordPracticeWord, TutorWordMark } from "@wordinator/contracts/tutor";
import { createContext, Fragment, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "./PlainText";
import styles from "./PracticeWord.module.css";

// Practice word highlights (word practice, experimental): the tutor marks the conversation's practice words in its text and
// passages, and each mark shows the word's card (term, forms, meaning, example, note) on hover or keyboard focus. The chat
// provides the conversation's words; without them, or for a number not in the list, a mark is plain text.
export const PracticeWordsContext = createContext<readonly TutorWordPracticeWord[] | null>(null);

export function PracticeWordMark({ index, card = true, children }: { index: number; card?: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  const word = useContext(PracticeWordsContext)?.[index];
  const [opened, setOpened] = useState(false);
  if (!word) return <>{children}</>;
  if (!card) return <mark className={styles.mark}>{children}</mark>;
  const open = () => setOpened(true); const close = () => setOpened(false);
  return <Popover opened={opened} onChange={setOpened} position="top" withArrow shadow="md" width="var(--size-word-card-roomy)">
    <Popover.Target>
      <mark className={styles.mark} tabIndex={0} aria-label={t("tutor.practiceWord.label", { text: typeof children === "string" ? children : word.term, term: word.term })}
        onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>{children}</mark>
    </Popover.Target>
    <Popover.Dropdown className={styles.card}>
      <p className={styles.term}>{word.term}{word.forms && <span className={styles.forms}>{word.forms}</span>}</p>
      {word.meaning && <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>}
      {word.example && <p className={styles.example}><PlainText>{word.example}</PlainText></p>}
      {word.note && <p className={styles.note}><PlainText>{word.note}</PlainText></p>}
    </Popover.Dropdown>
  </Popover>;
}

// Text with practice word marks (offsets into `text`), for plain passages; marks show their card when `card` is set.
export function MarkedPassage({ text, marks, card = true }: { text: string; marks: readonly TutorWordMark[]; card?: boolean }) {
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const mark of [...marks].sort((left, right) => left.start - right.start)) {
    if (mark.start < cursor || mark.end > text.length) continue;
    if (mark.start > cursor) pieces.push(<Fragment key={cursor}><PlainText>{text.slice(cursor, mark.start)}</PlainText></Fragment>);
    pieces.push(<PracticeWordMark key={`mark-${mark.start}`} index={mark.index} card={card}>{text.slice(mark.start, mark.end)}</PracticeWordMark>);
    cursor = mark.end;
  }
  if (cursor < text.length) pieces.push(<Fragment key={cursor}><PlainText>{text.slice(cursor)}</PlainText></Fragment>);
  return <>{pieces}</>;
}
