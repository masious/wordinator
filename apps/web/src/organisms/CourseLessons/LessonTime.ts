import { walkLessonBlocks, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { useLearningClaim } from "../../learningTime";
import { READING_LINE } from "./LessonReadingProgress";

// Reading time on the lesson page (C15, docs/learning-time.md#the-clock).

// Each block's section (from one heading to the next) counts as grammar when it holds a grammar callout or a column layout, as the
// lesson overview's Grammar stop does. Nested blocks take their top-level block's section.
export function grammarBlocks(document: LessonDocument): Set<string> {
  const grammar = new Set<string>();
  let section: string[] = []; let isGrammar = false;
  const close = () => { if (isGrammar) for (const id of section) grammar.add(id); section = []; isGrammar = false; };
  for (const block of document.blocks) {
    if (block.type === "heading") close();
    for (const { block: inner } of walkLessonBlocks([block])) {
      section.push(inner.id);
      if (inner.type === "columnList" || (inner.type === "callout" && inner.props.variant === "grammar")) isGrammar = true;
    }
  }
  close();
  return grammar;
}

// A typical time in whole minutes, at least one: the course list, Practice again, and the lesson box show minutes.
export const typicalMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

// The block at the reading line: the last block whose top has crossed it.
function blockAtLine(root: HTMLElement): string | null {
  const line = window.innerHeight * READING_LINE; let found: string | null = null;
  for (const element of root.querySelectorAll<HTMLElement>("[data-block-id]")) if (element.getBoundingClientRect().top <= line) found = element.dataset.blockId ?? found;
  return found;
}

const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);

/**
 * Runs the reading clock for a published lesson once reading has started: when `started` (the start gate was pressed), or the
 * first time the reader's own scrolling brings the first block to the reading line. Its focus follows the section at the line.
 */
export function useReadingTime({ reading, document, enabled, started, groupId, courseId, lessonId }: {
  reading: RefObject<HTMLElement | null>; document: LessonDocument | null; enabled: boolean; started: boolean; groupId: string; courseId: string; lessonId: string;
}) {
  const [reached, setReached] = useState(false);
  const grammar = useMemo(() => document ? grammarBlocks(document) : new Set<string>(), [document]);
  useEffect(() => {
    if (!enabled || reached || started) return;
    let moved = false;
    const check = () => {
      const first = reading.current?.querySelector<HTMLElement>("[data-block-id]");
      if (moved && first && first.getBoundingClientRect().top <= window.innerHeight * READING_LINE) setReached(true);
    };
    // As for lesson positions, only the reader's own scrolling counts, never the router's.
    const onIntent = (event: Event) => {
      if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
      if (event.type === "pointerdown" && event.target !== window.document.documentElement) return;
      moved = true;
    };
    const intents = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    for (const type of intents) window.addEventListener(type, onIntent, { passive: true });
    window.addEventListener("scroll", check, { passive: true });
    return () => { for (const type of intents) window.removeEventListener(type, onIntent); window.removeEventListener("scroll", check); };
  }, [enabled, reached, started, reading]);
  useLearningClaim(enabled && (reached || started) ? {
    groupId,
    target: () => {
      const root = reading.current; const at = root ? blockAtLine(root) : null;
      return { activity: "reading", focus: at && grammar.has(at) ? "grammar" : "lesson", courseId, lessonId };
    },
  } : null);
}
