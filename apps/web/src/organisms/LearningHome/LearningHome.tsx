import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { localDayOf, type LearningActivityRange } from "@wordinator/contracts/learning";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { courseDashboardQueryOptions, learningActivityQueryOptions } from "../../api";
import { Eyebrow, ErrorState, LoadingState } from "../../ui";
import { ActivityCard } from "./ActivityCard";
import { ContinueCard } from "./ContinueCard";
import { dayOf } from "./learningSummary";
import styles from "./LearningHome.module.css";

// The signed-in home dashboard (C15e, docs/learning-time.md#home-dashboard): a header with the date and a greeting, then the Continue
// and Activity cards. The activity read ends on the learner's local today, so the day's bar and ring follow their clock.
export function LearningHome({ groupId, displayName }: { groupId: string; displayName: string }) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<LearningActivityRange>("week");
  const now = new Date();
  const today = localDayOf(now);
  const activity = useQuery({ ...learningActivityQueryOptions(groupId, range, today), placeholderData: keepPreviousData });
  const dashboard = useQuery(courseDashboardQueryOptions(groupId));
  const part = now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening";
  const date = new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long" }).format(now);

  return <div className={styles.home}>
    <header className={styles.header}>
      <div className={styles.copy}>
        <Eyebrow>{date}</Eyebrow>
        <h1>{t(`learningHome.greeting.${part}`, { name: displayName })}</h1>
        <p>{t("learningHome.intro")}</p>
      </div>
      <Link className={styles.practice} to="/ai">{t("learningHome.practiceWithAi")}</Link>
    </header>
    {activity.isError ? <ErrorState title={t("learningHome.unavailable")} />
      : !activity.data ? <LoadingState label={t("learningHome.loading")} />
      : <div className={styles.grid}>
        <ContinueCard today={dayOf(activity.data.days, today)} dailyGoalMinutes={activity.data.dailyGoalMinutes} streak={activity.data.streak}
          resume={dashboard.isPending ? undefined : dashboard.data?.resume ?? null} />
        <ActivityCard data={activity.data} today={today} range={range} onRange={setRange} lang={i18n.language} />
      </div>}
  </div>;
}
