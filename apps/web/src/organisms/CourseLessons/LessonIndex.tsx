import { inlineText, walkLessonBlocks, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRevealCurrent } from "./LessonWords";
import styles from "./LessonIndex.module.css";

// One line of a lesson's index: a heading. `depth` indents it: the document's highest heading level is depth 0.
export type LessonIndexEntry = { id: string; text: string; depth: number };

// The index shows only when it has at least this many entries; one entry tells the reader nothing.
export const LESSON_INDEX_MIN = 2;
// Entries count as passed once their top is this close to the reading line, so a jump from the index lands on its entry.
const ACTIVE_SLACK_PX = 8;
const BOTTOM_SLACK_PX = 2;

// Level-1 and level-2 headings in reading order; practices and other blocks are left out. Level-3 headings are too fine for the
// index, and headings inside columns title only their column, so both are left out, as are empty headings.
export function lessonIndexEntries(document: LessonDocument): LessonIndexEntry[] {
  const found: Array<{ id: string; text: string; level: number }> = [];
  for (const { block, depth } of walkLessonBlocks(document.blocks)) {
    if (depth > 0 || block.type !== "heading" || block.props.level === 3) continue;
    const text = inlineText(block.content).replace(/\s+/g, " ").trim();
    if (text) found.push({ id: block.id, text, level: block.props.level });
  }
  const top = Math.min(...found.map((entry) => entry.level));
  return found.map(({ level, ...entry }) => ({ ...entry, depth: level - top }));
}

// The last entry whose top has reached `line` (window coordinates), or -1 before the first. At the bottom of the page the last
// entry is current, since entries near the end may never reach the line.
export function currentEntry(tops: ReadonlyArray<number | null>, line: number, atBottom: boolean): number {
  if (atBottom && tops.length) return tops.length - 1;
  let current = -1;
  tops.forEach((top, index) => { if (top !== null && top <= line + ACTIVE_SLACK_PX) current = index; });
  return current;
}

// The sticky side column's top, which is where the reading line sits; 0 when the column does not stick (narrow screens).
export const stickyInset = (side: HTMLElement | null) => {
  const style = side ? getComputedStyle(side) : null;
  return style?.position === "sticky" ? parseFloat(style.top) || 0 : 0;
};

// Follows the window's scroll and returns the index of the entry the reader is in.
function useCurrentEntry(entries: readonly LessonIndexEntry[], reading: RefObject<HTMLElement | null>, side: RefObject<HTMLElement | null>) {
  const [current, setCurrent] = useState(-1);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = reading.current; if (!root) return;
      const tops = entries.map((entry) => root.querySelector<HTMLElement>(`[data-block-id="${entry.id}"]`)?.getBoundingClientRect().top ?? null);
      const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - BOTTOM_SLACK_PX;
      setCurrent(currentEntry(tops, stickyInset(side.current), atBottom));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [entries, reading, side]);
  return current;
}

// The lesson's index in the app rail, under the current course: its headings, one line each, with the one the reader is in marked
// as current on the rule and the ones already passed muted. Choosing an entry scrolls the page to it, then calls `onJump` (the
// phone's drawer closes). A long index scrolls with the rail's navigation, which keeps the current entry in view.
export function LessonIndex({ entries, reading, side, onJump }: {
  entries: readonly LessonIndexEntry[]; reading: RefObject<HTMLElement | null>; side: RefObject<HTMLElement | null>; onJump?: () => void;
}) {
  const { t } = useTranslation();
  const list = useRef<HTMLElement>(null);
  const current = useCurrentEntry(entries, reading, side);
  // Entries keep to one line in the rail, so each also carries its full label as a tooltip.
  // The index scrolls with the rail's navigation, so that is where the current entry is kept in view.
  const scroller = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { scroller.current = list.current?.closest<HTMLElement>("[data-rail-scroll]") ?? list.current; });
  useRevealCurrent(scroller, current >= 0 ? entries[current]!.id : "", '[aria-current="location"]');
  const jump = (id: string) => {
    const element = reading.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`); if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - stickyInset(side.current);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    window.scrollTo({ top: Math.max(0, top), behavior: still ? "auto" : "smooth" });
    onJump?.();
  };
  return <nav ref={list} className={styles.index} aria-label={t("courses.lessons.index.title")}>
    <p className={styles.title} aria-hidden="true">{t("courses.lessons.index.title")}</p>
    <ol className={styles.list}>{entries.map((entry, index) => <li key={entry.id}>
      <button type="button" className={styles.entry} data-passed={index < current || undefined}
        style={{ "--index-depth": entry.depth } as CSSProperties} aria-current={index === current ? "location" : undefined} title={entry.text} onClick={() => jump(entry.id)}>
        {entry.text}
      </button>
    </li>)}</ol>
  </nav>;
}
