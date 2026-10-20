import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Dumbbell, MessageCircle, Sparkles } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { TypicalTime } from "@wordinator/contracts/learning";
import type { TFunction } from "i18next";
import { lessonMetricsQueryOptions } from "../../api";
import { learningClock, useMinuteRefresh } from "../../learningTime";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { relativeTime } from "../../relativeTime";
import { LabelChip } from "../../ui";
import { useRailSlots } from "../GroupFrame/GroupFrame";
import { Figure, FigureList, FiguresDisclosure, FiguresReveal, useFiguresOpen } from "../StudyTime/StudyTime";
import { typicalMinutes } from "./LessonTime";
import styles from "./LessonBox.module.css";

export type LessonBoxLesson = { groupId: string; courseId: string; courseTitle: string; lessonId: string; title: string; number: number };

// The lesson box (docs/courses.md#lesson-box), pinned at the top of the rail for the open lesson: the lesson's number and title,
// its progress, and, hidden until the chevron beside the percentage opens them, the viewer's figures for the lesson once they have
// studied it: words remembered well, pronunciation fluency, and when they last studied it, and their reading and practice time
// with the lesson's typical times (C15, docs/learning-time.md#lesson-and-practice-times), refreshed once a minute from the clock's
// unsent seconds. While the rail's Study time card is shown the box shrinks to its label and progress. Its actions sit apart, at
// the bottom of the rail (`LessonBoxActions`).
const duration = (t: TFunction, seconds: number) => seconds < 60 ? t("courses.lessonBox.underMinute") : t("courses.lessonBox.minutes", { count: Math.floor(seconds / 60) });
const typicalLine = (t: TFunction, typical: TypicalTime) =>
  t("courses.lessonBox.typical", { time: t("courses.lessonBox.minutes", { count: typicalMinutes(typical.seconds) }), count: typical.learners });
const LESSON_FIGURES_OPEN_KEY = "wordinator:ui:v1:lesson-figures-open";

export function LessonBox({ lesson, percent }: { lesson: LessonBoxLesson; percent: number }) {
  const { t } = useTranslation();
  const metrics = useQuery(lessonMetricsQueryOptions(lesson.groupId, lesson.courseId, lesson.lessonId));
  const { pronunciation, words, lastStudiedAt } = metrics.data ?? { pronunciation: null, words: null, lastStudiedAt: null };
  const fluency = pronunciation?.fluency ?? null;
  useMinuteRefresh();
  const time = metrics.data?.time;
  const pending = (activities: readonly string[]) => learningClock().pendingSeconds((target) => activities.includes(target.activity) && "lessonId" in target && target.lessonId === lesson.lessonId);
  const reading = (time?.readingSeconds ?? 0) + pending(["reading"]);
  const practice = (time?.practiceSeconds ?? 0) + pending(["practice", "ai_practice"]);
  const [stored, toggle] = useFiguresOpen(LESSON_FIGURES_OPEN_KEY);
  const compact = useRailSlots().studyOpen === true;
  const open = stored && !compact;
  const figuresId = useId();
  const studied = (words?.practised ?? 0) > 0 || fluency !== null || lastStudiedAt !== null || reading > 0 || practice > 0;
  return <section className={styles.box} aria-label={t("courses.lessonBox.title")} data-compact={compact || undefined}>
    <div className={styles.heading}>
      <LabelChip tone="accent">{t("courses.lessonBox.number", { number: lesson.number })}</LabelChip>
      <div className={styles.titleReveal} inert={compact}><p className={styles.title}>{lesson.title}</p></div>
    </div>
    <ProgressMeter value={percent} label={t("courses.lessonBox.progress")} showLabel labelEnd={compact ? null : <FiguresDisclosure open={open} controls={figuresId} onToggle={toggle} />} />
    <FiguresReveal id={figuresId} open={open}>
      {!studied ? <p className={styles.note}>{t("courses.lessonBox.notStudied")}</p>
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
        </FigureList>}
    </FiguresReveal>
  </section>;
}

// The lesson's actions, above the profile row: Practise words (a drill of the course's words) beside Ask AI (a new tutor
// conversation prefilled to talk the lesson's grammar and topics through), and Ask for more practices like this (a new tutor
// conversation with a prefilled request naming the lesson). A prefilled conversation sends nothing until the learner sends it.
// `compact` shows icons only, stacked (names stay as tooltips and accessible names).
export function LessonBoxActions({ lesson, compact = false }: { lesson: LessonBoxLesson; compact?: boolean }) {
  const { t } = useTranslation();
  const named = { number: lesson.number, lesson: lesson.title, course: lesson.courseTitle };
  return <div className={styles.actions} data-compact={compact || undefined} role="group" aria-label={t("courses.lessonBox.actions")}>
    <div className={styles.pair}>
      <Link className={styles.action} title={compact ? t("courses.lessonBox.practiseWords") : undefined} to="/words/drill" search={{ source: "course", course: lesson.courseId, direction: "mixed" }}>
        <Dumbbell aria-hidden="true" /><span className={styles.label}>{t("courses.lessonBox.practiseWords")}</span>
      </Link>
      <Link className={styles.action} title={compact ? t("courses.lessonBox.askAi") : undefined} to="/ai" search={{ prompt: t("courses.lessonBox.askAiPrompt", named) }}>
        <MessageCircle aria-hidden="true" /><span className={styles.label}>{t("courses.lessonBox.askAi")}</span>
      </Link>
    </div>
    <Link className={styles.action} title={compact ? t("courses.lessonBox.morePractices") : undefined} to="/ai" search={{ prompt: t("courses.lessonBox.morePracticesPrompt", named) }}>
      <Sparkles aria-hidden="true" /><span className={styles.label}>{t("courses.lessonBox.morePractices")}</span>
    </Link>
  </div>;
}
