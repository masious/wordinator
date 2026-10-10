import type { CourseLessonSummary, LessonPosition } from "@wordinator/contracts";
import { walkLessonBlocks, type CourseLesson } from "@wordinator/contracts/lesson-document";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { lessonQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { lessonSpeech, SpeechScope } from "../../molecules/Speech";
import { AdaptiveDialog, Button, ErrorState, LoadingState } from "../../ui";
import { useLessonBookmarkTarget, WordBookmarkScope } from "../WordBookmark/WordBookmark";
import { runWords, WordRecap } from "../WordRecap/WordRecap";
import { lessonSteps, type PlayerScope } from "./LessonPlayer";
import styles from "./LessonActions.module.css";
import { AnswerSetComposer, practiceFromBlock, PracticeContent, usePracticeProgress, type Practice } from "./PracticeBlock";

// What the lesson's play action does for this viewer. An unpublished lesson (only editors see one) plays as a preview from the
// start; a saved position resumes, also in a finished lesson practised again; a finished lesson otherwise starts again.
export type PlayAction = "preview" | "continue" | "again" | "start";
export const playAction = (lesson: Pick<CourseLessonSummary, "published">, completed: boolean, position: LessonPosition | undefined): PlayAction =>
  !lesson.published ? "preview" : position ? "continue" : completed ? "again" : "start";

// Loads the lesson only once one of its dialogs opens; the course read carries just the counts that decide which actions show.
function LoadedLesson({ scope, lessonId, children }: { scope: PlayerScope; lessonId: string; children: (lesson: CourseLesson) => ReactNode }) {
  const { t } = useTranslation();
  const lesson = useQuery(lessonQueryOptions(scope.groupId, scope.courseId, lessonId));
  if (lesson.isPending) return <LoadingState label={t("courses.lessons.loading")} />;
  if (lesson.isError) return <ErrorState title={t("courses.lessons.unavailable")} />;
  return children(lesson.data.lesson);
}

// The lesson's new words as word cards, exactly like the player's lesson recap: once each, in step order.
function LessonRecap({ scope, lesson, onDone }: { scope: PlayerScope; lesson: CourseLesson; onDone: () => void }) {
  const { t } = useTranslation();
  const words = useMemo(() => runWords(lessonSteps(lesson)), [lesson]);
  const bookmarkTarget = useLessonBookmarkTarget(scope.groupId, scope.courseId, lesson.id, lesson.document);
  const speech = useMemo(() => lessonSpeech(lesson), [lesson]);
  const resolveSpeech = useCallback((key: string) => speech[key] ?? null, [speech]);
  if (!words.length) return <p className={styles.empty}>{t("courses.lessonActions.noWords")}</p>;
  return <WordBookmarkScope resolve={bookmarkTarget}><SpeechScope resolve={resolveSpeech}>
    <WordRecap words={words} doneLabel={t("courses.words.backToCourse")} onDone={onDone} />
  </SpeechScope></WordBookmarkScope>;
}

// The practices of the published document, in document order (columns included).
const lessonPractices = (lesson: CourseLesson): Practice[] => lesson.document
  ? [...walkLessonBlocks(lesson.document.blocks)].flatMap(({ block }) => block.type === "practice" ? [practiceFromBlock(block, lesson.practiceProgress)] : [])
  : [];

function PracticeStatus({ practice }: { practice: Practice }) {
  const { t } = useTranslation();
  const total = practice.payload.items.length; const answered = Math.min(practice.progress.answered ?? 0, total);
  if (answered >= total) return <span className={styles.done}><span aria-hidden="true">✓ </span>{t("courses.lessonActions.practiceDone")}</span>;
  return <span className={styles.status}>{answered ? t("courses.lessonActions.practiceAnswered", { answered, total }) : t("courses.lessonActions.questions", { count: total })}</span>;
}

// The lesson's practices as a short list. Choosing one opens its answer set, the same one the lesson page's Answer button opens;
// finishing it (Done or Finish later) saves progress and returns to the list.
function PracticeList({ scope, lesson, selected, onSelect }: { scope: PlayerScope; lesson: CourseLesson; selected: Practice | null; onSelect: (practice: Practice | null) => void }) {
  const { t } = useTranslation();
  const practices = lessonPractices(lesson);
  const saveProgress = usePracticeProgress({ ...scope, lessonId: lesson.id }, lesson.document !== null);
  if (selected) return <div className={styles.answering}>
    <PracticeContent block={selected} prompts={false} />
    <AnswerSetComposer scope={{ ...scope, lessonId: lesson.id }} block={selected} onDone={() => { saveProgress(selected); onSelect(null); }} />
  </div>;
  if (!practices.length) return <p className={styles.empty}>{t("courses.lessonActions.noPractices")}</p>;
  return <ol className={styles.practices}>{practices.map((practice, index) => <li key={practice.id}>
    <button type="button" className={styles.practice} onClick={() => onSelect(practice)}>
      <span className={styles.practiceNumber}>{index + 1}</span>
      <span className={styles.practiceCopy}>
        <span className={styles.instruction}><PlainText>{practice.payload.instruction}</PlainText></span>
        <PracticeStatus practice={practice} />
      </span>
    </button>
  </li>)}</ol>;
}

// Per-lesson actions on the course page: play (Start, Continue, Start again, or Preview), Review words, and Practise again. Review
// words and Practise again show only when the published lesson has words or practices; Practise again is left out of archived
// courses, which refuse practice progress.
export function LessonActions({ scope, summary, number, completed, position, archived, onPlay }: {
  scope: PlayerScope; summary: CourseLessonSummary; number: number; completed: boolean; position: LessonPosition | undefined; archived: boolean;
  onPlay: (lessonId: string) => void;
}) {
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState(false);
  const [practising, setPractising] = useState(false); const [selected, setSelected] = useState<Practice | null>(null);
  const saveProgress = usePracticeProgress({ ...scope, lessonId: summary.id }, summary.published);
  const action = playAction(summary, completed, position);
  const named = { number, title: summary.title };
  const words = summary.wordCount > 0; const practices = summary.practiceCount > 0 && !archived;
  // Closing the practice dialog in any way saves the open answer set's progress, as on the lesson page.
  const closePractices = () => { if (selected) saveProgress(selected); setSelected(null); setPractising(false); };
  return <div className={styles.actions} role="group" aria-label={t("courses.lessonActions.label", named)}>
    <Button variant={action === "continue" || action === "start" ? "secondary" : "quiet"} onClick={() => onPlay(summary.id)}
      aria-label={t(`courses.lessonActions.${action}Named`, named)}>{t(`courses.lessonActions.${action}`)}</Button>
    {words && <Button variant="quiet" onClick={() => setReviewing(true)} aria-label={t("courses.lessonActions.reviewWordsNamed", named)}>{t("courses.lessonActions.reviewWords")}</Button>}
    {practices && <Button variant="quiet" onClick={() => setPractising(true)} aria-label={t("courses.lessonActions.practiseNamed", named)}>{t("courses.lessonActions.practise")}</Button>}
    <AdaptiveDialog opened={reviewing} onClose={() => setReviewing(false)} title={t("courses.lessonActions.wordsTitle", named)}>
      {reviewing && <LoadedLesson scope={scope} lessonId={summary.id}>{(lesson) => <LessonRecap scope={scope} lesson={lesson} onDone={() => setReviewing(false)} />}</LoadedLesson>}
    </AdaptiveDialog>
    <AdaptiveDialog opened={practising} onClose={closePractices} title={t("courses.lessonActions.practicesTitle", named)}>
      {practising && <LoadedLesson scope={scope} lessonId={summary.id}>
        {(lesson) => <PracticeList scope={scope} lesson={lesson} selected={selected} onSelect={setSelected} />}
      </LoadedLesson>}
    </AdaptiveDialog>
  </div>;
}
