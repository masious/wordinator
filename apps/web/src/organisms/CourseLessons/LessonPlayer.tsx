import {
  commentResponseSchema, courseProgressResponseSchema, lessonPositionResponseSchema, type CourseLessonSummary, type LessonPosition,
} from "@wordinator/contracts";
import {
  flattenToSteps, lessonStepKey, resolveStepIndex, type CourseLesson, type LessonBlockOf, type LessonStep,
} from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, lessonQueryOptions, practiceDiscussionQueryOptions } from "../../api";
import { Callout } from "../../molecules/Callout";
import { PlainText } from "../../molecules/PlainText";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { AdaptiveDialog, Button, ErrorState, LoadingState } from "../../ui";
import { DialogueBlock, ExampleBlock, InlineText, LessonBlocks, NewWords } from "../LessonDocument/LessonDocument";
import { useLessonBookmarkTarget, WordBookmarkScope } from "../WordBookmark/WordBookmark";
import { runWords, WordRecap } from "../WordRecap/WordRecap";
import { CourseErrorMessage } from "./CourseErrorMessage";
import styles from "./LessonPlayer.module.css";
import { AnswerField, type AnswerSubmit, blockPath, practiceDraftKey, practiceFromBlock, readAnswers, storeAnswers, type Practice } from "./PracticeBlock";

// Readers play the published document. Editors preview the draft of a lesson that is not published yet; previews never count.
export const playableDocument = (lesson: CourseLesson) => lesson.document ?? lesson.draft?.document ?? null;
export const lessonSteps = (lesson: CourseLesson): LessonStep[] => {
  const document = playableDocument(lesson);
  return document ? flattenToSteps(document) : [];
};

export type PlayerScope = { groupId: string; courseId: string; accountId: string };
const lessonApiPath = (scope: PlayerScope, lessonId: string) =>
  `/api/groups/${encodeURIComponent(scope.groupId)}/courses/${encodeURIComponent(scope.courseId)}/lessons/${encodeURIComponent(lessonId)}`;

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

// The instruction, reading passage, and prompt of one practice item, without the answer field.
export function QuestionPrompt({ block, item }: { block: Practice; item: number }) {
  const { t } = useTranslation(); const { payload } = block;
  return <>
    <p className={styles.instruction}><PlainText>{payload.instruction}</PlainText></p>
    {payload.passage && <details className={styles.passage} open={item === 0}>
      <summary>{payload.passage.title ?? t("courses.practice.passage")}</summary>
      <p><PlainText>{payload.passage.content}</PlainText></p>
    </details>}
    <p className={styles.counter}>{t("courses.player.question", { current: item + 1, total: payload.items.length })}</p>
    <p className={styles.prompt}><PlainText>{payload.items[item]!.prompt}</PlainText></p>
  </>;
}

