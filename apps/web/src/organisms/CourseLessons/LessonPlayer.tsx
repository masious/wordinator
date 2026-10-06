import { commentResponseSchema, courseProgressResponseSchema, RESPONSE_ANSWER_MAX, type CourseBlock, type CourseLesson, type CourseLessonSummary } from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, lessonQueryOptions, practiceDiscussionQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { AdaptiveDialog, Button, ErrorState, LoadingState, TextAreaField } from "../../ui";
import { CourseErrorMessage } from "./CourseErrorMessage";
import styles from "./LessonPlayer.module.css";
import { blockPath, practiceDraftKey, readAnswers, storeAnswers } from "./PracticeBlock";

type Block<K extends CourseBlock["kind"]> = Extract<CourseBlock, { kind: K }>;
// Headings title the steps that follow them instead of being steps of their own.
export type LessonStep =
  | { kind: "text"; section: string | null; block: Block<"text"> }
  | { kind: "example"; section: string | null; block: Block<"example"> }
  | { kind: "dialogue"; section: string | null; block: Block<"dialogue">; turn: number }
  | { kind: "question"; section: string | null; block: Block<"practice">; item: number };

// Sentences arrive one after another: every dialogue line and every practice item is its own step.
export function lessonSteps(blocks: CourseBlock[]): LessonStep[] {
  const steps: LessonStep[] = []; let section: string | null = null;
  for (const block of blocks) {
    switch (block.kind) {
      case "heading": section = block.payload.title; break;
      case "text": steps.push({ kind: "text", section, block }); break;
      case "example": steps.push({ kind: "example", section, block }); break;
      case "dialogue": block.payload.turns.forEach((_, turn) => steps.push({ kind: "dialogue", section, block, turn })); break;
      case "practice": block.payload.items.forEach((_, item) => steps.push({ kind: "question", section, block, item })); break;
    }
  }
  return steps;
}

export type PlayerScope = { groupId: string; courseId: string; accountId: string };

function ExampleStep({ block }: { block: Block<"example"> }) {
  const { t } = useTranslation(); const [shown, setShown] = useState(false);
  const { sentence, translation, note } = block.payload;
  return <figure className={styles.example}>
    <blockquote className={styles.sentence}><PlainText>{sentence}</PlainText></blockquote>
    {translation && (shown
      ? <figcaption className={styles.translation}><PlainText>{translation}</PlainText></figcaption>
      : <Button variant="quiet" className={styles.revealButton} onClick={() => setShown(true)}>{t("courses.player.showTranslation")}</Button>)}
    {note && (shown || !translation) && <p className={styles.note}><PlainText>{note}</PlainText></p>}
  </figure>;
}

function DialogueStep({ block, turn }: { block: Block<"dialogue">; turn: number }) {
  return <ol className={styles.dialogue}>
    {block.payload.turns.slice(0, turn + 1).map((entry, index) => <li key={index} className={index === turn ? styles.newest : undefined}>
      <span className={styles.speaker}>{entry.speaker}</span><span className={styles.line}><PlainText>{entry.text}</PlainText></span>
    </li>)}
  </ol>;
}

// Answers share the practice block's local draft, so a set started here can be finished in the lesson view and the reverse.
function QuestionStep({ scope, lessonId, block, item, answers, onAnswer, shared, onShared }: {
  scope: PlayerScope; lessonId: string; block: Block<"practice">; item: number; answers: string[]; onAnswer: (value: string) => void; shared: boolean; onShared: () => void;
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

function Player({ scope, lesson, next, onNext, onClose }: {
  scope: PlayerScope; lesson: CourseLesson; next: CourseLessonSummary | undefined; onNext: (lessonId: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  // Steps are fixed when the run starts, so a refetch (for example after sharing answers) never moves the reader.
  const [steps] = useState(() => lessonSteps(lesson.blocks));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [shared, setShared] = useState<Record<string, boolean>>({});
  const finished = index >= steps.length; const step = steps[index];
  const answersFor = (block: Block<"practice">) => answers[block.id] ?? readAnswers(practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id), block.payload.items.length);
  const answer = (block: Block<"practice">, item: number, value: string) => {
    const nextAnswers = answersFor(block).map((entry, position) => position === item ? value : entry);
    storeAnswers(practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id), nextAnswers);
    setAnswers((current) => ({ ...current, [block.id]: nextAnswers }));
  };
  const markShared = (block: Block<"practice">) => {
    storeAnswers(practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id), []);
    setShared((current) => ({ ...current, [block.id]: true }));
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
      : <div className={styles.stage} key={step.kind === "dialogue" ? step.block.id : index}>
        {step.section && <p className={styles.section}>{step.section}</p>}
        {step.kind === "text" && <p className={styles.text}><PlainText>{step.block.payload.content}</PlainText></p>}
        {step.kind === "example" && <ExampleStep block={step.block} />}
        {step.kind === "dialogue" && <DialogueStep block={step.block} turn={step.turn} />}
        {step.kind === "question" && <QuestionStep scope={scope} lessonId={lesson.id} block={step.block} item={step.item} answers={answersFor(step.block)}
          onAnswer={(value) => answer(step.block, step.item, value)} shared={shared[step.block.id] ?? false} onShared={() => markShared(step.block)} />}
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
