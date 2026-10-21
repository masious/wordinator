import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HeadingDot } from "./HeadingDot";
import { CategoryBadge, stickyInset, type LessonIndexEntry } from "./LessonIndex";
import styles from "./LessonStickyHeader.module.css";

// The lesson page's sticky header (docs/courses.md#lesson-pages), across the main column: the current index entry (a level-3
// entry after its level-2 `section`; category icons here stay still), the lesson's title once the page's own title has scrolled
// under it, and, once the cover has, that cover blurred behind both. It slides in when the first of them has gone; a lesson without a cover shows a light art tone instead. It repeats what the page
// already says, so it is hidden from assistive technology. It renders into the page's sticky slot (`data-lesson-header`), whose
// height sets the reading line (stickyInset).
export function LessonStickyHeader({ title, cover, entry, section = entry }: { title: string; cover: string | null; entry: LessonIndexEntry | undefined; section?: LessonIndexEntry | undefined }) {
  const bar = useRef<HTMLDivElement>(null);
  const [passed, setPassed] = useState({ cover: false, title: false });
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const page = bar.current?.closest("article"); if (!page) return;
      const line = stickyInset(null);
      const gone = (selector: string) => (page.querySelector(selector)?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY) <= line;
      const next = { cover: gone("[data-lesson-cover]"), title: gone("#lesson-title") };
      setPassed((previous) => previous.cover === next.cover && previous.title === next.title ? previous : next);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll); onScroll();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);
  const shown = passed.title || (cover !== null && passed.cover);
  return <div ref={bar} className={styles.bar} data-shown={shown || undefined} aria-hidden="true">
    <span className={styles.backdrop} data-shown={(cover ? passed.cover : shown) || undefined}>{cover && <img src={cover} alt="" decoding="async" />}</span>
    <span className={styles.text}>
      <span className={styles.title} data-shown={passed.title || undefined}>{title}</span>
      {entry && <span className={styles.section}>
        {section && section !== entry && <>
          <CategoryBadge category={section.category} content /><span className={styles.sectionText}>{section.text}</span>
          <ChevronRight className={styles.separator} />
        </>}
        {entry.color ? <HeadingDot color={entry.color} /> : <CategoryBadge category={entry.category} content />}
        <span className={styles.sectionText}>{entry.text}</span>
      </span>}
    </span>
  </div>;
}
