import styles from "./ProgressMeter.module.css";

// A thin accessible progress track; `value` is a percentage.
export function ProgressMeter({ value, label, size = "regular", className }: { value: number; label: string; size?: "regular" | "compact"; className?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return <div className={`${styles.track} ${size === "compact" ? styles.compact : ""} ${className ?? ""}`} role="progressbar" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} data-complete={clamped >= 100 || undefined}>
    <span className={styles.fill} style={{ transform: `scaleX(${clamped / 100})` }} />
  </div>;
}
