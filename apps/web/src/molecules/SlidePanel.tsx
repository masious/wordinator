import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./SlidePanel.module.css";

/**
 * Content that changes in place, such as a tab's or a step's. `index` is the content's place in its row: a change first eases
 * the panel to the new content's height, then slides the new content in from the side of the move (from the right when the
 * index grows) as it fades in. The first content shows without motion.
 */
export function SlidePanel({ index, children }: { index: number; children: ReactNode }) {
  const [shown, setShown] = useState<{ index: number; from: "left" | "right" | null }>({ index, from: null });
  if (shown.index !== index) setShown({ index, from: index > shown.index ? "right" : "left" });
  const height = useContentHeight();
  return <div className={styles.slide} style={height.style} data-measured={height.measured || undefined}>
    <div ref={height.ref} key={index} className={styles.content} data-from={shown.index === index ? shown.from ?? undefined : undefined}>{children}</div>
  </div>;
}

// The content's height as an explicit panel height, so a change of height can be eased. It follows the content as it loads.
function useContentHeight() {
  const [height, setHeight] = useState<number | null>(null);
  const [measured, setMeasured] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect(); observer.current = null;
    if (!element || typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.current.observe(element);
  }, []);
  // The first height is set without easing; later ones ease.
  useEffect(() => { if (height !== null && !measured) { const frame = requestAnimationFrame(() => setMeasured(true)); return () => cancelAnimationFrame(frame); } }, [height, measured]);
  useEffect(() => () => observer.current?.disconnect(), []);
  return { ref, measured, style: height === null ? undefined : { height } as CSSProperties };
}
