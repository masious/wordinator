import { Badge } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Dumbbell, Sparkles } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { TypicalTime } from "@wordinator/contracts/learning";
import { CategoryBadge } from "./LessonIndex";
import type { OverviewCategory } from "../LessonOverview/overviewModel";
import { lessonActivityFocus, type ActivityDescriptor, type ActivityType } from "@wordinator/contracts/lesson-activities";
import type { TFunction } from "i18next";
import { lessonMetricsQueryOptions } from "../../api";
import { learningClock, useMinuteRefresh } from "../../learningTime";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { relativeTime } from "../../relativeTime";
import { LabelChip } from "../../ui";
import { useRailSlots } from "../GroupFrame/GroupFrame";
import { activityIcon } from "../LessonActivities/activityIcons";
import { Figure, FigureList, FiguresDisclosure, FiguresReveal, useFiguresOpen } from "../StudyTime/StudyTime";
import type { ActivityPart } from "./activitySections";
import { HeadingDot } from "./HeadingDot";
import { typicalMinutes } from "./LessonTime";
import styles from "./LessonBox.module.css";

// The learning category that colours an action (docs/design-system.md#learning-categories): grammar activities are grammar; story
// activities and the speaking ones built on story sections are story. Practise words is the words category.
const activityCategory = (type: ActivityType) => lessonActivityFocus(type) === "grammar" ? "grammar" : "story";

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

// A suggested activity for the section at the reading line. `done` marks the viewer's own completed run of the current version
// (docs/lesson-activities.md#scope-and-entry-point).
// `part` is the grammar part (a level-3 heading) the activity belongs to, marked with that part's colour dot.
export type LessonActivitySuggestion = { descriptor: ActivityDescriptor; type: ActivityType; done?: boolean; part?: ActivityPart | null };

// The activity type's icon; the svg carries data-icon so tests can tell the icons apart.
function ActivityGlyph({ type }: { type: ActivityType }) {
  const Icon = activityIcon(type);
  return <Icon aria-hidden="true" data-icon={type} />;
}

// Renders one suggested activity as a link to its page: its type's icon on a block in the type's category, its label, and a check
// once done. A grammar part's activities start with the part's colour dot. `named` keeps the source's name in the accessible name
// (visually hidden), for links whose surroundings do not name it.
function useActivityLink(courseSlug: string | undefined, lessonSlug: string | undefined) {
  const { t } = useTranslation();
  const activityLabel: Record<ActivityType, string> = {
    story_summary: t("lessonActivities.types.story_summary"), story_comprehension: t("lessonActivities.types.story_comprehension"),
    grammar_explanation: t("lessonActivities.types.grammar_explanation"), guided_grammar: t("lessonActivities.types.guided_grammar"),
    tricky_grammar: t("lessonActivities.types.tricky_grammar"), mixed_practice: t("lessonActivities.types.mixed_practice"), roleplay: t("lessonActivities.types.roleplay"),
    read_aloud: t("lessonActivities.types.read_aloud"), speak_from_english: t("lessonActivities.types.speak_from_english"),
  };
  // A check-only mark: the word is visually hidden (so the accessible name reads "Story summary Done") and shows as a title tooltip.
  // A space separates it from the label.
  const doneBadge = (done: boolean | undefined) => done ? <>
    {" "}<span className={styles.done} title={t("courses.lessonBox.activityDone")}><Check aria-hidden="true" /><span className={styles.doneText}>{t("courses.lessonBox.activityDone")}</span></span>
  </> : null;
  return ({ descriptor, type, done, part }: LessonActivitySuggestion, named: boolean) => <Link key={`${descriptor.sourceId}:${type}`} className={styles.action} data-category={activityCategory(type)}
    title={`${activityLabel[type]} · ${descriptor.sourceLabel}`} to="/courses/$courseSlug/lessons/$lessonSlug/activities/$sourceId/$activityType"
    params={{ courseSlug: courseSlug!, lessonSlug: lessonSlug!, sourceId: descriptor.sourceId, activityType: type }}>
    <ActivityGlyph type={type} /><span className={styles.label}>{part && <><HeadingDot color={part.color} />{" "}</>}{activityLabel[type]}{named && <>{" "}<span className={styles.doneText}>· {descriptor.sourceLabel}</span></>}</span>{doneBadge(done)}
  </Link>;
}

