import type { CourseDashboardResponse, LearningActivityDay } from "@wordinator/contracts/learning";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LabelChip, LoadingState } from "../../ui";
import { goalShare, studyTime } from "./learningSummary";
import styles from "./ContinueCard.module.css";

type Resume = NonNullable<CourseDashboardResponse["resume"]>;

// The home dashboard's Continue card (docs/learning-time.md#home-dashboard): the streak, the most recent in-progress lesson at its
// saved step, and a ring with today's share of the study goal (or today's minutes without one).
export function ContinueCard({ today, dailyGoalMinutes, streak, resume }: {
  today: LearningActivityDay | undefined; dailyGoalMinutes: number | null; streak: number; resume: Resume | null | undefined;
}) {
  const { t } = useTranslation();
  const seconds = today?.total ?? 0;
  const share = goalShare(seconds, dailyGoalMinutes);
  const time = studyTime(t, seconds);
  const goalLine = share === null ? t("learningHome.continue.noGoal")
    : share >= 1 ? t("learningHome.continue.goalMet")
    : t("learningHome.continue.goalLeft", { time: studyTime(t, dailyGoalMinutes! * 60 - seconds) });
  const ring = share === null
    ? { centre: time, label: t("learningHome.continue.ringPlain", { time }) }
    : { centre: t("learningHome.continue.ringPercent", { percent: Math.round(share * 100) }), label: t("learningHome.continue.ringGoal", { time, goal: dailyGoalMinutes }) };

  if (resume === undefined) return <section className={styles.card} aria-label={t("learningHome.continue.title")}><LoadingState label={t("learningHome.loading")} /></section>;
  // The resume read picks the lesson: the newest unfinished one with a saved step, else the first published lesson.
  const lesson = resume?.lesson;
  const continuing = lesson !== undefined && lesson.storylinePercent > 0 && lesson.storylinePercent < 100;
  const action = !resume ? null : continuing ? t("learningHome.continue.continueLesson")
    : lesson!.storylinePercent === 100 ? t("learningHome.continue.practiceAgain") : t("learningHome.continue.startLesson");

  return <section className={styles.card} aria-labelledby="learning-continue-title">
    <div className={styles.copy}>
      <div className={styles.top}>{streak > 0 && <LabelChip tone="accent">{t("learningHome.continue.streak", { count: streak })}</LabelChip>}</div>
      <h2 id="learning-continue-title">{resume ? t("learningHome.continue.title") : t("learningHome.continue.noneTitle")}</h2>
      {resume
        ? <p className={styles.lesson}>{t("learningHome.continue.lesson", { number: lesson!.number, total: lesson!.total, course: resume.course.title })}</p>
        : <p className={styles.muted}>{t("learningHome.continue.noneBody")}</p>}
      <p className={styles.goal}>
        {goalLine}
        {share === null && <> <Link className={styles.goalLink} to="/settings">{t("learningHome.continue.setGoal")}</Link></>}
      </p>
      {resume && action && <Link className={styles.action} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: resume.course.slug, lessonSlug: lesson!.slug }}
        search={continuing ? { resume: true } : {}}>{action}<ArrowRight aria-hidden="true" /></Link>}
    </div>
    <Ring share={share} {...ring} />
  </section>;
}

// A thin ring: the track, then the arc for the share of the goal (the arc turns the success colour at the goal).
function Ring({ share, centre, label }: { share: number | null; centre: string; label: string }) {
  const percent = share === null ? 0 : Math.round(share * 100);
  return <div className={styles.ring} role="img" aria-label={label}>
    <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <circle className={styles.track} cx="18" cy="18" r="15.9" pathLength={100} />
      {share !== null && percent > 0 && <circle className={styles.arc} data-met={share >= 1 || undefined} cx="18" cy="18" r="15.9" pathLength={100}
        strokeDasharray="100" strokeDashoffset={100 - percent} />}
    </svg>
    <span aria-hidden="true" className={styles.centre}>{centre}</span>
  </div>;
}
