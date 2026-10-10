import { BookA, X } from "lucide-react";
import { useId, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton, useSpeechResolver } from "../../molecules/Speech";
import { useRevealCurrent } from "../CourseLessons/LessonWords";
import { WordBookmarkToggle } from "../WordBookmark/WordBookmark";
import { runWords } from "../WordRecap/WordRecap";
import { IconButton } from "../../ui";
import type { LessonOverview } from "./overviewModel";
import styles from "./OverviewWords.module.css";

// The lesson's new words behind a corner button: the lesson words panel's list (term, forms, meaning, speech, bookmark) as a
// drawer. Words of the step on stage are highlighted and scrolled into view, and the button counts them while the drawer is
// closed; words the reader has not reached yet are dimmed.
export function OverviewWords({ overview, reached, active, open, onOpenChange }: {
  overview: LessonOverview; reached: number; active: ReadonlySet<string>; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const speech = useSpeechResolver();
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const words = useMemo(() => runWords(overview.steps), [overview.steps]);
  const met = useMemo(() => new Set(overview.steps.slice(0, reached).flatMap((step) => step.words.map((word) => word.id))), [overview.steps, reached]);
  const highlighted = words.filter((word) => active.has(word.id)).map((word) => word.id).join(" ");
  useRevealCurrent(listRef, open ? highlighted : "");
  const onStage = words.filter((word) => active.has(word.id)).length;
  if (!words.length) return null;
  return <>
    <button type="button" className={styles.fab} aria-expanded={open} aria-controls={id} onClick={() => onOpenChange(!open)}
      aria-label={t("courses.overview.words.toggle", { count: onStage })}>
      <BookA aria-hidden="true" />
      {onStage > 0 && !open && <span key={highlighted} className={styles.badge} aria-hidden="true">{onStage}</span>}
    </button>
    <section id={id} className={styles.drawer} aria-label={t("courses.words.title")} hidden={!open}>
      <header className={styles.header}>
        <div>
          <h2>{t("courses.words.title")}</h2>
          <p>{t("courses.overview.words.met", { met: words.filter((word) => met.has(word.id)).length, total: words.length })}</p>
        </div>
        <IconButton label={t("courses.overview.words.close")} onClick={() => onOpenChange(false)}><X aria-hidden="true" size={18} /></IconButton>
      </header>
      <ul ref={listRef} className={styles.list}>{words.map((word) => <li key={word.id} className={styles.word}
        data-ahead={!met.has(word.id) && !active.has(word.id) || undefined} aria-current={active.has(word.id) || undefined}>
        <div className={styles.head}>
          <span className={styles.term}>{word.term}</span>
          <SpeechButton url={speech(`word:${word.id}`)} label={t("courses.speech.term", { term: word.term })} />
          <span className={styles.bookmark}><WordBookmarkToggle wordId={word.id} term={word.term} /></span>
        </div>
        {word.forms && <span className={styles.forms}>{word.forms}</span>}
        <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
      </li>)}</ul>
    </section>
  </>;
}
