import { lessonPositionResponseSchema, type CourseProgressResponse, type LessonPosition } from "@wordinator/contracts";
import { lessonStepKey, readingReached, resolveStepIndex, type LessonStep } from "@wordinator/contracts/lesson-document";
import { lessonShare, sharePercent } from "@wordinator/contracts/learning";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions } from "../../api";
import styles from "./LessonReadingProgress.module.css";

// A step counts as reached once its top passes this share of the viewport height, so the reader has it in front of them.
export const READING_LINE = 0.75;
// Saves wait for the reader to pause, so a long scroll sends one request instead of one per step.
export const SAVE_DELAY_MS = 1200;
const BOTTOM_SLACK_PX = 2;

const stepAnchor = (step: LessonStep) => {
  switch (step.kind) {
    case "content": case "words": return step.blocks.map((block) => block.id);
    default: return [step.block.id];
  }
};

// Each step's place on the page, as a viewport top. A dialogue's lines and a practice's items share one block, so they are spread
// evenly over its height. Steps with nothing on the page (New words, shown in the side panel) take the place of the next step that
// has one.
export function stepTops(steps: readonly LessonStep[], root: HTMLElement): Array<number | null> {
  const elements = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((element) => { elements.set(element.dataset.blockId!, element); });
  const tops: Array<number | null> = steps.map((step) => {
    const element = stepAnchor(step).map((id) => elements.get(id)).find(Boolean);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    if (step.kind === "dialogueTurn" || step.kind === "practiceItem") {
      const count = steps.filter((other) => other.kind === step.kind && other.block.id === step.block.id).length;
      const at = step.kind === "dialogueTurn" ? step.turnIndex : step.itemIndex;
      return box.top + (box.height * at) / Math.max(1, count);
    }
    return box.top;
  });
  for (let index = tops.length - 2; index >= 0; index -= 1) if (tops[index] === null) tops[index] = tops[index + 1] ?? null;
  return tops;
}

// The furthest step whose place on the page has crossed the reading line. At the bottom of the page every step is reached.
export function reachedStep(steps: readonly LessonStep[], root: HTMLElement, viewportHeight: number, atBottom: boolean): number {
  if (!steps.length) return -1;
  if (atBottom) return steps.length - 1;
  const tops = stepTops(steps, root);
  const line = viewportHeight * READING_LINE;
  let reached = -1;
  tops.forEach((top, index) => { if (top !== null && top <= line) reached = index; });
  return reached;
}

