import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Dumbbell, MessageCircle, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TypicalTime } from "@wordinator/contracts/learning";
import type { TFunction } from "i18next";
import { lessonMetricsQueryOptions } from "../../api";
import { learningClock, useMinuteRefresh } from "../../learningTime";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { relativeTime } from "../../relativeTime";
import { Figure, FigureList, StudyPeriodPanel, StudyPeriodSwitch, StudyTimeFigures, useStudyPeriod } from "../StudyTime/StudyTime";
import { typicalMinutes } from "./LessonTime";
import styles from "./LessonBox.module.css";

export type LessonBoxLesson = { groupId: string; courseId: string; courseTitle: string; lessonId: string; title: string; number: number };

// The lesson box (docs/courses.md#lesson-box), pinned under the rail's navigation for the open lesson: its reading progress,
// Practise words (a drill of the course's words) beside Ask AI (a new tutor conversation prefilled to talk the lesson's grammar and
// topics through), Ask for more practices like this (a new tutor conversation with a prefilled request naming the lesson), and,
// a Lesson | Today | Week switch (docs/learning-time.md#study-time), hidden until the chevron beside the percentage opens it. Lesson shows, once the viewer has studied the lesson, their
// figures: words remembered well, pronunciation fluency, and when they last studied it, and their reading and practice time with
// the lesson's typical times (C15, docs/learning-time.md#lesson-and-practice-times), refreshed once a minute from the clock's
// unsent seconds; Today and This week show the rail's study time. A prefilled conversation sends nothing until the learner sends it.
const duration = (t: TFunction, seconds: number) => seconds < 60 ? t("courses.lessonBox.underMinute") : t("courses.lessonBox.minutes", { count: Math.floor(seconds / 60) });
const typicalLine = (t: TFunction, typical: TypicalTime) =>
  t("courses.lessonBox.typical", { time: t("courses.lessonBox.minutes", { count: typicalMinutes(typical.seconds) }), count: typical.learners });

// Whether the box's figures are shown. They start hidden, since the box already holds the progress and three actions; the choice
// is a per-device convenience, so storage that cannot be read or written leaves them hidden.
const FIGURES_OPEN_KEY = "wordinator:ui:v1:lesson-box-figures-open";
function useFiguresOpen() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(FIGURES_OPEN_KEY) === "1"; } catch { return false; } });
  const toggle = () => setOpen((current) => {
    try { localStorage.setItem(FIGURES_OPEN_KEY, current ? "0" : "1"); } catch { /* storage unavailable */ }
    return !current;
  });
  return [open, toggle] as const;
}

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
  const [period, choose] = useStudyPeriod(true);
  const [open, toggle] = useFiguresOpen();
  const figuresId = useId();
  const studied = (words?.practised ?? 0) > 0 || fluency !== null || lastStudiedAt !== null || reading > 0 || practice > 0;
  return <section className={styles.box} aria-label={t("courses.lessonBox.title")}>
    <ProgressMeter value={percent} label={t("courses.lessonBox.progress")} showLabel labelEnd={
      <button type="button" className={styles.disclosure} aria-expanded={open} aria-controls={figuresId}
        aria-label={t(open ? "courses.lessonBox.hideFigures" : "courses.lessonBox.showFigures")} onClick={toggle}>
        <ChevronDown aria-hidden="true" />
      </button>} />
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
    <div id={figuresId} className={styles.reveal} data-open={open || undefined} inert={!open}><div className={styles.fluency}>
      <StudyPeriodSwitch value={period} onChange={choose} withLesson />
      <StudyPeriodPanel period={period} withLesson>{period !== "lesson" ? <StudyTimeFigures groupId={lesson.groupId} period={period} />
        : !studied ? <p className={styles.note}>{t("courses.lessonBox.notStudied")}</p>
        : <FigureList>
          {words && words.total > 0 && <Figure label={t("courses.lessonBox.wordsStrong")} value={t("courses.lessonBox.wordsCount", { strong: words.strong, total: words.total })} />}
          {pronunciation && fluency !== null && <>
            <Figure label={t("courses.lessonBox.pronunciation")} value={t("courses.lessonBox.score", { score: fluency })} />
            <Figure quiet label={t("courses.lessonBox.spokenAttempts", { count: pronunciation.attempts })} />
          </>}
          {(reading > 0 || time?.typical.reading) && <Figure label={t("courses.lessonBox.reading")} value={reading > 0 ? duration(t, reading) : "–"} />}
          {time?.typical.reading && <Figure quiet label={typicalLine(t, time.typical.reading)} />}
          {(practice > 0 || time?.typical.practice) && <Figure label={t("courses.lessonBox.practice")} value={practice > 0 ? duration(t, practice) : "–"} />}
          {time?.typical.practice && <Figure quiet label={typicalLine(t, time.typical.practice)} />}
          {lastStudiedAt !== null && <Figure label={t("courses.lessonBox.lastStudied")} value={relativeTime(lastStudiedAt)} />}
        </FigureList>}</StudyPeriodPanel>
    </div></div>
  </section>;
}
