import { SegmentedControl } from "@mantine/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { localDayOf, type LearningActivityDay, type LearningActivityRange, type LearningActivityResponse } from "@wordinator/contracts/learning";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { learningActivityQueryOptions } from "../../api";
import { ErrorState, Eyebrow, LoadingState, PageHeader, SectionHeader, Surface } from "../../ui";
import { ACTIVITY_CATEGORIES, barScale, changeLine, studyTime } from "./learningSummary";
import styles from "./ProgressDetails.module.css";

// The Progress page (docs/learning-time.md#progress-page): the details behind the home Activity card for the same Week or Month
// read. The period's total and change with its active days and daily average; the time per category, in the category colours the
// card leaves out; the goal and streak; and every day of the period, newest first.
export function ProgressDetails({ groupId, range, onRange }: { groupId: string; range: LearningActivityRange; onRange: (range: LearningActivityRange) => void }) {
  const { t } = useTranslation();
  const today = localDayOf(new Date());
  const activity = useQuery({ ...learningActivityQueryOptions(groupId, range, today), placeholderData: keepPreviousData });

  return <div className={styles.page}>
    <Link className={styles.back} to="/courses"><ArrowLeft aria-hidden="true" size={16} />{t("progress.back")}</Link>
    <PageHeader className={styles.header} eyebrow={<Eyebrow>{t("progress.eyebrow")}</Eyebrow>} title={t("progress.title")} intro={t("progress.intro")}
      actions={<div role="group" aria-label={t("learningHome.activity.range")}>
        <SegmentedControl value={range} onChange={(next) => onRange(next === "month" ? "month" : "week")}
          data={[{ value: "week", label: t("learningHome.activity.week") }, { value: "month", label: t("learningHome.activity.month") }]} />
      </div>} />
    {activity.isError ? <ErrorState title={t("progress.unavailable")} />
      : !activity.data ? <LoadingState label={t("progress.loading")} />
      : <ProgressSections data={activity.data} today={today} range={range} />}
  </div>;
}

function ProgressSections({ data, today, range }: { data: LearningActivityResponse; today: string; range: LearningActivityRange }) {
  const { t, i18n } = useTranslation();
  const { days, totals, previousTotal, dailyGoalMinutes, streak } = data;
  const activeDays = days.filter((day) => day.total > 0).length;
  const goalDays = dailyGoalMinutes === null ? null : days.filter((day) => day.total >= dailyGoalMinutes * 60).length;
  const longDay = new Intl.DateTimeFormat(i18n.language, { weekday: "long", month: "long", day: "numeric" });
  const dayName = (day: LearningActivityDay) => day.day === today ? t("learningHome.activity.today") : longDay.format(new Date(`${day.day}T12:00:00`));
  const scale = barScale(days);

  return <>
    <Surface className={styles.summary}>
      <div>
        <p className={styles.total}>{studyTime(t, totals.total)}</p>
        <p className={styles.muted}>{range === "week" ? t("learningHome.activity.pastWeek") : t("learningHome.activity.pastMonth")} · {changeLine(t, totals.total, previousTotal)}</p>
      </div>
      <dl className={styles.figures}>
        <div><dt>{t("progress.activeDays")}</dt><dd>{t("progress.ofDays", { count: activeDays, total: days.length })}</dd></div>
        <div><dt>{t("progress.average")}</dt><dd>{studyTime(t, Math.floor(totals.total / days.length))}</dd></div>
      </dl>
    </Surface>
    <div className={styles.grid}>
      <Surface className={styles.section}>
        <SectionHeader title={t("progress.categories.title")} description={t("progress.categories.description")} />
        {totals.total === 0
          ? <p className={styles.muted}>{t("learningHome.activity.empty")}</p>
          : <ul className={styles.categories} aria-label={t("progress.categories.title")}>
            {ACTIVITY_CATEGORIES.map((category) => {
              const share = Math.round((totals[category] / totals.total) * 100);
              return <li key={category} data-category={category}>
                <span className={styles.categoryName}><span className={styles.swatch} aria-hidden="true" />{t(`learningHome.categories.${category}`)}</span>
                <span className={styles.figure}>{studyTime(t, totals[category])} · {t("progress.categories.share", { percent: share })}</span>
                <span className={styles.track} aria-hidden="true"><span className={styles.fill} style={{ width: `${share}%` }} /></span>
              </li>;
            })}
          </ul>}
      </Surface>
      <Surface className={styles.section}>
        <SectionHeader title={t("progress.goal.title")} />
        <dl className={styles.figures}>
          <div><dt>{t("progress.goal.daily")}</dt><dd>{dailyGoalMinutes === null ? t("progress.goal.none") : t("courses.lessonBox.minutes", { count: dailyGoalMinutes })}</dd></div>
          {goalDays !== null && <div><dt>{t("progress.goal.met")}</dt><dd>{t("progress.ofDays", { count: goalDays, total: days.length })}</dd></div>}
          <div><dt>{t("progress.goal.streak")}</dt><dd>{t("progress.goal.streakDays", { count: streak })}</dd></div>
        </dl>
        {dailyGoalMinutes === null && <Link className={styles.link} to="/settings">{t("learningHome.continue.setGoal")}</Link>}
      </Surface>
    </div>
    {totals.total > 0 && <Surface className={styles.section}>
      <SectionHeader title={t("progress.days.title")} />
      <ol className={styles.days} aria-label={t("progress.days.title")}>
        {[...days].reverse().map((day) => <li key={day.day} data-today={day.day === today || undefined} data-empty={day.total === 0 || undefined}>
          <span className={styles.dayName}>{dayName(day)}</span>
          <span className={styles.figure}>{studyTime(t, day.total)}</span>
          <span className={styles.track} aria-hidden="true"><span className={styles.fill} style={{ width: `${(day.total / scale) * 100}%` }} /></span>
        </li>)}
      </ol>
    </Surface>}
  </>;
}
