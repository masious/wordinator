import { SegmentedControl } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { localDayOf } from "@wordinator/contracts/learning";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { learningActivityQueryOptions } from "../../api";
import { categoryOf, type ActivityCategory } from "../../learningActivity";
import { learningClock, useMinuteRefresh } from "../../learningTime";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { SlidePanel } from "../../molecules/SlidePanel";
import { ACTIVITY_CATEGORIES, dayOf, goalShare, studyTime } from "../LearningHome/learningSummary";
import styles from "./StudyTime.module.css";

// The rail's study time (docs/learning-time.md#study-time): the viewer's own time today or in the past seven days, per activity
// category, with today's share of the daily goal.

export type StudyPeriod = "today" | "week";

// The chosen tab is a per-device convenience, like the New words panel's collapse; storage may be unavailable, so it falls back
// to Today. A Lesson tab remembered before the lesson box dropped it reads as Today too.
const PERIOD_KEY = "wordinator:ui:v1:rail-study-period";
const isPeriod = (value: unknown): value is StudyPeriod => value === "today" || value === "week";
function readPeriod(): StudyPeriod {
  try { const stored = window.localStorage.getItem(PERIOD_KEY); return isPeriod(stored) ? stored : "today"; } catch { return "today"; }
}
function writePeriod(period: StudyPeriod) {
  try { window.localStorage.setItem(PERIOD_KEY, period); } catch { /* storage unavailable */ }
}

/** The remembered tab. */
export function useStudyPeriod() {
  const [period, setPeriod] = useState(readPeriod);
  const choose = (next: StudyPeriod) => { setPeriod(next); writePeriod(next); };
  return [period, choose] as const;
}

const PERIODS: StudyPeriod[] = ["today", "week"];
export function StudyPeriodSwitch({ value, onChange }: { value: StudyPeriod; onChange: (period: StudyPeriod) => void }) {
  const { t } = useTranslation();
  return <div role="group" aria-label={t("studyTime.period")}>
    <SegmentedControl size="xs" fullWidth classNames={{ root: styles.switch, label: styles.switchLabel }} value={value} onChange={(next) => { if (isPeriod(next)) onChange(next); }}
      data={PERIODS.map((period) => ({ value: period, label: t(`studyTime.periods.${period}`) }))} />
  </div>;
}

/** The content of the chosen tab, sliding in from the side of the tab moved to (see SlidePanel). */
export function StudyPeriodPanel({ period, children }: { period: StudyPeriod; children: ReactNode }) {
  return <SlidePanel index={PERIODS.indexOf(period)}>{children}</SlidePanel>;
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

// Today's or the past seven days' seconds per category: the server's totals plus the clock's unsent seconds, refreshed each
// minute; with the daily goal. Null while the read loads, "error" when it fails.
function useStudySeconds(groupId: string, period: "today" | "week") {
  useMinuteRefresh();
  const today = localDayOf(new Date());
  const activity = useQuery(learningActivityQueryOptions(groupId, "week", today));
  if (activity.isError) return "error" as const;
  if (!activity.data) return null;
  const row = period === "today" ? dayOf(activity.data.days, today) : activity.data.totals;
  const seconds = Object.fromEntries(ACTIVITY_CATEGORIES.map((category) => [category,
    (row?.[category] ?? 0) + learningClock().pendingSeconds((target) => categoryOf(target) === category)])) as Record<ActivityCategory, number>;
  const total = ACTIVITY_CATEGORIES.reduce((sum, category) => sum + seconds[category], 0);
  return { seconds, total, goal: activity.data.dailyGoalMinutes };
}

const goalLabel = (t: TFunction, total: number, goal: number) =>
  t("studyTime.goal", { time: railTime(t, total), goal: t("courses.lessonBox.minutes", { count: goal }) });

/** Today's or the past seven days' time per category. `withGoal` adds today's goal meter (the card shows it in its summary row). */
export function StudyTimeFigures({ groupId, period, withGoal = true }: { groupId: string; period: "today" | "week"; withGoal?: boolean }) {
  const { t } = useTranslation();
  const study = useStudySeconds(groupId, period);
  if (study === "error") return <p className={styles.note}>{t("studyTime.unavailable")}</p>;
  if (!study) return <p className={styles.note}>{t("studyTime.loading")}</p>;
  const { seconds, total, goal } = study;
  const share = withGoal && period === "today" ? goalShare(total, goal) : null;
  return <div className={styles.panel}>
    {share !== null && goal !== null && <ProgressMeter size="compact" value={share * 100} showLabel label={goalLabel(t, total, goal)} />}
    {total === 0
      ? <p className={styles.note}>{t(period === "today" ? "studyTime.emptyToday" : "studyTime.emptyWeek")}</p>
      : <FigureList>
        {ACTIVITY_CATEGORIES.filter((category) => seconds[category] > 0).map((category) =>
          <Figure key={category} label={t(`learningHome.categories.${category}`)} value={railTime(t, seconds[category])} />)}
        <Figure strong label={t("studyTime.total")} value={railTime(t, total)} />
      </FigureList>}
  </div>;
}

// Whether a rail card's figures are open: the Study time card's (the default key) or, under its own key, the lesson box's lesson
// figures or the lesson page's study time. They start closed, since the rail is short; the choice is a per-device convenience,
// so storage that cannot be read or written leaves them closed.
const FIGURES_OPEN_KEY = "wordinator:ui:v1:study-figures-open";
export function useFiguresOpen(key = FIGURES_OPEN_KEY) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });
  const toggle = () => setOpen((current) => {
    try { localStorage.setItem(key, current ? "0" : "1"); } catch { /* storage unavailable */ }
    return !current;
  });
  return [open, toggle] as const;
}

