import { lessonPositionResponseSchema, type CourseProgressResponse, type LessonPosition } from "@wordinator/contracts";
import { lessonStepKey, resolveStepIndex, type LessonStep } from "@wordinator/contracts/lesson-document";
import { useQueryClient } from "@tanstack/react-query";
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

// The furthest step whose place on the page has crossed the reading line. A dialogue's lines and a practice's items share one
// block, so they are spread evenly over its height. Steps with nothing on the page (New words, shown in the side panel) take the
// place of the next step that has one. At the bottom of the page every step is reached.
export function reachedStep(steps: readonly LessonStep[], root: HTMLElement, viewportHeight: number, atBottom: boolean): number {
  if (!steps.length) return -1;
  if (atBottom) return steps.length - 1;
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
  const line = viewportHeight * READING_LINE;
  let reached = -1;
  tops.forEach((top, index) => { if (top !== null && top <= line) reached = index; });
  return reached;
}

const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);

export type ReadingTracking = { save: boolean; completed: boolean; position: LessonPosition | undefined; path: string; groupId: string; courseId: string; lessonId: string };

// A thin bar along the top of the window showing the viewer's lesson position, in the player's unit: step N of M fills N/M. It
// starts from the saved position, so it matches the player, and moves on as the reader scrolls further; the bottom of the page
// reaches the last step, and a finished lesson shows full. While the reader scrolls a published lesson they have not finished,
// the furthest step they reach is saved as their lesson position, the same one the player resumes from. Nothing is saved until
// the reader scrolls, and never for a step at or before their saved one.
export function LessonReadingProgress({ steps, reading, tracking }: { steps: readonly LessonStep[]; reading: RefObject<HTMLElement | null>; tracking: ReadingTracking }) {
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
      const progressKey = courseProgressQueryOptions(current.groupId, current.courseId).queryKey;
      // Refusals (an archived course, an unpublished lesson, a step the server no longer knows) are ignored, as in the player.
      apiRequest(`${current.path}/position`, lessonPositionResponseSchema, { method: "PUT", body: JSON.stringify({ stepKey: lessonStepKey(step) }), keepalive: true })
        .then(({ position }) => {
          queryClient.setQueryData(progressKey, (data: CourseProgressResponse | undefined) => data && {
            ...data, positions: [position, ...data.positions.filter((entry) => entry.lessonId !== position.lessonId)],
          });
          // Percentages depend on the new position, so the course page refetches them when it next shows them.
          void queryClient.invalidateQueries({ queryKey: progressKey, refetchType: "none" });
        }, () => undefined);
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
  const current = tracking.completed ? steps.length - 1 : Math.max(saved, reached);
  const share = steps.length ? (current + 1) / steps.length : 0;
  const percent = Math.round(share * 100);
  return <div className={styles.bar} role="progressbar" aria-label={t("courses.lessons.readingProgress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    data-complete={percent >= 100 || undefined}>
    <span className={styles.fill} style={{ transform: `scaleX(${share})` }} />
  </div>;
}
