import { courseProgressResponseSchema, type CourseLessonSummary, type LessonProgress } from "@wordinator/contracts";
import { walkLessonBlocks, type CourseLesson } from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, lessonProgressQueryOptions, lessonQueryOptions } from "../../api";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Button, ConfirmDialog, EmptyState, ErrorState, LoadingState, Surface } from "../../ui";
import { CourseErrorMessage } from "./CourseErrorMessage";
import { practiceDraftKey } from "./PracticeBlock";
import styles from "./CourseProgress.module.css";

// The course page's Lessons and Progress tabs (C14, docs/courses.md#lesson-progress-tab). The tab lives in the URL
// (`/courses/:courseSlug?tab=progress`); Lessons is the default and leaves the search empty.
export type CourseTab = "lessons" | "progress";
export type CourseSearch = { tab?: "progress" };
export const validateCourseSearch = (search: Record<string, unknown>): CourseSearch => search.tab === "progress" ? { tab: "progress" } : {};

export const courseTabId = (tab: CourseTab) => `course-tab-${tab}`;
export const coursePanelId = (tab: CourseTab) => `course-panel-${tab}`;

export function CourseTabs({ courseSlug, tab }: { courseSlug: string; tab: CourseTab }) {
  const { t } = useTranslation();
  return <nav className={styles.tabs} role="tablist" aria-label={t("courses.tabs.label")}>
    {(["lessons", "progress"] as const).map((entry) => <Link key={entry} id={courseTabId(entry)} role="tab" aria-selected={entry === tab} aria-controls={coursePanelId(entry)}
      to="/courses/$courseSlug" params={{ courseSlug }} search={entry === "progress" ? { tab: "progress" } : {}}>{t(`courses.tabs.${entry}`)}</Link>)}
  </nav>;
}

// Answer drafts are keyed by practice block ID; a web reset clears the lesson's drafts on this device so a draft cannot restore the
// deleted practice progress the next time its dialog closes (docs/courses.md#reset).
export function lessonPracticeIds(lesson: CourseLesson): string[] {
  const ids = new Set<string>();
  for (const document of [lesson.document, lesson.draft?.document]) {
    if (document) for (const { block } of walkLessonBlocks(document.blocks)) if (block.type === "practice") ids.add(block.id);
  }
  return [...ids];
}

type ResetTarget = { lessonId: string; practiceIds: readonly string[] };
export function useResetLesson({ groupId, courseId, accountId }: { groupId: string; courseId: string; accountId: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId }: ResetTarget) => apiRequest(
      `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/reset`, courseProgressResponseSchema, { method: "POST" },
    ),
    onSuccess: async (progress, { lessonId, practiceIds }) => {
      for (const id of practiceIds) {
        try { localStorage.removeItem(practiceDraftKey(accountId, groupId, "practice-answer", id)); } catch { /* storage unavailable */ }
      }
      queryClient.setQueryData(courseProgressQueryOptions(groupId, courseId).queryKey, progress);
      // The lesson read carries the viewer's practice progress; the course key covers progress, the Progress tab, and the recap.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lessonQueryOptions(groupId, courseId, lessonId).queryKey }),
        queryClient.invalidateQueries({ queryKey: ["course", groupId, courseId] }),
      ]);
    },
  });
}

// The confirmation both reset entry points open. It lists what will be deleted; there is no undo.
export function ResetLessonDialog({ title, opened, pending, error, onConfirm, onClose }: {
  title: string; opened: boolean; pending: boolean; error: Error | null; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return <ConfirmDialog opened={opened} onClose={onClose} title={t("courses.reset.title")} confirmLabel={t("courses.reset.confirm")} cancelLabel={t("common.cancel")}
    confirmLoading={pending} onConfirm={onConfirm}>
    <p>{t("courses.reset.intro", { title })}</p>
    <ul className={styles.deleted}>
      <li>{t("courses.reset.position")}</li>
      <li>{t("courses.reset.practices")}</li>
      <li>{t("courses.reset.reviews")}</li>
    </ul>
    <p>{t("courses.reset.kept")}</p>
    <CourseErrorMessage error={error} />
  </ConfirmDialog>;
}

function ProgressRow({ courseSlug, row, number, archived, onReset }: { courseSlug: string; row: LessonProgress; number: number; archived: boolean; onReset: () => void }) {
  const { t } = useTranslation();
  return <li className={styles.row}>
    <Link className={styles.lessonLink} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug, lessonSlug: row.slug }}>
      <span className={styles.number}>{number}</span>
      <span className={styles.title}>{row.title}</span>
    </Link>
    <span className={styles.state} data-state={row.state}>{t(`courses.lessonProgress.states.${row.state}`)}</span>
    <ProgressMeter className={styles.meter} size="compact" value={row.storylinePercent} label={t("courses.lessonProgress.storylineLabel", { number })} />
    <span className={styles.counts}>
      <span aria-label={t("courses.lessonProgress.practicesLabel", { done: row.practicesDone, total: row.practicesTotal })}>
        {t("courses.lessonProgress.practices", { done: row.practicesDone, total: row.practicesTotal })}</span>
      <span aria-label={t("courses.lessonProgress.wordsLabel", { reviewed: row.wordsReviewed, total: row.wordsTotal })}>
        {t("courses.lessonProgress.words", { reviewed: row.wordsReviewed, total: row.wordsTotal })}</span>
      <span aria-label={t("courses.lessonProgress.aiPracticesLabel", { count: row.aiPracticeCount })}>
        {t("courses.lessonProgress.aiPractices", { count: row.aiPracticeCount })}</span>
    </span>
    {/* Archived courses refuse reset, so they offer none. */}
    {!archived && <Button variant="quiet" className={styles.reset} onClick={onReset} aria-label={t("courses.reset.actionNamed", { number, title: row.title })}>{t("courses.reset.action")}</Button>}
  </li>;
}

