import { SegmentedControl } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { localDayOf } from "@wordinator/contracts/learning";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { learningActivityQueryOptions } from "../../api";
import { categoryOf } from "../../learningActivity";
import { learningClock, useMinuteRefresh } from "../../learningTime";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { ACTIVITY_CATEGORIES, dayOf, goalShare, studyTime } from "../LearningHome/learningSummary";
import styles from "./StudyTime.module.css";

// The rail's study time (docs/learning-time.md#study-time): the viewer's own time today or in the past seven days, per activity
// category, with today's share of the daily goal. On a lesson page the lesson box adds a Lesson tab with the lesson's figures.

export type StudyPeriod = "lesson" | "today" | "week";

// The chosen tab is a per-device convenience, like the New words panel's collapse; storage may be unavailable, so it falls back
// to the page's default.
const PERIOD_KEY = "wordinator:ui:v1:rail-study-period";
const isPeriod = (value: unknown): value is StudyPeriod => value === "lesson" || value === "today" || value === "week";
function readPeriod() {
  try { const stored = window.localStorage.getItem(PERIOD_KEY); return isPeriod(stored) ? stored : null; } catch { return null; }
}
function writePeriod(period: StudyPeriod) {
  try { window.localStorage.setItem(PERIOD_KEY, period); } catch { /* storage unavailable */ }
}

/** The remembered tab. Without a lesson, a remembered Lesson tab reads as Today; with one, nothing remembered opens Lesson. */
export function useStudyPeriod(withLesson: boolean) {
  const [stored, setStored] = useState(readPeriod);
  const period: StudyPeriod = stored === null ? (withLesson ? "lesson" : "today") : stored === "lesson" && !withLesson ? "today" : stored;
  const choose = (next: StudyPeriod) => { setStored(next); writePeriod(next); };
  return [period, choose] as const;
}

// Beside Lesson, in the lesson box, This week is shortened to Week so three tabs fit a narrow rail.
export function StudyPeriodSwitch({ value, onChange, withLesson }: { value: StudyPeriod; onChange: (period: StudyPeriod) => void; withLesson: boolean }) {
  const { t } = useTranslation();
  const periods: StudyPeriod[] = withLesson ? ["lesson", "today", "week"] : ["today", "week"];
  return <div role="group" aria-label={t("studyTime.period")}>
    <SegmentedControl size="xs" fullWidth classNames={{ root: styles.switch, label: styles.switchLabel }} value={value} onChange={(next) => { if (isPeriod(next)) onChange(next); }}
      data={periods.map((period) => ({ value: period, label: t(withLesson && period === "week" ? "studyTime.periods.weekShort" : `studyTime.periods.${period}`) }))} />
  </div>;
}

/**
 * The content of the chosen tab. Changing tab first eases the panel to the new content's height, then slides the new content in
 * from the side of the tab moved to (from the right when moving right) as it fades in. The first content shows without motion.
 */
export function StudyPeriodPanel({ period, withLesson, children }: { period: StudyPeriod; withLesson: boolean; children: ReactNode }) {
  const order: StudyPeriod[] = withLesson ? ["lesson", "today", "week"] : ["today", "week"];
  const [shown, setShown] = useState<{ period: StudyPeriod; from: "left" | "right" | null }>({ period, from: null });
  if (shown.period !== period) setShown({ period, from: order.indexOf(period) > order.indexOf(shown.period) ? "right" : "left" });
  const height = useContentHeight();
  return <div className={styles.slide} style={height.style} data-measured={height.measured || undefined}>
    <div ref={height.ref} key={period} className={styles.slideContent} data-from={shown.period === period ? shown.from ?? undefined : undefined}>{children}</div>
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

/** A list of label and figure rows; a `quiet` row is a mono note under the row above it. */
export function FigureList({ children }: { children: ReactNode }) {
  return <dl className={styles.figures}>{children}</dl>;
}
export function Figure({ label, value, quiet = false, strong = false }: { label: string; value?: string; quiet?: boolean; strong?: boolean }) {
  return <div data-strong={strong || undefined}><dt className={quiet ? styles.quiet : undefined}>{label}</dt>{value !== undefined && <dd>{value}</dd>}</div>;
}

// The rail is narrow, so a duration under a minute is short there ("< 1 min").
const railTime = (t: TFunction, seconds: number) => seconds > 0 && seconds < 60 ? t("studyTime.underMinute") : studyTime(t, seconds);

/** Today's or the past seven days' time per category, the server's totals plus the clock's unsent seconds, refreshed each minute. */
export function StudyTimeFigures({ groupId, period }: { groupId: string; period: "today" | "week" }) {
  const { t } = useTranslation();
  useMinuteRefresh();
  const today = localDayOf(new Date());
  const activity = useQuery(learningActivityQueryOptions(groupId, "week", today));
  if (activity.isError) return <p className={styles.note}>{t("studyTime.unavailable")}</p>;
  if (!activity.data) return <p className={styles.note}>{t("studyTime.loading")}</p>;
  const row = period === "today" ? dayOf(activity.data.days, today) : activity.data.totals;
  const seconds = Object.fromEntries(ACTIVITY_CATEGORIES.map((category) => [category,
    (row?.[category] ?? 0) + learningClock().pendingSeconds((target) => categoryOf(target) === category)]));
  const total = ACTIVITY_CATEGORIES.reduce((sum, category) => sum + seconds[category]!, 0);
  const goal = activity.data.dailyGoalMinutes;
  const share = period === "today" ? goalShare(total, goal) : null;
  return <div className={styles.panel}>
    {share !== null && goal !== null && <ProgressMeter size="compact" value={share * 100} showLabel
      label={t("studyTime.goal", { time: railTime(t, total), goal: t("courses.lessonBox.minutes", { count: goal }) })} />}
    {total === 0
      ? <p className={styles.note}>{t(period === "today" ? "studyTime.emptyToday" : "studyTime.emptyWeek")}</p>
      : <FigureList>
        {ACTIVITY_CATEGORIES.filter((category) => seconds[category]! > 0).map((category) =>
          <Figure key={category} label={t(`learningHome.categories.${category}`)} value={railTime(t, seconds[category]!)} />)}
        <Figure strong label={t("studyTime.total")} value={railTime(t, total)} />
      </FigureList>}
  </div>;
}

/** The rail's study time card on pages without a lesson box. */
export function StudyTimeBox({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const [period, choose] = useStudyPeriod(false);
  return <section className={styles.box} aria-label={t("studyTime.title")}>
    <StudyPeriodSwitch value={period} onChange={choose} withLesson={false} />
    <StudyPeriodPanel period={period} withLesson={false}><StudyTimeFigures groupId={groupId} period={period === "week" ? "week" : "today"} /></StudyPeriodPanel>
  </section>;
}
