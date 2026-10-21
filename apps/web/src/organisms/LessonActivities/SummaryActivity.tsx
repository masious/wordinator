import type { LessonActivityViewPayload } from "@wordinator/contracts/lesson-activities";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Surface } from "../../ui";
import { WordList } from "../CourseLessons/WordList";
import styles from "./SummaryActivity.module.css";

export type SummaryPayload = Extract<LessonActivityViewPayload, { type: "story_summary" }>;
type Side = "dutch" | "english";

// The story summary: an optional image header, the story's Dutch and English sentences side by side, and the new words on the left.
// Hovering or focusing a sentence highlights its pair in both columns; each sentence names its pair for assistive technology.
export function SummaryActivity({ payload, completing, onComplete }: { payload: SummaryPayload; completing: boolean; onComplete: () => void }) {
  const { t } = useTranslation();
  const ids = useId();
  const [pair, setPair] = useState<number | null>(null);
  const headings = { words: `${ids}-words`, dutch: `${ids}-dutch`, english: `${ids}-english` };

  const sentence = (side: Side, index: number, text: string) => {
    const other: Side = side === "dutch" ? "english" : "dutch";
    return <span id={`${ids}-${side}-${index}`} lang={side === "dutch" ? "nl" : "en"} tabIndex={0} data-pair={index}
      aria-describedby={`${ids}-${other}-${index}`} className={pair === index ? styles.highlighted : undefined}
      onMouseEnter={() => setPair(index)} onMouseLeave={() => setPair(null)} onFocus={() => setPair(index)} onBlur={() => setPair(null)}>{text}</span>;
  };

  return <Surface className={styles.summary}>
    {payload.image && <img className={styles.image} src={payload.image.url} alt={payload.image.alt} />}
    <div className={styles.columns}>
      <section className={styles.words} aria-labelledby={headings.words}>
        <h2 id={headings.words}>{t("courses.words.title")}</h2>
        <WordList items={payload.newWords} />
      </section>
      <section className={styles.column} aria-labelledby={headings.dutch}>
        <h2 id={headings.dutch}>{t("lessonActivities.dutch")}</h2>
        <ol className={styles.sentences}>
          {payload.pairs.map((item, index) => <li key={index}>{sentence("dutch", index, item.dutch)}</li>)}
        </ol>
      </section>
      <section className={styles.column} aria-labelledby={headings.english}>
        <h2 id={headings.english}>{t("lessonActivities.english")}</h2>
        <ol className={styles.sentences}>
          {payload.pairs.map((item, index) => <li key={index}>{sentence("english", index, item.english)}</li>)}
        </ol>
      </section>
    </div>
    <div className={styles.actions}><Button loading={completing} onClick={onComplete}>{t("lessonActivities.done")}</Button></div>
  </Surface>;
}
