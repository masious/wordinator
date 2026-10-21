import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { ActivityDescriptor, ActivityMetricChange, ActivityType } from "@wordinator/contracts/lesson-activities";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Button, Surface } from "../../ui";
import { activityIcon } from "./activityIcons";
import styles from "./LessonActivity.module.css";

type LessonParams = { courseSlug: string; lessonSlug: string };

// The return link: the canonical lesson URL and the section's heading (or block) anchor; the lesson top when there is none.
export const lessonTarget = (props: LessonParams, descriptor?: ActivityDescriptor) => ({
  to: "/courses/$courseSlug/lessons/$lessonSlug" as const,
  params: { courseSlug: props.courseSlug, lessonSlug: props.lessonSlug },
  hash: descriptor?.returnHeadingId ?? descriptor?.returnBlockId ?? undefined,
});

const Glyph = ({ type }: { type: ActivityType }) => { const Icon = activityIcon(type); return <Icon aria-hidden="true" />; };
const percent = (value: number) => Math.round(value * 100);

export type ActivityCompletionProps = LessonParams & {
  // What `{{lesson}}` in the lesson-share metric names.
  lessonLabel: string;
  descriptors: readonly ActivityDescriptor[];
  descriptor: ActivityDescriptor;
  // Guided grammar only: the model's follow-up types; the presence of this prop also enables Back to practices.
  followUps?: readonly ActivityType[] | undefined;
  // Fresh from the completing PATCH; absent when a finished run is revisited.
  metrics?: readonly ActivityMetricChange[] | undefined;
  restarting: boolean;
  onRestart: () => void;
};

// Completion (docs/lesson-activities.md): the changed metrics as bars, then "Up next", then the back links.
export function ActivityCompletion({ courseSlug, lessonSlug, lessonLabel, descriptors, descriptor, followUps, metrics, restarting, onRestart }: ActivityCompletionProps) {
  const { t } = useTranslation();
  const changed = (metrics ?? []).filter((metric) => metric.before !== metric.after);
  const index = descriptors.findIndex((entry) => entry.sourceId === descriptor.sourceId);
  const offering = (type: ActivityType) => descriptors.slice(index + 1).find((entry) => entry.activityTypes.includes(type)) ?? descriptors.find((entry) => entry.activityTypes.includes(type));
  const next = descriptors.slice(index + 1).find((entry) => entry.activityTypes.length > 0);
  const nextTypes = next ? [...next.activityTypes].sort((a, b) => Number(b === "guided_grammar") - Number(a === "guided_grammar")) : [];
  const suggestions: { source: ActivityDescriptor; type: ActivityType }[] = [];
  for (const type of followUps ?? []) { const source = offering(type); if (source) suggestions.push({ source, type }); }
  if (next) for (const type of nextTypes) suggestions.push({ source: next, type });
  const lesson = { courseSlug, lessonSlug };
  const practices = followUps ? { ...lessonTarget(lesson, descriptor), hash: descriptor.practiceBlockId ?? lessonTarget(lesson, descriptor).hash } : null;

  return <Surface className={styles.panel}>
    <h2>{t("lessonActivities.finished")}</h2><p>{t("lessonActivities.finishedBody")}</p>
    {changed.length > 0 && <div className={styles.score} data-testid="completion-metrics">
      {changed.map((metric) => <ProgressMeter key={metric.key} value={percent(metric.after)} showLabel
        label={t(`lessonActivities.metrics.${metric.key}`, { lesson: lessonLabel, percent: percent(metric.after), delta: percent(metric.after - metric.before) })} />)}
    </div>}
    {suggestions.length > 0 && <nav aria-label={t("courses.lessonBox.upNext")}><h3>{t("courses.lessonBox.upNext")}</h3>
      <ul className={styles.upNext}>{suggestions.map(({ source, type }) => <li key={`${source.sourceId}:${type}`}>
        <Link className={styles.action} to="/courses/$courseSlug/lessons/$lessonSlug/activities/$sourceId/$activityType"
          params={{ courseSlug, lessonSlug, sourceId: source.sourceId, activityType: type }}>
          <Glyph type={type} /><span>{t(`lessonActivities.types.${type}`)} · {source.sourceLabel}</span></Link></li>)}</ul></nav>}
    <div className={styles.actions}>
      <Link className={styles.back} {...lessonTarget(lesson, descriptor)}><ArrowLeft aria-hidden="true" />{t("lessonActivities.backToLesson")}</Link>
      {practices && <Link className={styles.back} {...practices}>{t("lessonActivities.backToPractices")}</Link>}
      <Button variant="secondary" loading={restarting} onClick={onRestart}>{t("lessonActivities.startAgain")}</Button>
    </div>
  </Surface>;
}
