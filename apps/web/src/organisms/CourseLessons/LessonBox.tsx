import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Dumbbell, MessageCircle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TypicalTime } from "@wordinator/contracts/learning";
import type { TFunction } from "i18next";
import { lessonMetricsQueryOptions } from "../../api";
import { learningClock, useMinuteRefresh } from "../../learningTime";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { relativeTime } from "../../relativeTime";
import styles from "./LessonBox.module.css";

export type LessonBoxLesson = { groupId: string; courseId: string; courseTitle: string; lessonId: string; title: string; number: number };

// The lesson box (docs/courses.md#lesson-box), pinned under the rail's navigation for the open lesson: its reading progress,
// Practise words (a drill of the course's words) beside Ask AI (a new tutor conversation prefilled to talk the lesson's grammar and
// topics through), Ask for more practices like this (a new tutor conversation with a prefilled request naming the lesson), and,
// once the viewer has studied the lesson, their figures: words remembered well, pronunciation fluency, and when they last studied
// it, and their reading and practice time with the lesson's typical times (C15, docs/learning-time.md#lesson-and-practice-times),
// refreshed once a minute from the clock's unsent seconds. A prefilled conversation sends nothing until the learner sends it.
const duration = (t: TFunction, seconds: number) => seconds < 60 ? t("courses.lessonBox.underMinute") : t("courses.lessonBox.minutes", { count: Math.floor(seconds / 60) });
const typicalLine = (t: TFunction, typical: TypicalTime | null) => typical
  && t("courses.lessonBox.typical", { time: t("courses.lessonBox.minutes", { count: Math.max(1, Math.round(typical.seconds / 60)) }), count: typical.learners });

export function LessonBox({ lesson, percent }: { lesson: LessonBoxLesson; percent: number }) {
  const { t } = useTranslation();
  const metrics = useQuery(lessonMetricsQueryOptions(lesson.groupId, lesson.courseId, lesson.lessonId));
  const named = { number: lesson.number, lesson: lesson.title, course: lesson.courseTitle };
  const { pronunciation, words, lastStudiedAt } = metrics.data ?? { pronunciation: null, words: null, lastStudiedAt: null };
  const fluency = pronunciation?.fluency ?? null;
  useMinuteRefresh();
  const time = metrics.data?.time;
  const pending = (activities: readonly string[]) => learningClock().pendingSeconds((target) => activities.includes(target.activity) && "lessonId" in target && target.lessonId === lesson.lessonId);
  const reading = (time?.readingSeconds ?? 0) + pending(["reading"]);
  const practice = (time?.practiceSeconds ?? 0) + pending(["practice", "ai_practice"]);
  const studied = (words?.practised ?? 0) > 0 || fluency !== null || lastStudiedAt !== null || reading > 0 || practice > 0;
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
        {(reading > 0 || time?.typical.reading) && <div><dt>{t("courses.lessonBox.reading")}</dt><dd>{reading > 0 ? duration(t, reading) : "–"}</dd></div>}
        {time?.typical.reading && <div><dt className={styles.quiet}>{typicalLine(t, time.typical.reading)}</dt></div>}
        {(practice > 0 || time?.typical.practice) && <div><dt>{t("courses.lessonBox.practice")}</dt><dd>{practice > 0 ? duration(t, practice) : "–"}</dd></div>}
        {time?.typical.practice && <div><dt className={styles.quiet}>{typicalLine(t, time.typical.practice)}</dt></div>}
        {lastStudiedAt !== null && <div><dt>{t("courses.lessonBox.lastStudied")}</dt><dd>{relativeTime(lastStudiedAt)}</dd></div>}
      </dl>
    </div>}
  </section>;
}
