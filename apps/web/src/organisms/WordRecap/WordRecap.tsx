import type { CourseWord, LessonStep } from "@wordinator/contracts/lesson-document";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton, useSpeechResolver } from "../../molecules/Speech";
import { Button } from "../../ui";
import { WordBookmarkToggle } from "../WordBookmark/WordBookmark";
import { measureFit, type GridFit } from "./fitGrid";
import styles from "./WordRecap.module.css";

// Words from several lessons (the course recap, the Words tab) carry their lesson, since word IDs are unique only within a lesson.
// Words read from a lesson document carry no speech; the lesson's speech map holds theirs.
export type RecapWord = Omit<CourseWord, "lessonId" | "speech"> & { lessonId?: string; speech?: CourseWord["speech"] };

// The words a lesson run carried, once each in step order, with empty optional fields as null like the course recap.
export function runWords(steps: readonly LessonStep[]): RecapWord[] {
  const seen = new Set<string>();
  return steps.flatMap((step) => step.words).filter((word) => !seen.has(word.id) && Boolean(seen.add(word.id))).map((word) => ({
    id: word.id, term: word.term.trim(), meaning: word.meaning.trim(),
    forms: word.forms?.trim() || null, example: word.example?.trim() || null, note: word.note?.trim() || null,
  }));
}