// Answers share the practice block's local draft, so a set started here can be finished in the lesson view and the reverse.
function QuestionStep({ scope, lessonId, block, item, answers, onAnswer, shared, onShared, onNext, submitRef }: {
  scope: PlayerScope; lessonId: string; block: Practice; item: number; answers: string[]; onAnswer: (value: string) => void; shared: boolean; onShared: () => void;
  onNext: () => void; submitRef: AnswerSubmit;
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
    <QuestionPrompt block={block} item={item} />
    {shared
      ? <p className={styles.shared} role="status">{t("courses.player.shared")}</p>
      : <AnswerField key={item} scope={{ ...scope, lessonId }} blockId={block.id} item={item} prompt={payload.items[item]!.prompt} label={t("courses.player.yourAnswer")} description={t("courses.practice.enterHelp")}
        value={answers[item] ?? ""} minRows={2} onChange={onAnswer} onAdvance={onNext} submitRef={submitRef} />}
    {last && !shared && answers.some((entry) => entry.trim()) && <div className={styles.shareRow}>
      <p className={styles.help}>{t("courses.player.shareHelp")}</p>
      <Button variant="secondary" loading={share.isPending} onClick={() => share.mutate()}>{t("courses.player.share")}</Button>
    </div>}
    <CourseErrorMessage error={share.error} />
  </div>;
}

function FinishStep({ scope, lesson, next, onNext, onClose, onReview }: {
  scope: PlayerScope; lesson: CourseLesson; next: CourseLessonSummary | undefined; onNext: (lessonId: string) => void; onClose: () => void; onReview?: () => void;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const progressKey = courseProgressQueryOptions(scope.groupId, scope.courseId).queryKey;
  const complete = useMutation({
    mutationFn: () => apiRequest(`${lessonApiPath(scope, lesson.id)}/completion`, courseProgressResponseSchema, { method: "PUT" }),
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
    {onReview && <Button variant="secondary" onClick={onReview}>{t("courses.player.reviewWords")}</Button>}
    <div className={styles.finishActions}>
      <Button variant={next ? "quiet" : "primary"} onClick={onClose}>{t("courses.player.backToCourse")}</Button>
      {next && <Button onClick={() => onNext(next.id)}>{t("courses.player.nextLesson", { title: next.title })}</Button>}
    </div>
  </div>;
}

type QuestionStepOf = Extract<LessonStep, { kind: "practiceItem" }>;
function StepContent({ step, renderQuestion }: { step: LessonStep; renderQuestion: (step: QuestionStepOf) => ReactNode }) {
  switch (step.kind) {
    case "content": return <div className={styles.content}><LessonBlocks blocks={step.blocks} /></div>;
    case "columns": return <div className={styles.content}><LessonBlocks blocks={[step.block]} /></div>;
    case "callout": return <Callout variant={step.block.props.variant} icon={step.block.props.icon}><InlineText content={step.block.content} /></Callout>;
    case "example": return <ExampleStep block={step.block} />;
    case "dialogueTurn": return <DialogueBlock block={step.block} upTo={step.turnIndex} />;
    case "practiceItem": return renderQuestion(step);
    case "words": return <NewWords words={step.words} />;
  }
}

// A step's words show in a New words panel below it. A words-only step is the list itself, and a column list read as one step
// already shows its words in place.
const hasWordsPanel = (step: LessonStep) => step.words.length > 0 && step.kind !== "words" && step.kind !== "columns";

// Key a stage with `stageKey`: a dialogue keeps one stage while its lines arrive, so only the newest line animates in.
export const stageKey = (step: LessonStep, index: number) => step.kind === "dialogueTurn" ? step.block.id : String(index);

// The first step under a heading shows it as the stage's title; later steps in the section keep it as a small label. A dialogue's
// lines share one stage, so they all follow the line that opens it.
export const opensSection = (steps: readonly LessonStep[], index: number) => {
  const step = steps[index]; if (!step) return false;
  const first = index - (step.kind === "dialogueTurn" ? step.turnIndex : 0);
  return first <= 0 || steps[first - 1]?.heading !== step.heading;
};

// One step on its stage. The caller supplies how a practice question is answered; everything else renders the same everywhere.
export function StepStage({ step, opensSection = false, renderQuestion }: { step: LessonStep; opensSection?: boolean; renderQuestion: (step: QuestionStepOf) => ReactNode }) {
  return <div className={styles.stage}>
    {step.heading && (opensSection ? <h3 className={styles.sectionTitle}>{step.heading}</h3> : <p className={styles.section}>{step.heading}</p>)}
    <StepContent step={step} renderQuestion={renderQuestion} />
    {hasWordsPanel(step) && <NewWords words={step.words} />}
  </div>;
}

function Player({ scope, lesson, position, next, onNext, onClose }: {
  scope: PlayerScope; lesson: CourseLesson; position: LessonPosition | undefined; next: CourseLessonSummary | undefined; onNext: (lessonId: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  // Steps are fixed when the run starts, so a refetch (for example after sharing answers) never moves the reader.
  const [steps] = useState(() => lessonSteps(lesson));
  const [words] = useState(() => runWords(steps)); const [reviewing, setReviewing] = useState(false);
  // Words of the published document can be bookmarked in the panels and the recap; a preview's cannot.
  const bookmarkTarget = useLessonBookmarkTarget(scope.groupId, scope.courseId, lesson.id, lesson.document);
  // A published lesson resumes at the reader's saved step; previews always start at the beginning.
  const [start] = useState(() => lesson.published && position && steps.length ? resolveStepIndex(steps, position.stepKey, position.stepIndex) : 0);
  const [index, setIndex] = useState(start); const [resumed, setResumed] = useState(start > 0);
  const save = useMutation({
    mutationFn: (stepKey: string) => apiRequest(`${lessonApiPath(scope, lesson.id)}/position`, lessonPositionResponseSchema, { method: "PUT", body: JSON.stringify({ stepKey }) }),
  });
  const { mutate: savePosition } = save;
  // Each move saves the step now shown. The resumed step is already saved, so opening the player alone records nothing.
  const shown = useRef(start);
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index; setResumed(false);
    const current = steps[index];
    if (lesson.published && current) savePosition(lessonStepKey(current));
  }, [index, lesson.published, savePosition, steps]);
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
  // Next and Enter share one action. On a question with a filled, unchecked answer it shows the check's feedback first; the
  // next press moves on. Enter outside a field or control acts as Next, so pressing it repeatedly walks through the lesson.
  const answerSubmit: AnswerSubmit = useRef(null);
  const advance = () => setIndex((value) => value + 1);
  const forward = () => { if (answerSubmit.current) answerSubmit.current(); else advance(); };
  const forwardRef = useRef(forward); forwardRef.current = forward;
  // The dialog focuses its close button on opening, where Enter would close the player; start on Next instead.
  const nav = useRef<HTMLDivElement>(null);
  useEffect(() => { nav.current?.querySelector<HTMLButtonElement>("[data-next]")?.focus(); }, []);
  useEffect(() => {
    if (finished) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.defaultPrevented || event.repeat || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, summary, [contenteditable]")) return;
      event.preventDefault();
      forwardRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [finished]);
  const percent = steps.length ? (Math.min(index, steps.length) / steps.length) * 100 : 100;
  return <WordBookmarkScope resolve={bookmarkTarget}><div className={styles.player}>
    <div className={styles.status}>
      <span className={styles.stepLabel}>{finished ? t("courses.player.done") : t("courses.player.step", { current: index + 1, total: steps.length })}</span>
      <ProgressMeter value={percent} label={t("courses.player.progressLabel")} />
    </div>
    {resumed && <div className={styles.resumed} role="status">
      <span>{t("courses.player.resumed")}</span>
      <Button variant="quiet" onClick={() => setIndex(0)}>{t("courses.player.startOver")}</Button>
    </div>}
    {finished || !step
      // The lesson recap covers the completion screen, which stays mounted so its completion is recorded once.
      ? <>
        <div hidden={reviewing}>
          <FinishStep scope={scope} lesson={lesson} next={next} onNext={onNext} onClose={onClose} onReview={words.length ? () => setReviewing(true) : undefined} />
        </div>
        {reviewing && <WordRecap words={words} doneLabel={t("courses.player.backToSummary")} onDone={() => setReviewing(false)} />}
      </>
      : <StepStage key={stageKey(step, index)} step={step} opensSection={opensSection(steps, index)} renderQuestion={(question) => {
        const practice = practiceFromBlock(question.block, lesson.answerCounts);
        return <QuestionStep scope={scope} lessonId={lesson.id} block={practice} item={question.itemIndex} answers={answersFor(practice)}
          onAnswer={(value) => answer(practice, question.itemIndex, value)} shared={shared[practice.id] ?? false} onShared={() => markShared(practice)}
          onNext={advance} submitRef={answerSubmit} />;
      }} />}
    {!finished && <div ref={nav} className={styles.nav}>
      <Button variant="quiet" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>{t("common.back")}</Button>
      <Button data-next data-autofocus onClick={forward}>{index === steps.length - 1 ? t("courses.player.finish") : t("common.next")}</Button>
    </div>}
  </div></WordBookmarkScope>;
}

// A focused, step-by-step run through one lesson. Each step of a published lesson is saved as the viewer's position, and finishing
// records the lesson toward the viewer's course progress.
export function LessonPlayer({ scope, lessonId, outline, positions, onChangeLesson, onClose }: {
  scope: PlayerScope; lessonId: string | null; outline: CourseLessonSummary[]; positions: readonly LessonPosition[];
  onChangeLesson: (lessonId: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const lesson = useQuery({ ...lessonQueryOptions(scope.groupId, scope.courseId, lessonId ?? ""), enabled: lessonId !== null });
  const position = outline.findIndex((entry) => entry.id === lessonId);
  const next = position >= 0 ? outline[position + 1] : undefined;
  const title = position >= 0 ? `${t("courses.lessons.number", { number: position + 1 })} · ${outline[position]!.title}` : "";
  return <AdaptiveDialog opened={lessonId !== null} onClose={onClose} title={title}>
    {lessonId !== null && (lesson.isPending ? <LoadingState label={t("courses.lessons.loading")} />
      : lesson.isError ? <ErrorState title={t("courses.lessons.unavailable")} />
      : <Player key={lessonId} scope={scope} lesson={lesson.data.lesson} position={positions.find((entry) => entry.lessonId === lessonId)} next={next} onNext={onChangeLesson} onClose={onClose} />)}
  </AdaptiveDialog>;
}
