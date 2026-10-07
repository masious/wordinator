import { commentResponseSchema, courseProgressResponseSchema, RESPONSE_ANSWER_MAX, type CourseLessonSummary } from "@wordinator/contracts";
import { flattenToSteps, type CourseLesson, type LessonBlockOf, type LessonStep } from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, lessonQueryOptions, practiceDiscussionQueryOptions } from "../../api";
import { Callout } from "../../molecules/Callout";
import { PlainText } from "../../molecules/PlainText";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { AdaptiveDialog, Button, ErrorState, LoadingState, TextAreaField } from "../../ui";
import { DialogueBlock, ExampleBlock, InlineText, LessonBlocks } from "../LessonDocument/LessonDocument";
import { CourseErrorMessage } from "./CourseErrorMessage";
import styles from "./LessonPlayer.module.css";
import { blockPath, practiceDraftKey, practiceFromBlock, readAnswers, storeAnswers, type Practice } from "./PracticeBlock";

// Readers play the published document. Editors preview the draft of a lesson that is not published yet; previews never count.
export const playableDocument = (lesson: CourseLesson) => lesson.document ?? lesson.draft?.document ?? null;
export const lessonSteps = (lesson: CourseLesson): LessonStep[] => {
  const document = playableDocument(lesson);
  return document ? flattenToSteps(document) : [];
};

export type PlayerScope = { groupId: string; courseId: string; accountId: string };

function ExampleStep({ block }: { block: LessonBlockOf<"example"> }) {
  const { t } = useTranslation(); const [shown, setShown] = useState(true);
  const { translation, note } = block.props;
  return <ExampleBlock block={block} details={<>
    {translation && (shown
      ? <figcaption className={styles.translation}>{translation}</figcaption>
      : <Button variant="quiet" className={styles.revealButton} onClick={() => setShown(true)}>{t("courses.player.showTranslation")}</Button>)}
    {note && (shown || !translation) && <p className={styles.note}>{note}</p>}
  </>} />;
}

// Answers share the practice block's local draft, so a set started here can be finished in the lesson view and the reverse.
function QuestionStep({ scope, lessonId, block, item, answers, onAnswer, shared, onShared }: {
  scope: PlayerScope; lessonId: string; block: Practice; item: number; answers: string[]; onAnswer: (value: string) => void; shared: boolean; onShared: () => void;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const { payload } = block; const last = item === payload.items.length - 1;
  const share = useMutation({
    mutationFn: () => apiRequest(`${blockPath({ ...scope, lessonId }, block.id)}/comments`, commentResponseSchema, { method: "POST", body: JSON.stringify({ kind: "practice_response", answers }) }),
    onSuccess: async () => {
      onShared();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lessonQueryOptions(scope.groupId, scope.courseId, lessonId).queryKey }),
        queryClient.invalidateQueries({ queryKey: practiceDiscussionQueryOptions(scope.groupId, scope.courseId, lessonId, block.id).queryKey }),
      ]);
    },
  });
  return <div className={styles.question}>
    <p className={styles.instruction}><PlainText>{payload.instruction}</PlainText></p>
    {payload.passage && <details className={styles.passage} open={item === 0}>
      <summary>{payload.passage.title ?? t("courses.practice.passage")}</summary>
      <p><PlainText>{payload.passage.content}</PlainText></p>
    </details>}
    <p className={styles.counter}>{t("courses.player.question", { current: item + 1, total: payload.items.length })}</p>
    <p className={styles.prompt}><PlainText>{payload.items[item]!.prompt}</PlainText></p>
    {shared
      ? <p className={styles.shared} role="status">{t("courses.player.shared")}</p>
      : <TextAreaField key={item} label={t("courses.player.yourAnswer")} value={answers[item] ?? ""} maxLength={RESPONSE_ANSWER_MAX} autosize minRows={2}
        onChange={(event) => onAnswer(event.currentTarget.value)} />}
    {last && !shared && answers.some((entry) => entry.trim()) && <div className={styles.shareRow}>
      <p className={styles.help}>{t("courses.player.shareHelp")}</p>
      <Button variant="secondary" loading={share.isPending} onClick={() => share.mutate()}>{t("courses.player.share")}</Button>
    </div>}
    <CourseErrorMessage error={share.error} />
  </div>;
}

