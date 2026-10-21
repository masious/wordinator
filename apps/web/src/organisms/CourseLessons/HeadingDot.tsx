import type { HeadingColor } from "./LessonIndex";
import styles from "./HeadingDot.module.css";

// A level-3 heading's colour dot (LessonIndex.tsx): before the heading in the text, on its index row, and before its activities in
// Do more with AI. Sized in `em`, so it follows the text around it; decorative, since the heading's name is in the text.
export function HeadingDot({ color }: { color: HeadingColor }) {
  return <span className={styles.dot} data-color={color} aria-hidden="true" />;
}
