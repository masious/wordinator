import { inlineText, readPracticeBlock, walkLessonBlocks, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRevealCurrent } from "./LessonWords";
import styles from "./LessonIndex.module.css";

// One line of a lesson's index: a heading, or a practice under the heading before it. `depth` indents it: the document's
// highest heading level is depth 0, and a practice sits one step deeper than its heading.
export type LessonIndexEntry = { id: string; kind: "heading" | "practice"; text: string; depth: number };

// The index shows only when it has at least this many entries; one entry tells the reader nothing.
export const LESSON_INDEX_MIN = 2;
// Entries count as passed once their top is this close to the reading line, so a jump from the index lands on its entry.
const ACTIVE_SLACK_PX = 8;
const BOTTOM_SLACK_PX = 2;

// A practice is named by the first sentence of its instruction ("Fill in the verb. Start with…" reads "Fill in the verb"), up to
// the first full stop, question or exclamation mark, colon, or semicolon followed by a space. A closing full stop or colon is dropped.
export function shortInstruction(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = /[.!?:;](?=\s)/.exec(flat);
  return (end ? flat.slice(0, end.index + 1) : flat).replace(/[.:;]$/, "").trim();
}
const instruction = (block: Parameters<typeof readPracticeBlock>[0]) => {
  try { return shortInstruction(readPracticeBlock(block).instruction); } catch { return ""; }
};

// Headings and practices in reading order. Level-3 headings are too fine for the index, and headings inside columns title only
// their column, so both are left out, as are empty headings; practices inside columns are kept.
export function lessonIndexEntries(document: LessonDocument): LessonIndexEntry[] {
  const found: Array<{ id: string; kind: "heading" | "practice"; text: string; level: number | null }> = [];
  for (const { block, depth } of walkLessonBlocks(document.blocks)) {
    if (block.type === "heading" && depth === 0 && block.props.level !== 3) {
      const text = inlineText(block.content).replace(/\s+/g, " ").trim();
      if (text) found.push({ id: block.id, kind: "heading", text, level: block.props.level });
    } else if (block.type === "practice") found.push({ id: block.id, kind: "practice", text: instruction(block), level: null });
  }
  const top = Math.min(...found.flatMap((entry) => entry.level ?? []));
  let section = -1;
  return found.map(({ level, ...entry }) => {
    if (level !== null) { section = level - top; return { ...entry, depth: section }; }
    return { ...entry, depth: section + 1 };
  });
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
const stickyInset = (side: HTMLElement | null) => {
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

// The lesson's index beside the text: every heading and practice, with the one the reader is in marked as current and the ones
// already passed dimmed. Choosing an entry scrolls the page to it.
// `fill` lets it take the whole column when no open New words panel sits below it.
export function LessonIndex({ entries, reading, side, fill }: {
  entries: readonly LessonIndexEntry[]; reading: RefObject<HTMLElement | null>; side: RefObject<HTMLElement | null>; fill: boolean;
}) {
  const { t } = useTranslation();
  const list = useRef<HTMLElement>(null);
  const current = useCurrentEntry(entries, reading, side);
  useRevealCurrent(list, current >= 0 ? entries[current]!.id : "");
  const jump = (id: string) => {
    const element = reading.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`); if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - stickyInset(side.current);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, top), behavior: still ? "auto" : "smooth" });
  };
  return <nav ref={list} className={styles.index} data-fill={fill || undefined} aria-label={t("courses.lessons.index.title")}>
    <p className={styles.title} aria-hidden="true">{t("courses.lessons.index.title")}</p>
    <ol className={styles.list}>{entries.map((entry, index) => <li key={entry.id}>
      <button type="button" className={styles.entry} data-kind={entry.kind} data-passed={index < current || undefined}
        style={{ "--index-depth": entry.depth } as CSSProperties} aria-current={index === current ? "location" : undefined} onClick={() => jump(entry.id)}>
        {entry.kind === "practice"
          ? entry.text ? t("courses.lessons.index.practice", { instruction: entry.text }) : t("courses.lessons.index.practiceUntitled")
          : entry.text}
      </button>
    </li>)}</ol>
  </nav>;
}