// Fits the card grid to the space its frame leaves, remeasuring when the recap, its frame, or the viewport changes size.
function useGridFit() {
  const recapRef = useRef<HTMLDivElement>(null); const gridRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<GridFit>({ columns: 1, rows: 1 });
  useLayoutEffect(() => {
    const recap = recapRef.current; const grid = gridRef.current;
    if (!recap || !grid) return;
    const measure = () => {
      const next = measureFit(grid, recap);
      setFit((current) => current.columns === next.columns && current.rows === next.rows ? current : next);
    };
    measure();
    const frame = recap.closest<HTMLElement>(".mantine-Modal-content");
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    for (const element of [recap, grid, frame]) if (element) observer?.observe(element);
    // A dialog's or page's entry motion moves the recap without resizing anything, so measure again once it settles.
    document.addEventListener("transitionend", measure); document.addEventListener("animationend", measure);
    window.addEventListener("resize", measure); window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      document.removeEventListener("transitionend", measure); document.removeEventListener("animationend", measure);
      window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);
  return { recapRef, gridRef, size: fit.columns * fit.rows };
}

// A word's identity on a page: its lesson and ID where the lesson is known, since word IDs are unique only within a lesson.
const wordKey = (word: RecapWord) => word.lessonId ? `${word.lessonId}:${word.id}` : word.id;

function WordCard({ word, source, shown, opened, onToggle }: { word: RecapWord; source: string | null; shown: boolean; opened: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  // Indexed words (course recap, Words tab) carry their clips; a lesson run's words take them from the lesson's speech scope.
  const resolve = useSpeechResolver();
  const termSpeech = word.speech ? word.speech.term : resolve(`word:${word.id}`);
  const exampleSpeech = word.speech ? word.speech.example : resolve(`wordExample:${word.id}`);
  const termLabel = t("courses.speech.term", { term: word.term });
  return <article className={`${styles.card} ${shown ? styles.flipped : ""}`} aria-label={word.term}>
    <div className={styles.faces}>
      <div className={`${styles.face} ${styles.front}`} aria-hidden={shown || undefined} inert={shown}>
        {source && <p className={styles.source}>{source}</p>}
        <p className={styles.term}>{word.term}</p>
        <SpeechButton url={termSpeech} label={termLabel} />
        {word.forms && <p className={styles.forms}>{word.forms}</p>}
      </div>
      {/* The back stays empty until first revealed, so nothing is spoiled; it then keeps its text to show while flipping back. */}
      <div className={`${styles.face} ${styles.back}`} aria-hidden={!shown || undefined} inert={!shown} tabIndex={shown ? 0 : undefined}>
        {opened && <>
          <p className={styles.backTerm}>{word.term}{word.forms && <span className={styles.forms}> · {word.forms}</span>}
            <SpeechButton url={termSpeech} label={termLabel} className={styles.speech} /></p>
          <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
          {word.example && <p className={styles.example}><PlainText>{word.example}</PlainText>
            <SpeechButton url={exampleSpeech} label={t("courses.speech.wordExample", { term: word.term })} className={styles.speech} /></p>}
          {word.note && <p className={styles.note}><PlainText>{word.note}</PlainText></p>}
        </>}
      </div>
    </div>
    <div className={styles.footer}>
      <Button variant="secondary" onClick={onToggle}>{shown ? t("courses.words.hideMeaning") : t("courses.words.showMeaning")}</Button>
      <span className={styles.bookmark}><WordBookmarkToggle wordId={word.id} lessonId={word.lessonId} term={word.term} /></span>
    </div>
  </article>;
}

// Words that arrive in pages (the Words tab): whether more exist, and how to ask for them.
export type MoreWords = { hasMore: boolean; loading: boolean; onLoad: () => void };

// Pages of word cards sized to fit without scrolling. Each card flips in place to reveal its meaning, example, and note, and Show
// all reveals the page. Back and Next move by a page; the last page offers the done action when there is one. With `more`, the
// next words load while the reader is a page away from the end, and the total is not shown until every word has loaded. Nothing is
// graded, recorded, or counted. Callers render it only when there is at least one word.
export function WordRecap({ words, doneLabel, onDone, source, more }: {
  words: readonly RecapWord[]; doneLabel?: string; onDone?: () => void; source?: (word: RecapWord) => string | null; more?: MoreWords;
}) {
  const { t } = useTranslation();
  const { recapRef, gridRef, size } = useGridFit();
  // The first word shown; a page always starts at a multiple of the page size, so resizing keeps that word in view.
  const [first, setFirst] = useState(0);
  const start = Math.floor(Math.min(first, Math.max(words.length - 1, 0)) / size) * size;
  const page = words.slice(start, start + size);
  // Reveals belong to the page they were made on: moving away or resizing resets them.
  const [reveals, setReveals] = useState<{ start: number; shown: ReadonlySet<string>; opened: ReadonlySet<string> }>({ start: 0, shown: new Set(), opened: new Set() });
  const shown = reveals.start === start ? reveals.shown : new Set<string>();
  const opened = reveals.start === start ? reveals.opened : new Set<string>();
  const reveal = (keys: readonly string[], show: boolean) => {
    const nextShown = new Set(shown);
    for (const key of keys) if (show) nextShown.add(key); else nextShown.delete(key);
    setReveals({ start, shown: nextShown, opened: show ? new Set([...opened, ...keys]) : opened });
  };
  const allShown = page.every((word) => shown.has(wordKey(word)));
  const loadedEnd = start + size >= words.length;
  const last = loadedEnd && !more?.hasMore;
  const go = (next: number) => { setFirst(next); setReveals({ start: -1, shown: new Set(), opened: new Set() }); };
  const end = start + page.length;
  const wantsMore = Boolean(more?.hasMore && !more.loading && start + size * 2 >= words.length);
  const onLoad = more?.onLoad;
  useEffect(() => { if (wantsMore) onLoad?.(); }, [wantsMore, onLoad]);
  const counter = more?.hasMore
    ? page.length > 1 ? t("courses.words.rangeOpen", { first: start + 1, last: end }) : t("courses.words.counterOpen", { current: start + 1 })
    : page.length > 1 ? t("courses.words.range", { first: start + 1, last: end, total: words.length }) : t("courses.words.counter", { current: start + 1, total: words.length });
  return <div className={styles.recap} ref={recapRef}>
    <div className={styles.toolbar}>
      <p className={styles.counter}>{counter}</p>
      {page.length > 1 && <Button variant="quiet" onClick={() => reveal(page.map(wordKey), !allShown)}>
        {allShown ? t("courses.words.hideAll") : t("courses.words.showAll")}
      </Button>}
    </div>
    <div className={styles.grid} ref={gridRef}>
      {page.map((word, index) => {
        const key = wordKey(word);
        return <WordCard key={`${start + index}:${key}`} word={word} source={source?.(word) ?? null} shown={shown.has(key)} opened={opened.has(key)}
          onToggle={() => reveal([key], !shown.has(key))} />;
      })}
    </div>
    <div className={styles.nav}>
      <Button variant="quiet" disabled={start === 0} onClick={() => go(Math.max(0, start - size))}>{t("common.back")}</Button>
      {last && doneLabel && onDone
        ? <Button onClick={onDone}>{doneLabel}</Button>
        // While the next words are loading, Next waits for them.
        : <Button disabled={loadedEnd} loading={loadedEnd && more?.loading} onClick={() => go(start + size)}>{t("common.next")}</Button>}
    </div>
  </div>;
}
