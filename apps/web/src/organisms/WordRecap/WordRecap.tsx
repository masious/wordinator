import type { CourseWord, LessonStep } from "@wordinator/contracts/lesson-document";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { Button } from "../../ui";
import styles from "./WordRecap.module.css";

export type RecapWord = Omit<CourseWord, "lessonId">;

// The words a lesson run carried, once each in step order, with empty optional fields as null like the course recap.
export function runWords(steps: readonly LessonStep[]): RecapWord[] {
  const seen = new Set<string>();
  return steps.flatMap((step) => step.words).filter((word) => !seen.has(word.id) && Boolean(seen.add(word.id))).map((word) => ({
    id: word.id, term: word.term.trim(), meaning: word.meaning.trim(),
    forms: word.forms?.trim() || null, example: word.example?.trim() || null, note: word.note?.trim() || null,
  }));
}

// A slideshow of word cards: the term and forms first, Show meaning reveals the meaning, example, and note. Back and Next move
// freely and nothing is graded, recorded, or counted. Callers render it only when there is at least one word.
export function WordRecap({ words, doneLabel, onDone }: { words: readonly RecapWord[]; doneLabel: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0); const [shown, setShown] = useState(false);
  const word = words[Math.min(index, words.length - 1)];
  if (!word) return null;
  const last = index >= words.length - 1;
  const go = (next: number) => { setIndex(next); setShown(false); };
  return <div className={styles.recap}>
    <p className={styles.counter}>{t("courses.words.counter", { current: index + 1, total: words.length })}</p>
    <article className={styles.card} key={word.id} aria-label={word.term}>
      <p className={styles.term}>{word.term}</p>
      {word.forms && <p className={styles.forms}>{word.forms}</p>}
      {shown
        ? <div className={styles.answer}>
          <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
          {word.example && <p className={styles.example}><PlainText>{word.example}</PlainText></p>}
          {word.note && <p className={styles.note}><PlainText>{word.note}</PlainText></p>}
        </div>
        : <Button variant="secondary" className={styles.reveal} onClick={() => setShown(true)}>{t("courses.words.showMeaning")}</Button>}
    </article>
    <div className={styles.nav}>
      <Button variant="quiet" disabled={index === 0} onClick={() => go(index - 1)}>{t("common.back")}</Button>
      {last ? <Button onClick={onDone}>{doneLabel}</Button> : <Button onClick={() => go(index + 1)}>{t("common.next")}</Button>}
    </div>
  </div>;
}
