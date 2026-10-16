import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton } from "../../molecules/Speech";
import { WordBookmarkToggle } from "../WordBookmark/WordBookmark";
import styles from "./LessonWords.module.css";

export type PanelWordData = { id: string; term: string; meaning: string; forms: string | null; example: string | null; note: string | null };

// One row of the vocabulary panel: the term and meaning, and at the row's end one attached button stack of Speak (only when the
// word has a clip), Bookmark (where the word can be bookmarked), and Expand, which opens the forms, the example (its speaker only
// with audio), the note, and (for a library match) the lesson that introduced the word.
export function PanelWord({ word, termSpeech, exampleSpeech, active, className, source }: {
  word: PanelWordData; termSpeech: string | null; exampleSpeech: string | null; active?: boolean; className?: string; source?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const forms = word.forms?.trim(); const example = word.example?.trim(); const note = word.note?.trim();
  return <li className={className} aria-current={active || undefined} data-open={open || undefined}>
    <div className={styles.copy}>
      <p className={styles.term}>{word.term}</p>
      <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
      {open && <div id={detailsId} className={styles.details}>
        {forms && <p className={styles.forms}>{forms}</p>}
        {example && <p className={styles.example}><span><PlainText>{example}</PlainText></span>
          <SpeechButton url={exampleSpeech} label={t("courses.speech.wordExample", { term: word.term })} /></p>}
        {note && <p className={styles.note}><PlainText>{note}</PlainText></p>}
        {source}
      </div>}
    </div>
    <div className={styles.stack}>
      {termSpeech && <span className={styles.stackCell}><SpeechButton url={termSpeech} label={t("courses.speech.term", { term: word.term })} /></span>}
      <span className={styles.stackCell}><WordBookmarkToggle wordId={word.id} term={word.term} /></span>
      <span className={styles.stackCell}>
        <button type="button" className={styles.expand} aria-expanded={open} aria-controls={open ? detailsId : undefined}
          aria-label={t(open ? "courses.words.showLessAbout" : "courses.words.showMoreAbout", { term: word.term })} onClick={() => setOpen((value) => !value)}>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      </span>
    </div>
  </li>;
}