// Opening the lesson to continue it (the course page's Continue actions) brings the saved step to the top of the reading area, where
// the sticky side column starts, once. The router resets the scroll as the page renders, so the jump waits a frame. Arriving any
// other way leaves the page at its top.
export function useResumeScroll({ steps, reading, position, inset }: {
  steps: readonly LessonStep[]; reading: RefObject<HTMLElement | null>; position: LessonPosition | undefined; inset: () => number;
}) {
  const done = useRef(false);
  const insetRef = useRef(inset); insetRef.current = inset;
  useEffect(() => {
    if (done.current || !position || !steps.length) return;
    const index = resolveStepIndex(steps, position.stepKey, position.stepIndex);
    const frame = requestAnimationFrame(() => {
      const root = reading.current; const top = root ? stepTops(steps, root)[index] : null;
      if (top === null || top === undefined) return;
      done.current = true;
      window.scrollTo({ top: Math.max(0, top + window.scrollY - insetRef.current()), behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [position, reading, steps]);
}

const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);

/**
 * Saves a step as the viewer's lesson position and puts it into the cached course progress. Refusals (an archived course, an
 * unpublished lesson, a step the server no longer knows) are ignored, as in the player.
 */
export function saveLessonPosition(queryClient: QueryClient, target: { path: string; groupId: string; courseId: string }, step: LessonStep) {
  const progressKey = courseProgressQueryOptions(target.groupId, target.courseId).queryKey;
  return apiRequest(`${target.path}/position`, lessonPositionResponseSchema, { method: "PUT", body: JSON.stringify({ stepKey: lessonStepKey(step) }), keepalive: true })
    .then(({ position, completed }) => {
      queryClient.setQueryData(progressKey, (data: CourseProgressResponse | undefined) => data && {
        ...data, positions: [position, ...data.positions.filter((entry) => entry.lessonId !== position.lessonId)],
      });
      // Percentages depend on the new position, so the course page refetches them when it next shows them. A save that completed
      // the lesson (its end reached with every practice done) refetches them at once, so the page shows it finished.
      void queryClient.invalidateQueries({ queryKey: progressKey, refetchType: completed ? "active" : "none" });
    }, () => undefined);
}

export type ReadingTracking = {
  save: boolean; completed: boolean; position: LessonPosition | undefined; practicesDone: number; path: string; groupId: string; courseId: string; lessonId: string;
};

// A thin bar along the top of the window showing the viewer's lesson share (docs/courses.md#progress): half the reading steps
// reached, half the practices done, as the course page counts it. It starts from the saved position and moves on as the reader
// scrolls further; the bottom of the page reaches the last step, and a finished lesson shows full. While the reader scrolls a published lesson they have not finished,
// the furthest step they reach is saved as their lesson position, the same one the player resumes from. Nothing is saved until
// the reader scrolls, and never for a step at or before their saved one.
// `onPercent` hears the bar's percentage, for the rail's lesson box, and `onReached` the furthest step reached (every step once
// the lesson is finished), for the lesson index's locks.
export function LessonReadingProgress({ steps, reading, tracking, onPercent, onReached }: {
  steps: readonly LessonStep[]; reading: RefObject<HTMLElement | null>; tracking: ReadingTracking; onPercent?: (percent: number) => void;
  onReached?: (step: number) => void;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  // The furthest step reached on this visit; it fills the bar even where nothing is saved (previews, archived courses).
  const [reached, setReached] = useState(-1);
  const trackingRef = useRef(tracking); trackingRef.current = tracking;
  const furthest = useRef(-1); const pending = useRef<number | null>(null);
  const saved = tracking.position ? resolveStepIndex(steps, tracking.position.stepKey, tracking.position.stepIndex) : -1;
  useEffect(() => { furthest.current = Math.max(furthest.current, saved); }, [saved]);
  useEffect(() => {
    let frame = 0; let timer: ReturnType<typeof setTimeout> | undefined; let moved = false;
    const flush = () => {
      if (timer) clearTimeout(timer); timer = undefined;
      const index = pending.current; pending.current = null;
      const step = index === null ? undefined : steps[index];
      const current = trackingRef.current;
      if (!step || !current.save) return;
      void saveLessonPosition(queryClient, current, step);
    };
    const measure = () => {
      frame = 0;
      const root = reading.current;
      if (!moved || !root) return;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - BOTTOM_SLACK_PX;
      const step = reachedStep(steps, root, window.innerHeight, atBottom);
      setReached((current) => Math.max(current, step));
      if (!trackingRef.current.save || step <= furthest.current) return;
      furthest.current = step; pending.current = step;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    };
    // Only the reader's own scrolling counts: the router restoring or resetting the scroll on navigation also fires `scroll`, and
    // must not save a position. A wheel, a touch drag, a scrolling key, or a press on the page's scrollbar marks the reader's intent.
    const onIntent = (event: Event) => {
      if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
      if (event.type === "pointerdown" && event.target !== document.documentElement) return;
      moved = true;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const intents = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    for (const type of intents) window.addEventListener(type, onIntent, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("pagehide", flush);
    onScroll();
    return () => {
      for (const type of intents) window.removeEventListener(type, onIntent);
      window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); window.removeEventListener("pagehide", flush);
      if (frame) cancelAnimationFrame(frame);
      flush();
    };
  }, [queryClient, reading, steps]);
  const current = Math.max(saved, reached);
  const read = readingReached(steps, current);
  const practicesTotal = new Set(steps.flatMap((step) => step.kind === "practiceItem" ? [step.block.id] : [])).size;
  const share = lessonShare({ completed: tracking.completed, readingShare: read.total ? read.reached / read.total : 0, hasReading: read.total > 0,
    practicesDone: tracking.practicesDone, practicesTotal });
  const percent = sharePercent(share);
  useEffect(() => { onPercent?.(percent); }, [onPercent, percent]);
  const furthestStep = tracking.completed ? steps.length - 1 : current;
  useEffect(() => { onReached?.(furthestStep); }, [onReached, furthestStep]);
  return <div className={styles.bar} role="progressbar" aria-label={t("courses.lessons.readingProgress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    data-complete={percent >= 100 || undefined}>
    <span className={styles.fill} style={{ transform: `scaleX(${share})` }} />
  </div>;
}