function FinishStep({ scope, lesson, next, onNext, onClose }: {
  scope: PlayerScope; lesson: CourseLesson; next: CourseLessonSummary | undefined; onNext: (lessonId: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const progressKey = courseProgressQueryOptions(scope.groupId, scope.courseId).queryKey;
  const complete = useMutation({
    mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(scope.groupId)}/courses/${encodeURIComponent(scope.courseId)}/lessons/${encodeURIComponent(lesson.id)}/completion`, courseProgressResponseSchema, { method: "PUT" }),
    onSuccess: (data) => queryClient.setQueryData(progressKey, data),
  });
  const { mutate } = complete;
  // Unpublished lessons are previews for editors and never count toward progress.
  useEffect(() => { if (lesson.published) mutate(); }, [lesson.id, lesson.published, mutate]);
  const progress = complete.data; const mine = progress?.participants.find((entry) => entry.user.id === scope.accountId);
  return <div className={styles.finish} role="status">
    <span className={styles.badge} aria-hidden="true">✓</span>
    <h3>{t("courses.player.completeTitle")}</h3>
    {lesson.published
      ? progress && mine && <div className={styles.courseProgress}>
        <p>{t("courses.player.courseProgress", { percent: mine.percent, completed: mine.completedLessons, total: progress.publishedLessons })}</p>
        <ProgressMeter value={mine.percent} label={t("courses.progress.yourLabel")} />
      </div>
      : <p className={styles.help}>{t("courses.player.previewHelp")}</p>}
    <CourseErrorMessage error={complete.error} />
    <div className={styles.finishActions}>
      <Button variant={next ? "quiet" : "primary"} onClick={onClose}>{t("courses.player.backToCourse")}</Button>
      {next && <Button onClick={() => onNext(next.id)}>{t("courses.player.nextLesson", { title: next.title })}</Button>}
    </div>
  </div>;
}

function StepContent({ scope, lesson, step, answersFor, answer, shared, markShared }: {
  scope: PlayerScope; lesson: CourseLesson; step: LessonStep; answersFor: (practice: Practice) => string[];
  answer: (practice: Practice, item: number, value: string) => void; shared: Record<string, boolean>; markShared: (practice: Practice) => void;
}) {
  switch (step.kind) {
    case "content": return <div className={styles.content}><LessonBlocks blocks={step.blocks} /></div>;
    case "columns": return <div className={styles.content}><LessonBlocks blocks={[step.block]} /></div>;
    case "callout": return <Callout variant={step.block.props.variant} icon={step.block.props.icon}><InlineText content={step.block.content} /></Callout>;
    case "example": return <ExampleStep block={step.block} />;
    case "dialogueTurn": return <DialogueBlock block={step.block} upTo={step.turnIndex} />;
    case "practiceItem": {
      const practice = practiceFromBlock(step.block, lesson.answerCounts);
      return <QuestionStep scope={scope} lessonId={lesson.id} block={practice} item={step.itemIndex} answers={answersFor(practice)}
        onAnswer={(value) => answer(practice, step.itemIndex, value)} shared={shared[practice.id] ?? false} onShared={() => markShared(practice)} />;
    }
  }
}

function Player({ scope, lesson, next, onNext, onClose }: {
  scope: PlayerScope; lesson: CourseLesson; next: CourseLessonSummary | undefined; onNext: (lessonId: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  // Steps are fixed when the run starts, so a refetch (for example after sharing answers) never moves the reader.
  const [steps] = useState(() => lessonSteps(lesson));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [shared, setShared] = useState<Record<string, boolean>>({});
  const finished = index >= steps.length; const step = steps[index];
  const draftKey = (practice: Practice) => practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", practice.id);
  const answersFor = (practice: Practice) => answers[practice.id] ?? readAnswers(draftKey(practice), practice.payload.items.length);
  const answer = (practice: Practice, item: number, value: string) => {
    const nextAnswers = answersFor(practice).map((entry, position) => position === item ? value : entry);
    storeAnswers(draftKey(practice), nextAnswers);
    setAnswers((current) => ({ ...current, [practice.id]: nextAnswers }));
  };
  const markShared = (practice: Practice) => {
    storeAnswers(draftKey(practice), []);
    setShared((current) => ({ ...current, [practice.id]: true }));
  };
  const percent = steps.length ? (Math.min(index, steps.length) / steps.length) * 100 : 100;
  return <div className={styles.player}>
    <div className={styles.status}>
      <span className={styles.stepLabel}>{finished ? t("courses.player.done") : t("courses.player.step", { current: index + 1, total: steps.length })}</span>
      <ProgressMeter value={percent} label={t("courses.player.progressLabel")} />
    </div>
    {finished || !step
      ? <FinishStep scope={scope} lesson={lesson} next={next} onNext={onNext} onClose={onClose} />
      // A dialogue keeps one stage while its lines arrive, so only the newest line animates in.
      : <div className={styles.stage} key={step.kind === "dialogueTurn" ? step.block.id : index}>
        {step.heading && <p className={styles.section}>{step.heading}</p>}
        <StepContent scope={scope} lesson={lesson} step={step} answersFor={answersFor} answer={answer} shared={shared} markShared={markShared} />
      </div>}
    {!finished && <div className={styles.nav}>
      <Button variant="quiet" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>{t("common.back")}</Button>
      <Button onClick={() => setIndex((value) => value + 1)}>{index === steps.length - 1 ? t("courses.player.finish") : t("common.next")}</Button>
    </div>}
  </div>;
}

// A focused, step-by-step run through one lesson. Finishing a published lesson records it toward the viewer's course progress.
export function LessonPlayer({ scope, lessonId, outline, onChangeLesson, onClose }: {
  scope: PlayerScope; lessonId: string | null; outline: CourseLessonSummary[]; onChangeLesson: (lessonId: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const lesson = useQuery({ ...lessonQueryOptions(scope.groupId, scope.courseId, lessonId ?? ""), enabled: lessonId !== null });
  const position = outline.findIndex((entry) => entry.id === lessonId);
  const next = position >= 0 ? outline[position + 1] : undefined;
  const title = position >= 0 ? `${t("courses.lessons.number", { number: position + 1 })} · ${outline[position]!.title}` : "";
  return <AdaptiveDialog opened={lessonId !== null} onClose={onClose} title={title}>
    {lessonId !== null && (lesson.isPending ? <LoadingState label={t("courses.lessons.loading")} />
      : lesson.isError ? <ErrorState title={t("courses.lessons.unavailable")} />
      : <Player key={lessonId} scope={scope} lesson={lesson.data.lesson} next={next} onNext={onChangeLesson} onClose={onClose} />)}
  </AdaptiveDialog>;
}
