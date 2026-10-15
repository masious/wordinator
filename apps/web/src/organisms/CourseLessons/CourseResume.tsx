import type { CourseLessonSummary } from "@wordinator/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { courseProgressQueryOptions } from "../../api";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Button, Surface } from "../../ui";
import styles from "./CourseResume.module.css";

// The course-wide way back into studying, on the lesson's own page. It resumes the most recently moved unfinished lesson, scrolled
// to its saved step, otherwise starts the first lesson they have not finished, otherwise offers the first lesson again. Lessons that
// count come first: an unpublished lesson is chosen only when nothing in the course is published, and then it opens as a preview.
export function CourseResume({ groupId, courseId, accountId, courseSlug, outline }: {
  groupId: string; courseId: string; accountId: string; courseSlug: string; outline: CourseLessonSummary[];
}) {
  const { t } = useTranslation(); const navigate = useNavigate();
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  if (!outline.length) return null;
  const completed = new Set(progress.data?.completedLessonIds ?? []);
  const resume = (progress.data?.positions ?? []).filter((entry) => !completed.has(entry.lessonId))
    .map((entry) => ({ entry, index: outline.findIndex((lesson) => lesson.id === entry.lessonId) })).find(({ index }) => index >= 0);
  const candidates = outline.some((lesson) => lesson.published) ? outline.filter((lesson) => lesson.published) : outline;
  const unfinished = candidates.find((lesson) => !completed.has(lesson.id));
  const target = resume ? outline[resume.index]! : unfinished ?? candidates[0]!;
  const number = outline.indexOf(target) + 1;
  const mine = progress.data?.publishedLessons ? progress.data.participants.find((entry) => entry.user.id === accountId) : undefined;
  const [label, namedLabel, help] = resume
    ? ["courses.player.continue", "courses.player.continueNamed", t("courses.resume.continueHelp", { number, title: target.title, current: resume.entry.stepIndex + 1, total: resume.entry.totalSteps })] as const
    : unfinished ? ["courses.player.start", "courses.player.startNamed", t("courses.resume.startHelp", { number, title: target.title })] as const
    : ["courses.player.again", "courses.player.againNamed", t("courses.resume.doneHelp")] as const;
  const open = () => void navigate({ to: "/courses/$courseSlug/lessons/$lessonSlug", params: { courseSlug, lessonSlug: target.slug }, search: resume ? { resume: true } : {} });
  return <Surface className={styles.card}>
    <div className={styles.copy}>
      <div className={styles.heading}>
        <h2>{resume ? t("courses.resume.continueTitle") : t("courses.resume.title")}</h2>
        {mine && <span className={styles.percent}>{t("courses.progress.percent", { percent: mine.percent })}</span>}
      </div>
      {mine && <ProgressMeter value={mine.percent} label={t("courses.progress.yourLabel")} />}
      <p className={styles.help}>{help}</p>
      {!target.published && <p className={styles.help}>{t("courses.resume.previewHelp")}</p>}
    </div>
    <Button className={styles.action} variant={resume || unfinished ? "primary" : "secondary"} onClick={open} aria-label={t(namedLabel, { number })}>{t(label)}</Button>
  </Surface>;
}
