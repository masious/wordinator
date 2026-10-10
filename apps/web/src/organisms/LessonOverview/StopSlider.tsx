import type { LessonStep } from "@wordinator/contracts/lesson-document";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { AdaptiveDialog, Button, TextAreaField } from "../../ui";
import { opensSection, QuestionPrompt, stageKey, StepStage } from "../CourseLessons/LessonPlayer";
import { practiceFromBlock } from "../CourseLessons/PracticeBlock";
import { stopStatus, type LessonOverview, type OverviewStop } from "./overviewModel";
import styles from "./StopSlider.module.css";

// The lesson player's stage, limited to one stop's steps. Moving past the reader's furthest step advances it, as the player saves
// positions; reviewing a finished stop or previewing one ahead changes nothing. Prototype answers live only in this dialog.
// With `onShowWords`, the words are listed elsewhere: steps leave out their New words panel, a words-only step points there
// instead, and `onStep` reports the step on stage. `badge` replaces the check on the finished-section screen.
export function Slider({ overview, stop, reached, onReach, onNextStop, onClose, onStep, onShowWords, badge }: {
  overview: LessonOverview; stop: OverviewStop; reached: number; onReach: (reached: number) => void; onNextStop: (stop: OverviewStop) => void; onClose: () => void;
  onStep?: (step: LessonStep | null) => void; onShowWords?: () => void; badge?: ReactNode;
}) {
  const { t } = useTranslation();
  const total = stop.end - stop.start;
  const [index, setIndex] = useState(() => stopStatus(stop, reached) === "current" ? reached - stop.start : 0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const step = overview.steps[stop.start + index];
  const nextStop = overview.stops[overview.stops.indexOf(stop) + 1];
  const staged = index < total ? step ?? null : null;
  useEffect(() => { onStep?.(staged); }, [staged, onStep]);
  const forward = () => {
    if (stop.start + index === reached) onReach(reached + 1);
    setIndex((value) => value + 1);
  };
  if (index >= total || !step) return <div className={styles.finish} role="status">
    <span className={styles.badge} aria-hidden="true" data-custom={badge ? true : undefined}>{badge ?? "✓"}</span>
    <h3>{t("courses.overview.slider.doneTitle")}</h3>
    <p className={styles.help}>{t("courses.overview.slider.doneHelp", { done: overview.stops.filter((entry) => stopStatus(entry, reached) === "done").length, total: overview.stops.length })}</p>
    <div className={styles.actions}>
      <Button variant={nextStop ? "quiet" : "primary"} onClick={onClose}>{t("courses.overview.slider.back")}</Button>
      {nextStop && <Button onClick={() => onNextStop(nextStop)}>{t("courses.overview.slider.next", { title: nextStop.title })}</Button>}
    </div>
  </div>;
  return <div className={styles.slider}>
    <div className={styles.status}>
      <span className={styles.stepLabel}>{t("courses.overview.stepOf", { current: index + 1, total })}</span>
      <ProgressMeter value={(index / total) * 100} label={t("courses.overview.slider.progressLabel")} />
    </div>
    {onShowWords && step.kind === "words"
      ? <div className={styles.wordsStep}>
        <p className={styles.help}>{t("courses.overview.slider.wordsElsewhere", { count: step.words.length })}</p>
        <Button variant="secondary" onClick={onShowWords}>{t("courses.overview.words.show")}</Button>
      </div>
      : <StepStage key={stageKey(step, index)} step={step} words={!onShowWords} opensSection={opensSection(overview.steps, stop.start + index)} renderQuestion={(question) => {
      const key = `${question.block.id}:${question.itemIndex}`;
      return <div className={styles.question}>
        <QuestionPrompt block={practiceFromBlock(question.block, {})} item={question.itemIndex} />
        <TextAreaField label={t("courses.player.yourAnswer")} description={t("courses.overview.slider.answerHelp")} value={answers[key] ?? ""} autosize minRows={2}
          onChange={(event) => { const value = event.currentTarget.value; setAnswers((current) => ({ ...current, [key]: value })); }} />
      </div>;
    }} />}
    <div className={styles.nav}>
      <Button variant="quiet" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>{t("common.back")}</Button>
      <Button onClick={forward}>{index === total - 1 ? t("courses.overview.slider.finish") : t("common.next")}</Button>
    </div>
  </div>;
}

export function StopSlider({ overview, stop, reached, onReach, onChangeStop, onClose }: {
  overview: LessonOverview; stop: OverviewStop | null; reached: number; onReach: (reached: number) => void; onChangeStop: (stop: OverviewStop) => void; onClose: () => void;
}) {
  return <AdaptiveDialog opened={stop !== null} onClose={onClose} title={stop?.title ?? ""}>
    {stop && <Slider key={stop.id} overview={overview} stop={stop} reached={reached} onReach={onReach} onNextStop={onChangeStop} onClose={onClose} />}
  </AdaptiveDialog>;
}
