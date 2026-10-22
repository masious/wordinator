import type { CourseDashboardResponse, LearningActivityDay } from "@wordinator/contracts/learning";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnimatedEmoji } from "../../molecules/AnimatedEmoji";
import { LabelChip, LoadingState } from "../../ui";
import { notoEmoji } from "../LessonOverview/notoEmoji";
import { goalShare, studyTime } from "./learningSummary";
import styles from "./ContinueCard.module.css";

type Resume = NonNullable<CourseDashboardResponse["resume"]>;
const flame = notoEmoji("1f525");

// The home dashboard's Continue card (docs/learning-time.md#home-dashboard): the streak at the top, then, at the bottom over the
// resume lesson's image, its course and the lesson at its saved step, and beside it a ring with today's share of the study goal (or today's minutes
// without one) above the lesson's place in its course.
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
    ? { centre: time, caption: t("learningHome.continue.ringToday"), label: t("learningHome.continue.ringPlain", { time }) }
    : { centre: t("learningHome.continue.ringPercent", { percent: Math.round(share * 100) }), caption: t("learningHome.continue.ringTodayGoal"),
      label: t("learningHome.continue.ringGoal", { time, goal: dailyGoalMinutes }) };

  if (resume === undefined) return <section className={styles.card} aria-label={t("learningHome.continue.title")}><LoadingState label={t("learningHome.loading")} /></section>;
  // The resume read picks the lesson: the newest unfinished one with a saved step, else the first published lesson.
  const lesson = resume?.lesson;
  const continuing = lesson !== undefined && lesson.storylinePercent > 0 && lesson.storylinePercent < 100;
  const action = !resume ? null : continuing ? t("learningHome.continue.continueLesson")
    : lesson!.storylinePercent === 100 ? t("learningHome.continue.practiceAgain") : t("learningHome.continue.startLesson");

  // The lesson's image, else its course's cover; without either the card keeps its plain feature surface.
  const image = resume ? lesson!.imageUrl ?? resume.course.coverUrl : null;

  return <section className={styles.card} aria-labelledby="learning-continue-title">
    {image && <div className={styles.backdrop} aria-hidden="true"><img src={image} alt="" decoding="async" /></div>}
    <div className={styles.top}>{streak > 0 && <LabelChip className={styles.streak}>
      <AnimatedEmoji emoji="🔥" {...flame} playing />{t("learningHome.continue.streak", { count: streak })}
    </LabelChip>}</div>
    <div className={styles.copy}>
      <h2 id="learning-continue-title">{resume ? t("learningHome.continue.title") : t("learningHome.continue.noneTitle")}</h2>
      {resume ? <>
        <p className={styles.lesson}>{resume.course.title}</p>
        <h3 className={styles.lessonTitle}>{lesson!.title}</h3>
      </> : <p className={styles.muted}>{t("learningHome.continue.noneBody")}</p>}
      <div className={styles.actionRow}>
        <p className={styles.goal}>
          {goalLine}
          {share === null && <> <Link className={styles.goalLink} to="/settings">{t("learningHome.continue.setGoal")}</Link></>}
        </p>
        {resume && action && <Link className={styles.action} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: resume.course.slug, lessonSlug: lesson!.slug }}
          search={continuing ? { resume: true } : {}}>{action}<ArrowRight aria-hidden="true" /></Link>}
      </div>
    </div>
    <div className={styles.side}>
      <Ring share={share} {...ring} />
      {resume && <CoursePlace number={lesson!.number} total={lesson!.total} />}
    </div>
  </section>;
}

// The lesson's place in its course: one grey dot per lesson (those before it done, itself marked, those after it to come), then the
// same in words, so the dots are decoration.
function CoursePlace({ number, total }: { number: number; total: number }) {
  const { t } = useTranslation();
  return <div className={styles.place}>
    <ol className={styles.dots} aria-hidden="true" data-testid="lesson-dots">
      {Array.from({ length: total }, (_, index) => <li key={index} data-state={index + 1 < number ? "done" : index + 1 === number ? "current" : undefined} />)}
    </ol>
    <span className={styles.placeText}>{t("learningHome.continue.place", { number, total })}</span>
  </div>;
}

// A thin ring: the track, then the arc for the share of the goal (the arc turns the success colour at the goal).
function Ring({ share, centre, caption, label }: { share: number | null; centre: string; caption: string; label: string }) {
  const percent = share === null ? 0 : Math.round(share * 100);
  return <div className={styles.ring} role="img" aria-label={label}>
    <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <circle className={styles.track} cx="18" cy="18" r="15.9" pathLength={100} />
      {share !== null && percent > 0 && <circle className={styles.arc} data-met={share >= 1 || undefined} cx="18" cy="18" r="15.9" pathLength={100}
        strokeDasharray="100" strokeDashoffset={100 - percent} />}
    </svg>
    <span aria-hidden="true" className={styles.centre}>{centre}<small>{caption}</small></span>
  </div>;
}
