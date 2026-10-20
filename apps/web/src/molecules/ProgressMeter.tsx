import type { ReactNode } from "react";
import styles from "./ProgressMeter.module.css";

const percentFormat = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

// A thin accessible progress track; `value` is a percentage. `showLabel` adds the label and percentage above the track, and
// `labelEnd` a control after the percentage (the lesson box's disclosure). A dark panel sets `--progress-track` (and
// `--progress-label`) to keep the track visible on its surface.
export function ProgressMeter({ value, label, size = "regular", showLabel = false, labelEnd, className }: {
  value: number; label: string; size?: "regular" | "compact"; showLabel?: boolean; labelEnd?: ReactNode; className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const track = <div className={`${styles.track} ${size === "compact" ? styles.compact : ""} ${showLabel ? "" : className ?? ""}`} role="progressbar" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} data-complete={clamped >= 100 || undefined}>
    <span className={styles.fill} style={{ transform: `scaleX(${clamped / 100})` }} />
  </div>;
  if (!showLabel) return track;
  return <div className={`${styles.wrap} ${className ?? ""}`}>
    <div className={styles.labelRow}>
      <span aria-hidden="true">{label}</span>
      <span className={styles.labelEnd}><span aria-hidden="true">{percentFormat.format(Math.floor(clamped) / 100)}</span>{labelEnd}</span>
    </div>
    {track}
  </div>;
}