/** The chevron that opens and closes the figures; it sits at the end of the summary row. */
export function FiguresDisclosure({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  const { t } = useTranslation();
  return <button type="button" className={styles.disclosure} aria-expanded={open} aria-controls={controls}
    aria-label={t(open ? "studyTime.hideFigures" : "studyTime.showFigures")} onClick={onToggle}>
    <ChevronDown aria-hidden="true" />
  </button>;
}

/** The figures under the summary row. Closed, they take no room and nothing in them takes focus; opening grows them in. */
export function FiguresReveal({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return <div id={id} className={styles.reveal} data-open={open || undefined} inert={!open}><div className={styles.revealInner}>{children}</div></div>;
}

// The card's summary row: today against the goal, with its meter, or today's time alone without a goal.
function TodaySummary({ groupId, end }: { groupId: string; end: ReactNode }) {
  const { t } = useTranslation();
  const study = useStudySeconds(groupId, "today");
  const known = study !== null && study !== "error";
  if (known && study.goal !== null) return <ProgressMeter size="compact" value={(goalShare(study.total, study.goal) ?? 0) * 100} showLabel
    label={t("studyTime.summaryGoal", { time: railTime(t, study.total), goal: t("courses.lessonBox.minutes", { count: study.goal }) })} labelEnd={end} />;
  return <div className={styles.summary}>
    <span>{known ? t("studyTime.summary", { time: study.total ? railTime(t, study.total) : t("studyTime.nothingYet") }) : t("studyTime.periods.today")}</span>
    {end}
  </div>;
}

/**
 * The rail's study time card. Its summary row is always today; the chevron opens the Today | This week switch and its figures.
 * `expanded` (the lesson page, whose profile row shows and hides the whole card) keeps the figures open without the chevron.
 */
export function StudyTimeBox({ groupId, expanded = false }: { groupId: string; expanded?: boolean }) {
  const { t } = useTranslation();
  const [period, choose] = useStudyPeriod();
  const [stored, toggle] = useFiguresOpen();
  const open = expanded || stored;
  const figuresId = useId();
  return <section className={styles.box} aria-label={t("studyTime.title")}>
    <TodaySummary groupId={groupId} end={expanded ? null : <FiguresDisclosure open={open} controls={figuresId} onToggle={toggle} />} />
    <FiguresReveal id={figuresId} open={open}>
      <StudyPeriodSwitch value={period} onChange={choose} />
      <StudyPeriodPanel period={period}><StudyTimeFigures groupId={groupId} period={period} withGoal={false} /></StudyPeriodPanel>
    </FiguresReveal>
  </section>;
}
