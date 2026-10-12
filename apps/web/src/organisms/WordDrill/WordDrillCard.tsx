import type { WordDrillCard as DrillCard, WordDrillResult } from "@wordinator/contracts/lesson-document";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { playRevealSpeech, SpeechButton, useStopSpeechOnUnmount } from "../../molecules/Speech";
import { Button } from "../../ui";
import { blankExample } from "./drillSession";
import styles from "./WordDrillCard.module.css";

// Keys typed into a field, or pressed on a control that handles them itself, are not drill shortcuts.
const typing = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='combobox']"));
const control = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("button, a[href], [role='button']"));

function ProduceExample({ example, term }: { example: string; term: string }) {
  const { t } = useTranslation();
  const segments = blankExample(example, term);
  // An example the term cannot be found in (an inflected or separated form) would give the answer away, so it waits for the back.
  if (!segments) return null;
  return <p className={styles.example}>{segments.map((segment, index) => segment.blank
    ? <span key={index} className={styles.blank} role="img" aria-label={t("drill.blank")} />
    : <span key={index}>{segment.text}</span>)}</p>;
}

// One drill card (docs/words.md#a-card). Understand asks for the meaning of the term; Produce asks for the term from its meaning,
// the lesson, and the example with the term blanked. Show answer flips the card in place to the full word and speaks the term
// under the shared reveal sound toggle; Again and Got it then grade it. Space reveals, 1 is Again, and 2 is Got it.
export function WordDrillCard({ card, language, revealed, autoFocus, onReveal, onGrade }: {
  card: DrillCard; language: string; revealed: boolean; autoFocus: boolean; onReveal: () => void; onGrade: (result: WordDrillResult) => void;
}) {
  const { t } = useTranslation();
  const { word, direction } = card;
  const cardRef = useRef<HTMLElement>(null); const backRef = useRef<HTMLDivElement>(null);
  const termOwner = useId();
  useStopSpeechOnUnmount(termOwner);
  const termLabel = t("courses.speech.term", { term: word.term });
  const source = t("words.source", { course: card.course.title, lesson: card.lesson.title });
  const reveal = () => { if (revealed) return; playRevealSpeech(termOwner, word.speech.term); onReveal(); };

  // A card after the first takes focus, so the keyboard and screen readers follow the session; the answer takes it once shown.
  useLayoutEffect(() => { if (autoFocus) cardRef.current?.focus({ preventScroll: true }); }, [autoFocus]);
  useLayoutEffect(() => { if (revealed) backRef.current?.focus({ preventScroll: true }); }, [revealed]);

  const latest = useRef({ revealed, reveal, onGrade });
  latest.current = { revealed, reveal, onGrade };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return;
      const current = latest.current;
      if (!current.revealed && event.key === " " && !control(event.target)) { event.preventDefault(); current.reveal(); }
      else if (current.revealed && (event.key === "1" || event.key === "2")) { event.preventDefault(); current.onGrade(event.key === "1" ? "again" : "got"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <article ref={cardRef} tabIndex={-1} className={`${styles.card} ${revealed ? styles.flipped : ""}`} aria-label={t("drill.card")}>
    <div className={styles.faces}>
      <div className={`${styles.face} ${styles.front}`} aria-hidden={revealed || undefined} inert={revealed}>
        <p className={styles.prompt}>{direction === "understand" ? t("drill.prompt.understand") : t("drill.prompt.produce", { language })}</p>
        {direction === "understand" ? <>
          <p className={styles.term}>{word.term}</p>
          <SpeechButton url={word.speech.term} label={termLabel} owner={termOwner} />
          {word.forms && <p className={styles.forms}>{word.forms}</p>}
        </> : <>
          <p className={styles.source}>{source}</p>
          <p className={styles.meaningPrompt}><PlainText>{word.meaning}</PlainText></p>
          {word.example && <ProduceExample example={word.example} term={word.term} />}
        </>}
      </div>
      {/* The back stays empty until revealed, so nothing is spoiled. */}
      <div ref={backRef} className={`${styles.face} ${styles.back}`} aria-hidden={!revealed || undefined} inert={!revealed} tabIndex={revealed ? -1 : undefined}>
        {revealed && <>
          <p className={styles.source}>{source}</p>
          <p className={styles.backTerm}>{word.term}<SpeechButton url={word.speech.term} label={termLabel} owner={termOwner} className={styles.speech} /></p>
          {word.forms && <p className={styles.forms}>{word.forms}</p>}
          <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
          {word.example && <p className={styles.example}><PlainText>{word.example}</PlainText>
            <SpeechButton url={word.speech.example} label={t("courses.speech.wordExample", { term: word.term })} className={styles.speech} /></p>}
          {word.note && <p className={styles.note}><PlainText>{word.note}</PlainText></p>}
        </>}
      </div>
    </div>
    <div className={styles.actions}>
      {revealed ? <>
        <Button variant="secondary" aria-keyshortcuts="1" onClick={() => onGrade("again")}>{t("drill.again")}<kbd className={styles.key} aria-hidden="true">1</kbd></Button>
        <Button aria-keyshortcuts="2" onClick={() => onGrade("got")}>{t("drill.got")}<kbd className={styles.key} aria-hidden="true">2</kbd></Button>
      </> : <Button aria-keyshortcuts="Space" onClick={reveal}>{t("drill.showAnswer")}</Button>}
    </div>
  </article>;
}
