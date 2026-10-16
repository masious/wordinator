import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Dumbbell, MessageCircle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { lessonMetricsQueryOptions } from "../../api";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { relativeTime } from "../../relativeTime";
import styles from "./LessonBox.module.css";

export type LessonBoxLesson = { groupId: string; courseId: string; courseTitle: string; lessonId: string; title: string; number: number };

// The lesson box (docs/courses.md#lesson-box), pinned under the rail's navigation for the open lesson: its reading progress,
// Practise words (a drill of the course's words) beside Ask AI (a new tutor conversation prefilled to talk the lesson's grammar and
// topics through), Ask for more practices like this (a new tutor conversation with a prefilled request naming the lesson), and,
// once the viewer has studied the lesson, their figures: words remembered well, pronunciation fluency, and when they last studied
// it. A prefilled conversation sends nothing until the learner sends it.
export function LessonBox({ lesson, percent }: { lesson: LessonBoxLesson; percent: number }) {
  const { t } = useTranslation();
  const metrics = useQuery(lessonMetricsQueryOptions(lesson.groupId, lesson.courseId, lesson.lessonId));
  const named = { number: lesson.number, lesson: lesson.title, course: lesson.courseTitle };
  const { pronunciation, words, lastStudiedAt } = metrics.data ?? { pronunciation: null, words: null, lastStudiedAt: null };
  const fluency = pronunciation?.fluency ?? null;
  const studied = (words?.practised ?? 0) > 0 || fluency !== null || lastStudiedAt !== null;
  return <section className={styles.box} aria-label={t("courses.lessonBox.title")}>
    <ProgressMeter value={percent} label={t("courses.lessonBox.progress")} showLabel />
    <div className={styles.actions}>
      <div className={styles.pair}>
        <Link className={styles.action} to="/words/drill" search={{ source: "course", course: lesson.courseId, direction: "mixed" }}>
          <Dumbbell aria-hidden="true" /><span className={styles.label}>{t("courses.lessonBox.practiseWords")}</span>
        </Link>
        <Link className={styles.action} to="/ai" search={{ prompt: t("courses.lessonBox.askAiPrompt", named) }}>
          <MessageCircle aria-hidden="true" /><span className={styles.label}>{t("courses.lessonBox.askAi")}</span>
        </Link>
      </div>
      <Link className={styles.action} to="/ai" search={{ prompt: t("courses.lessonBox.morePracticesPrompt", named) }}>
        <Sparkles aria-hidden="true" /><span className={styles.label}>{t("courses.lessonBox.morePractices")}</span>
      </Link>
    </div>
    {studied && <div className={styles.fluency}>
      <p className={styles.fluencyTitle}>{t("courses.lessonBox.fluency")}</p>
      <dl className={styles.figures}>
        {words && words.total > 0 && <div><dt>{t("courses.lessonBox.wordsStrong")}</dt><dd>{t("courses.lessonBox.wordsCount", { strong: words.strong, total: words.total })}</dd></div>}
        {pronunciation && fluency !== null && <>
          <div><dt>{t("courses.lessonBox.pronunciation")}</dt><dd>{t("courses.lessonBox.score", { score: fluency })}</dd></div>
          <div><dt className={styles.quiet}>{t("courses.lessonBox.spokenAttempts", { count: pronunciation.attempts })}</dt></div>
        </>}
        {lastStudiedAt !== null && <div><dt>{t("courses.lessonBox.lastStudied")}</dt><dd>{relativeTime(lastStudiedAt)}</dd></div>}
      </dl>
    </div>}
  </section>;
}