// A source's activities in the text, after the last block of the section they come from, under a small
// Do more with AI heading. Every link keeps its source in its accessible name.
export function SectionActivities({ suggestions, courseSlug, lessonSlug }: { suggestions: readonly LessonActivitySuggestion[]; courseSlug: string; lessonSlug: string }) {
  const { t } = useTranslation();
  const activityLink = useActivityLink(courseSlug, lessonSlug);
  return <aside className={styles.inline} aria-label={t("courses.lessonBox.doMoreWithAi")}>
    <p className={styles.inlineHeading}><Sparkles aria-hidden="true" />{t("courses.lessonBox.doMoreWithAi")}</p>
    <div className={styles.inlineLinks}>{suggestions.map((suggestion) => activityLink(suggestion, true))}</div>
  </aside>;
}

// The lesson's actions, above the profile row: Practise words (a drill of the course's words) beside Ask AI (a new tutor
// conversation prefilled to talk the lesson's grammar and topics through), and Ask for more practices like this (a new tutor
// conversation with a prefilled request naming the lesson). A prefilled conversation sends nothing until the learner sends it.
// `compact` shows icons only, stacked (names stay as tooltips and accessible names). A done suggestion ends with a Done badge,
// which compact mode reduces to a check on the icon while its text stays for assistive technology. The header's badge counts the
// completed suggestions, and shows nothing until there is one.
// `completedCount` is the lesson-wide count of the viewer's completed activities (the completed list), not only this section's.
export function LessonBoxActions({ lesson, compact = false, courseSlug, lessonSlug, suggestions = [], completedCount = 0, sectionLabel: label, sectionCategory }: { lesson: LessonBoxLesson; compact?: boolean; courseSlug?: string; lessonSlug?: string; suggestions?: readonly LessonActivitySuggestion[]; completedCount?: number; sectionLabel?: string | null; sectionCategory?: OverviewCategory | undefined }) {
  const { t } = useTranslation();
  const named = { number: lesson.number, lesson: lesson.title, course: lesson.courseTitle };
  // The section the suggestions belong to: dialogue suggestions share their section's heading, so name that section.
  // `sectionLabel`, when given, names it (the lesson page passes its current index entry).
  const sectionLabel = label !== undefined ? label : (suggestions.find((entry) => entry.descriptor.sourceKind === "section")?.descriptor.sourceLabel ?? suggestions[0]?.descriptor.sourceLabel.replace(/^Dialogue · /, "")) || null;
  // Every link but the first keeps its source in its accessible name; so does the first when it belongs to a grammar part, which
  // the heading does not name.
  const activityLink = useActivityLink(courseSlug, lessonSlug);
  return <div className={styles.actions} data-compact={compact || undefined} role="group" aria-label={t("courses.lessonBox.actions")}>
    <h2 className={styles.actionsHeading}><Sparkles aria-hidden="true" /><span>{t("courses.lessonBox.doMoreWithAi")}</span>
      {completedCount > 0 && <Badge component="span" variant="light" size="sm" aria-label={t("courses.lessonBox.activitiesDoneCount", { count: completedCount })}>{completedCount}</Badge>}
      {/* The active section's category badge, as its row in the lesson index shows it, at the row's end. */}
      {sectionCategory && <span className={styles.sectionBadge}><CategoryBadge category={sectionCategory} active /></span>}</h2>
    {sectionLabel && <p className={styles.section} title={sectionLabel}>{sectionLabel}</p>}
    <div className={styles.pair}>
      <Link className={styles.action} data-category="words" title={compact ? t("courses.lessonBox.practiseWords") : undefined} to="/words/drill" search={{ source: "course", course: lesson.courseId, direction: "mixed" }}>
        <Dumbbell aria-hidden="true" /><span className={styles.label}>{t("courses.lessonBox.practiseWords")}</span>
      </Link>
      {suggestions.slice(0, 1).map((suggestion) => activityLink(suggestion, Boolean(suggestion.part)))}
    </div>
    {suggestions.slice(1).map((suggestion) => activityLink(suggestion, true))}
  </div>;
}
