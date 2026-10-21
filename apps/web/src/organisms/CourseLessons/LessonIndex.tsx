import { inlineText, walkLessonBlocks, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { Lock } from "lucide-react";
import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatedEmoji } from "../../molecules/AnimatedEmoji";
import { headingSections, type OverviewCategory } from "../LessonOverview/overviewModel";
import { notoEmoji } from "../LessonOverview/notoEmoji";
import { stopCategories } from "../LessonOverview/stopCategories";
import { useRevealCurrent } from "./LessonWords";
import styles from "./LessonIndex.module.css";

// One line of a lesson's index: a heading. `depth` indents it: the document's highest heading level is depth 0. `category` is
// what its section holds, read as the overview reads its stops (Story, Grammar, a practice type, Summary, and so on); `start` is
// the index of the section's first player step, which unlocks it once reached.
export type LessonIndexEntry = { id: string; text: string; depth: number; category: OverviewCategory; start: number };
// The entry the reader is in, one before it or reached earlier, or one not reached yet.
export type EntryState = "current" | "passed" | "locked";

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
  const sections = headingSections(document, found);
  return found.map(({ level, ...entry }) => ({ ...entry, depth: level - top, category: sections.get(entry.id)?.category ?? "topic", start: sections.get(entry.id)?.start ?? 0 }));
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
export function useCurrentEntry(entries: readonly LessonIndexEntry[], reading: RefObject<HTMLElement | null>, side: RefObject<HTMLElement | null>) {
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

// Each entry's state: the one the reader is in is current; the others are passed once the reader's furthest step (`reached`, the
// reading progress's: saved or reached on this visit, or every step once finished) has come to their section, or once they are
// at or before `visited`, the furthest entry that was current on this visit (a jump from the index visits without reading); the
// rest are locked. Unlike the current entry, a passed entry stays passed when the reader scrolls back.
export function entryStates(entries: readonly LessonIndexEntry[], current: number, reached: number, visited = current): EntryState[] {
  const furthest = Math.max(current, visited);
  return entries.map((entry, index) => index === current ? "current" : index <= furthest || entry.start <= reached ? "passed" : "locked");
}

// An entry's category as one of Noto's animated emoji on a round badge washed in the category's tone, or, while the entry is locked,
// a still grey lock. The active row clears the badge surface and scales its emoji to 1.1; reduced motion keeps it enlarged without transition. The emoji plays only while that badge is inside
// the rail's scrolling part (or the window, outside it). Sized in `em`, so it follows the row or heading around it.
export function CategoryBadge({ category, locked = false, active = false, content = false }: { category: OverviewCategory; locked?: boolean; active?: boolean; content?: boolean }) {
  const badge = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = badge.current;
    if (locked || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { root: element.closest<HTMLElement>("[data-rail-scroll]") });
    observer.observe(element);
    return () => observer.disconnect();
  }, [locked]);
  const { emoji, codepoint, tone } = stopCategories[category];
  const art = useMemo(() => notoEmoji(codepoint), [codepoint]);
  return <span ref={badge} className={`${styles.badge} ${content ? styles.contentBadge : ""}`} data-tone={locked ? undefined : tone} data-locked={locked || undefined} aria-hidden="true">
    {locked ? <Lock className={styles.lock} /> : <AnimatedEmoji emoji={emoji} {...art} playing={active && visible} />}
  </span>;
}

// Whenever the scrolling part changes height (the Study time card or the lesson box's figures opening or closing, frame by frame
// as they grow or fold, or the window resizing), the current entry is brought to its centre, as far as the content allows.
function useCentreOnResize(scroller: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = scroller.current;
    if (!panel || panel === list.current || typeof ResizeObserver === "undefined") return;
    let height = panel.clientHeight;
    const observer = new ResizeObserver(() => {
      if (panel.clientHeight === height) return;
      height = panel.clientHeight;
      const item = panel.querySelector<HTMLElement>('[aria-current="location"]'); if (!item) return;
      const frame = panel.getBoundingClientRect(); const box = item.getBoundingClientRect();
      const middle = box.top - frame.top + panel.scrollTop + box.height / 2;
      panel.scrollTop = Math.max(0, Math.min(middle - height / 2, panel.scrollHeight - height));
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [scroller, list]);
}

// The lesson's index in the app rail, under the lesson box: its headings, one row each after their category's badge. The active
// entry uses semibold accent text without a background and its emoji scales to 1.1; locked entries are grey behind a lock. Choosing an entry scrolls the page
// to it, then calls `onJump` (the phone's drawer closes). A long index scrolls with the rail's scrolling part, which keeps the
// current entry in view.
export function LessonIndex({ entries, current, states, reading, side, onJump }: {
  entries: readonly LessonIndexEntry[]; current: number; states: readonly EntryState[];
  reading: RefObject<HTMLElement | null>; side: RefObject<HTMLElement | null>; onJump?: () => void;
}) {
  const { t } = useTranslation();
  const list = useRef<HTMLElement>(null);
  // Entries keep to two lines in the rail, so each also carries its full label as a tooltip.
  // The index scrolls with the rail's scrolling part, so that is where the current entry is kept in view.
  const scroller = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { scroller.current = list.current?.closest<HTMLElement>("[data-rail-scroll]") ?? list.current; });
  useRevealCurrent(scroller, current >= 0 ? entries[current]!.id : "", '[aria-current="location"]');
  useCentreOnResize(scroller, list);
  const jump = (id: string) => {
    const element = reading.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`); if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - stickyInset(side.current);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    window.scrollTo({ top: Math.max(0, top), behavior: still ? "auto" : "smooth" });
    onJump?.();
  };
  return <nav ref={list} className={styles.index} aria-label={t("courses.lessons.index.title")}>
    <ol className={styles.list}>{entries.map((entry, index) => <li key={entry.id}>
      <button type="button" className={styles.entry} data-state={states[index]}
        style={{ "--index-depth": entry.depth } as CSSProperties} aria-current={index === current ? "location" : undefined} title={entry.text} onClick={() => jump(entry.id)}>
        <CategoryBadge category={entry.category} locked={states[index] === "locked"} active={index === current} />
        <span className={styles.label}>{entry.text}</span>
      </button>
    </li>)}</ol>
  </nav>;
}
