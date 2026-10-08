import type { CourseLessonSummary } from "@wordinator/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { courseProgressQueryOptions, courseWordsQueryOptions } from "../../api";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Button, Surface } from "../../ui";
import { LessonPlayer } from "./LessonPlayer";
import styles from "./CourseResume.module.css";

// The viewer's one way into the lesson player. It resumes the most recently moved unfinished lesson at its saved step, otherwise
// starts the first lesson they have not finished, otherwise offers the first lesson again. Lessons that count come first: an
// unpublished lesson is chosen only when nothing in the course is published, and then it plays as a preview.
export function CourseResume({ groupId, courseId, accountId, outline }: {
  groupId: string; courseId: string; accountId: string; outline: CourseLessonSummary[];
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [playing, setPlaying] = useState<string | null>(null);
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
    <Button className={styles.action} variant={resume || unfinished ? "primary" : "secondary"} onClick={() => setPlaying(target.id)} aria-label={t(namedLabel, { number })}>{t(label)}</Button>
    <LessonPlayer scope={{ groupId, courseId, accountId }} lessonId={playing} outline={outline} positions={progress.data?.positions ?? []}
      onChangeLesson={setPlaying}
      onClose={() => {
        setPlaying(null);
        // The player saved the reader's steps while it was open; refresh the positions and percentages it changed, and the
        // course recap, which a finished lesson may extend.
        void queryClient.invalidateQueries({ queryKey: courseProgressQueryOptions(groupId, courseId).queryKey });
        void queryClient.invalidateQueries({ queryKey: courseWordsQueryOptions(groupId, courseId).queryKey });
      }} />
  </Surface>;
}
