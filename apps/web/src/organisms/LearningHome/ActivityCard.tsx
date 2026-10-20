import type { LearningActivityDay, LearningActivityRange, LearningActivityResponse } from "@wordinator/contracts/learning";
import { SegmentedControl } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Surface } from "../../ui";
import { barScale, changeLine, studyTime } from "./learningSummary";
import styles from "./ActivityCard.module.css";

// The Activity card (docs/learning-time.md#home-dashboard): the period's total and its change, a compact Week / Month switcher, one
// single-colour bar per local day with today highlighted, and a link to the Progress page, which holds the categories. Each day is
// focusable; focus or hover shows its time.
export function ActivityCard({ data, today, range, onRange, lang }: {
  data: LearningActivityResponse; today: string; range: LearningActivityRange; onRange: (range: LearningActivityRange) => void; lang: string;
}) {
  const { t } = useTranslation();
  const { days, totals, previousTotal } = data;
  const scale = barScale(days);
  const weekday = new Intl.DateTimeFormat(lang, { weekday: "short" });
  const longDay = new Intl.DateTimeFormat(lang, { weekday: "long", month: "long", day: "numeric" });
  const dayOfMonth = new Intl.DateTimeFormat(lang, { day: "numeric" });
  const dayName = (day: LearningActivityDay) => day.day === today ? t("learningHome.activity.today") : longDay.format(new Date(`${day.day}T12:00:00`));
  const change = changeLine(t, totals.total, previousTotal);

  return <Surface className={styles.card}>
    <header className={styles.head}>
      <h2>{t("learningHome.activity.title")}</h2>
      <div role="group" aria-label={t("learningHome.activity.range")}>
        <SegmentedControl size="xs" value={range} onChange={(next) => onRange(next === "month" ? "month" : "week")}
          data={[{ value: "week", label: t("learningHome.activity.week") }, { value: "month", label: t("learningHome.activity.month") }]} />
      </div>
    </header>
    <div className={styles.summary}>
      <p className={styles.total}>{studyTime(t, totals.total)}</p>
      <p className={styles.muted}>{range === "week" ? t("learningHome.activity.pastWeek") : t("learningHome.activity.pastMonth")} · {change}</p>
    </div>
    {totals.total === 0
      ? <p className={styles.empty}>{t("learningHome.activity.empty")}</p>
      : <ol className={styles.bars} aria-label={t("learningHome.activity.chart")}>
          {days.map((day, index) => {
            const isToday = day.day === today;
            const time = studyTime(t, day.total);
            const label = t("learningHome.activity.dayLabel", { day: dayName(day), time });
            const showLabel = range === "week" || index % 5 === 0 || isToday;
            return <li key={day.day} className={styles.day} data-today={isToday || undefined}>
              <div className={styles.column} role="group" tabIndex={0} aria-label={label}>
                {day.total > 0 && <span className={styles.bar} style={{ height: `${(day.total / scale) * 100}%` }} />}
                <span aria-hidden="true" className={styles.tip}>{time}</span>
              </div>
              <span aria-hidden="true" className={styles.dayLabel}>
                {showLabel && (range === "week" ? weekday.format(new Date(`${day.day}T12:00:00`)) : dayOfMonth.format(new Date(`${day.day}T12:00:00`)))}
              </span>
            </li>;
          })}
        </ol>}
    <Link className={styles.details} to="/progress" search={range === "month" ? { range: "month" } : {}}>
      {t("learningHome.activity.details")}<ArrowRight aria-hidden="true" size={16} />
    </Link>
  </Surface>;
}