// The viewer's own progress: a course line, then every published lesson in order with its state, storyline share, practices,
// words reviewed, AI practices, and Reset. Nobody else sees it. Lesson numbers follow the course page's lesson list.
export function CourseProgressTab({ groupId, courseId, accountId, courseSlug, outline, archived }: {
  groupId: string; courseId: string; accountId: string; courseSlug: string; outline: CourseLessonSummary[]; archived: boolean;
}) {
  const { t } = useTranslation();
  const progress = useQuery(lessonProgressQueryOptions(groupId, courseId));
  const reset = useResetLesson({ groupId, courseId, accountId });
  const [resetting, setResetting] = useState<LessonProgress | null>(null);
  if (progress.isPending) return <LoadingState label={t("courses.lessonProgress.loading")} />;
  if (progress.isError) return <ErrorState title={t("courses.lessonProgress.unavailable")} />;
  const { lessons, complete, completedLessons, missedLessons, publishedLessons } = progress.data;
  if (!lessons.length) return <Surface tone="quiet"><EmptyState title={t("courses.lessonProgress.emptyTitle")}>{t("courses.lessonProgress.emptyBody")}</EmptyState></Surface>;
  const numberOf = (row: LessonProgress, index: number) => { const found = outline.findIndex((entry) => entry.id === row.lessonId); return found >= 0 ? found + 1 : index + 1; };
  const close = () => { setResetting(null); reset.reset(); };
  return <section className={styles.panel} aria-label={t("courses.lessonProgress.title")}>
    <p className={styles.courseLine}>
      <strong>{complete ? t("courses.lessonProgress.complete") : t("courses.lessonProgress.completedOf", { completed: completedLessons, total: publishedLessons })}</strong>
      {missedLessons > 0 && <span className={styles.missed}>{t("courses.lessonProgress.missed", { count: missedLessons })}</span>}
    </p>
    <ol className={styles.list}>{lessons.map((row, index) => <ProgressRow key={row.lessonId} courseSlug={courseSlug} row={row} number={numberOf(row, index)} archived={archived}
      onReset={() => { reset.reset(); setResetting(row); }} />)}</ol>
    <ResetLessonDialog title={resetting?.title ?? ""} opened={resetting !== null} pending={reset.isPending} error={reset.error} onClose={close}
      onConfirm={() => resetting && reset.mutate({ lessonId: resetting.lessonId, practiceIds: resetting.practiceIds }, { onSuccess: () => setResetting(null) })} />
  </section>;
}

// The lesson page's Reset lesson action; a confirmed reset returns to the course's lesson list.
export function LessonResetAction({ groupId, courseId, accountId, lesson, onReset }: {
  groupId: string; courseId: string; accountId: string; lesson: CourseLesson; onReset: () => void;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const reset = useResetLesson({ groupId, courseId, accountId });
  return <>
    <Button variant="quiet" className={styles.reset} onClick={() => { reset.reset(); setOpened(true); }}>{t("courses.reset.lessonAction")}</Button>
    <ResetLessonDialog title={lesson.title} opened={opened} pending={reset.isPending} error={reset.error} onClose={() => setOpened(false)}
      onConfirm={() => reset.mutate({ lessonId: lesson.id, practiceIds: lessonPracticeIds(lesson) }, { onSuccess: () => { setOpened(false); onReset(); } })} />
  </>;
}
