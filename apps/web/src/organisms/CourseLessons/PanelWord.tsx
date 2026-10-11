import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton } from "../../molecules/Speech";
import { WordBookmarkToggle } from "../WordBookmark/WordBookmark";
import styles from "./LessonWords.module.css";

export type PanelWordData = { id: string; term: string; meaning: string; forms: string | null; example: string | null; note: string | null };

// One row of the New words panel: the term with its pronunciation and meaning, and a chevron that opens the forms, example,
// note, bookmark toggle, and (for a library match) the lesson that introduced the word.
export function PanelWord({ word, termSpeech, exampleSpeech, active, className, source }: {
  word: PanelWordData; termSpeech: string | null; exampleSpeech: string | null; active?: boolean; className?: string; source?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const forms = word.forms?.trim(); const example = word.example?.trim(); const note = word.note?.trim();
  return <li className={className} aria-current={active || undefined} data-open={open || undefined}>
    <p className={styles.head}><span className={styles.term}>{word.term}</span>
      <SpeechButton url={termSpeech} label={t("courses.speech.term", { term: word.term })} />
      <button type="button" className={styles.expand} aria-expanded={open} aria-controls={open ? detailsId : undefined}
        aria-label={t(open ? "courses.words.showLessAbout" : "courses.words.showMoreAbout", { term: word.term })} onClick={() => setOpen((value) => !value)}>
        <ChevronDown aria-hidden="true" size={16} />
      </button></p>
    <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
    {open && <div id={detailsId} className={styles.details}>
      {forms && <p className={styles.forms}>{forms}</p>}
      {example && <p className={styles.example}><span><PlainText>{example}</PlainText></span>
        <SpeechButton url={exampleSpeech} label={t("courses.speech.wordExample", { term: word.term })} /></p>}
      {note && <p className={styles.note}><PlainText>{note}</PlainText></p>}
      <div className={styles.footer}>{source}<span className={styles.bookmark}><WordBookmarkToggle wordId={word.id} term={word.term} /></span></div>
    </div>}
  </li>;
}
