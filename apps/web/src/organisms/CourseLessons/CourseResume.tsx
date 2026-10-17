import type { CourseDashboardResponse } from "@wordinator/contracts/learning";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { LabelChip } from "../../ui";
import styles from "./CourseResume.module.css";

// The library's dark Continue learning feature: study context on the left and the AI tutor entry on the right.
export function CourseResume({ resume }: { resume: NonNullable<CourseDashboardResponse["resume"]> }) {
  const { t } = useTranslation(); const { course, lesson } = resume;
  const continuing = lesson.storylinePercent > 0 && lesson.storylinePercent < 100;
  return <section className={styles.panel} aria-labelledby="continue-learning-title">
    <div className={styles.learning}>
      <LabelChip tone="accent">{t("courses.dashboard.inProgress")}</LabelChip>
      <div className={styles.copy}><h2 id="continue-learning-title">{course.title}</h2><p>{course.summary}</p></div>
      <p className={styles.lesson}>{t("courses.dashboard.lessonOf", { number: lesson.number, total: lesson.total, title: lesson.title })}</p>
      <div className={styles.meters}>
        <ProgressMeter value={lesson.storylinePercent} label={t("courses.dashboard.lessonProgress")} showLabel />
        <ProgressMeter value={course.coursePercent} label={t("courses.progress.yourLabel")} showLabel />
      </div>
      <Link className={styles.primaryAction} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: course.slug, lessonSlug: lesson.slug }} search={continuing ? { resume: true } : {}}>
        {continuing ? t("courses.player.continue") : lesson.storylinePercent === 100 ? t("courses.player.again") : t("courses.player.start")}<ArrowRight aria-hidden="true" />
      </Link>
    </div>
    <div className={styles.tutor}>
      <span className={styles.tutorMark} aria-hidden="true"><Sparkles /></span>
      <div><h3>{t("tutor.cta.title")}</h3><p>{t("tutor.cta.pitch")}</p></div>
      <Link className={styles.tutorAction} to="/ai">{t("tutor.cta.action")}<ArrowRight aria-hidden="true" /></Link>
    </div>
  </section>;
}
