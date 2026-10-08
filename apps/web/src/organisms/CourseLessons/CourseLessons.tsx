import {
  COURSE_TEXT_MAX, COURSE_TITLE_MAX, okResponseSchema, outlineResponseSchema, type CourseLessonSummary, type LessonInput, type LessonPosition,
} from "@wordinator/contracts";
import { lessonResponseSchema, type CourseDetailResponse, type CourseLesson } from "@wordinator/contracts/lesson-document";
import { useMediaQuery } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, courseQueryOptions, courseWordsQueryOptions, lessonQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { AdaptiveDialog, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, SectionHeader, Surface, TextAreaField, TextField } from "../../ui";
import { LessonDocument } from "../LessonDocument/LessonDocument";
import { WordRecap } from "../WordRecap/WordRecap";
import { CourseErrorMessage } from "./CourseErrorMessage";
import { lessonSteps, playableDocument } from "./LessonPlayer";
import styles from "./CourseLessons.module.css";
import { PracticeContent, practiceFromBlock, PracticeThread } from "./PracticeBlock";

// The editor and BlockNote load only when someone opens a lesson for editing.
const LessonEditor = lazy(() => import("../LessonEditor/LessonEditor"));

// The owner publishes; contributors edit every lesson draft and the details of unpublished lessons.
type Scope = { groupId: string; courseId: string; accountId: string; owner: boolean; contribute: boolean; removable: boolean };

const lessonsPath = ({ groupId, courseId }: Scope) => `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons`;
const swap = (ids: string[], index: number, offset: -1 | 1) => {
  const next = [...ids]; const target = index + offset;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};
const lessonAnchor = (lessonId: string) => `lesson-${lessonId}`;
const canEditDetails = (scope: Scope, lesson: { published: boolean }) => scope.owner || (scope.contribute && !lesson.published);

function StateChips({ lesson }: { lesson: Pick<CourseLessonSummary, "published" | "changed"> }) {
  const { t } = useTranslation();
  return <>
    {!lesson.published && <LabelChip>{t("courses.lessons.unpublished")}</LabelChip>}
    {lesson.changed && <LabelChip>{t("courses.lessons.changed")}</LabelChip>}
  </>;
}

// Readers see the published document. Editors of a lesson that is not published yet see its draft, marked as a preview.
function LessonBody({ scope, lesson }: { scope: Scope; lesson: CourseLesson }) {
  const { t } = useTranslation();
  const document = playableDocument(lesson);
  if (!document || !lessonSteps(lesson).length) return <p className={styles.emptyLesson}>{t("courses.lessons.empty")}</p>;
  return <>
    {!lesson.document && <p className={styles.preview}>{t("courses.lessons.draftPreview")}</p>}
    <LessonDocument document={document} renderPractice={(block) => {
      const practice = practiceFromBlock(block, lesson.answerCounts);
      return <div className={styles.practice}>
        <PracticeContent block={practice} />
        <PracticeThread scope={{ groupId: scope.groupId, courseId: scope.courseId, lessonId: lesson.id, accountId: scope.accountId }} block={practice} />
      </div>;
    }} />
  </>;
}

function LessonForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: {
  initial?: CourseLessonSummary; submitLabel: string; pending: boolean; error: Error | null; onSubmit: (input: LessonInput) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? ""); const [goal, setGoal] = useState(initial?.goal ?? "");
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit({ title, goal: goal || null }); };
  return <form className={styles.form} onSubmit={submit}>
    <TextField label={t("courses.lessons.fields.title")} value={title} maxLength={COURSE_TITLE_MAX} required onChange={(event) => setTitle(event.currentTarget.value)} />
    <TextAreaField label={t("courses.lessons.fields.goal")} value={goal} maxLength={COURSE_TEXT_MAX} autosize minRows={2} onChange={(event) => setGoal(event.currentTarget.value)} />
    <CourseErrorMessage error={error} />
    <div className={styles.actions}><Button variant="quiet" onClick={onCancel}>{t("common.cancel")}</Button><Button type="submit" loading={pending} disabled={!title.trim()}>{submitLabel}</Button></div>
  </form>;
}

// Lessons only report where the reader stands; the course's single resume action opens the player.
function LessonSection({ scope, summary, number, preloaded, outline, dataUpdatedAt, completed, position, round }: {
  scope: Scope; summary: CourseLessonSummary; number: number; preloaded?: CourseLesson; outline: CourseLessonSummary[]; dataUpdatedAt: number;
  completed: boolean; position: LessonPosition | undefined; round: number;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const lessonKey = lessonQueryOptions(scope.groupId, scope.courseId, summary.id).queryKey;
  const lesson = useQuery({ ...lessonQueryOptions(scope.groupId, scope.courseId, summary.id), initialData: preloaded && { lesson: preloaded }, initialDataUpdatedAt: dataUpdatedAt });
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false); const [deleting, setDeleting] = useState(false);
  const courseKey = courseQueryOptions(scope.groupId, scope.courseId).queryKey;
  const lessonPath = `${lessonsPath(scope)}/${encodeURIComponent(summary.id)}`;
  const update = useMutation({
    mutationFn: (input: LessonInput) => apiRequest(lessonPath, lessonResponseSchema, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async (data) => { queryClient.setQueryData(lessonKey, data); await queryClient.invalidateQueries({ queryKey: courseKey }); setDetailsOpen(false); },
  });
  const move = useMutation({
    mutationFn: (offset: -1 | 1) => apiRequest(`${lessonsPath(scope)}/order`, outlineResponseSchema, { method: "PUT", body: JSON.stringify({ ids: swap(outline.map((entry) => entry.id), number - 1, offset) }) }),
    onSuccess: ({ outline: next }) => queryClient.setQueryData(courseKey, (current: CourseDetailResponse | undefined) => current && { ...current, outline: next }),
    onError: () => void queryClient.invalidateQueries({ queryKey: courseKey }),
  });
  const remove = useMutation({
    mutationFn: () => apiRequest(lessonPath, okResponseSchema, { method: "DELETE" }),
    onSuccess: async () => { setDeleting(false); queryClient.removeQueries({ queryKey: lessonKey }); await queryClient.invalidateQueries({ queryKey: courseKey }); },
  });
  const data = lesson.data?.lesson;
  // The outline summary is fresher after a publish elsewhere; the loaded lesson is fresher after this viewer's own edits.
  const current = data ?? summary;
  const playable = data ? lessonSteps(data).length > 0 : false;
  return <section className={styles.lesson} id={lessonAnchor(summary.id)} aria-labelledby={`${lessonAnchor(summary.id)}-title`}>
    <header className={styles.lessonHeader}>
      <p className={styles.lessonNumber}>{t("courses.lessons.number", { number })}</p>
      <h2 id={`${lessonAnchor(summary.id)}-title`}>{current.title}</h2>
      {current.goal && <p className={styles.goal}><PlainText>{current.goal}</PlainText></p>}
      {playable && !editing && (completed || position) && <div className={styles.start}>
        {completed && <span className={styles.completed}>{t("courses.progress.completed")}</span>}
        {!completed && position && <span className={styles.position}>{t("courses.player.step", { current: position.stepIndex + 1, total: position.totalSteps })}</span>}
      </div>}
      {(scope.contribute || scope.removable) && <div className={styles.blockTools}>
        <StateChips lesson={current} />
        {scope.contribute && <span className={styles.attribution}>{t("courses.lessons.updatedBy", { name: current.updatedBy.displayName })}</span>}
        <div className={styles.toolButtons}>
          {scope.contribute && data && !editing && <Button variant="secondary" onClick={() => setEditing(true)} aria-label={t("courses.lessons.editContentNamed", { number })}>{t("courses.lessons.editContent")}</Button>}
          {canEditDetails(scope, current) && <Button variant="quiet" onClick={() => { update.reset(); setDetailsOpen(true); }}>{t("courses.lessons.editDetails")}</Button>}
          {scope.owner && <>
            <Button variant="quiet" disabled={number === 1} onClick={() => move.mutate(-1)} aria-label={t("courses.lessons.moveUpNamed", { number })}>{t("courses.moveUp")}</Button>
            <Button variant="quiet" disabled={number === outline.length} onClick={() => move.mutate(1)} aria-label={t("courses.lessons.moveDownNamed", { number })}>{t("courses.moveDown")}</Button>
          </>}
          {scope.removable && <Button variant="quiet" onClick={() => setDeleting(true)} aria-label={t("courses.lessons.deleteNamed", { number })}>{t("courses.delete")}</Button>}
        </div>
        <CourseErrorMessage error={move.error} />
      </div>}
    </header>
    {lesson.isPending ? <LoadingState label={t("courses.lessons.loading")} />
      : lesson.isError || !data ? <ErrorState title={t("courses.lessons.unavailable")} />
      : editing ? <Suspense fallback={<LoadingState label={t("courses.editor.loading")} />}>
        <LessonEditor groupId={scope.groupId} courseId={scope.courseId} accountId={scope.accountId} owner={scope.owner} lesson={data} onClose={() => setEditing(false)} />
      </Suspense>
      : <div className={styles.body} key={round}><LessonBody scope={scope} lesson={data} /></div>}
    <AdaptiveDialog opened={detailsOpen} onClose={() => setDetailsOpen(false)} title={t("courses.lessons.editTitle")}>
      {detailsOpen && <LessonForm initial={current} submitLabel={t("common.save")} pending={update.isPending} error={update.error}
        onSubmit={(input) => update.mutate(input)} onCancel={() => setDetailsOpen(false)} />}
    </AdaptiveDialog>
    <ConfirmDialog opened={deleting} onClose={() => setDeleting(false)} title={t("courses.lessons.deleteTitle")} confirmLabel={t("courses.delete")} cancelLabel={t("common.cancel")} confirmLoading={remove.isPending} onConfirm={() => remove.mutate()}>
      {t("courses.lessons.deleteConfirm", { title: current.title })}<CourseErrorMessage error={remove.error} />
    </ConfirmDialog>
  </section>;
}

// `round` changes after the lesson player closes, so answer composers reread drafts the player may have changed.
export function CourseLessons({ groupId, courseId, accountId, detail, dataUpdatedAt, round }: {
  groupId: string; courseId: string; accountId: string; detail: CourseDetailResponse; dataUpdatedAt: number; round: number;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const { permissions } = detail.course;
  const scope: Scope = { groupId, courseId, accountId, owner: permissions.edit, contribute: permissions.contribute, removable: permissions.removeContent };
  const { outline } = detail;
  // Lessons render progressively: the preloaded ones first, then one more each time the reader continues.
  const [shown, setShown] = useState(detail.lessons.length);
  const [addOpen, setAddOpen] = useState(false);
  // Below 48em the outline collapses behind a toggle so the first lesson stays above the fold.
  const narrow = useMediaQuery("(max-width: 48em)"); const [outlineOpen, setOutlineOpen] = useState(false);
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  const completed = new Set(progress.data?.completedLessonIds ?? []);
  // Saved steps of unfinished lessons, shown on each started lesson.
  const positions = (progress.data?.positions ?? []).filter((entry) => !completed.has(entry.lessonId));
  // The course recap covers the published lessons the viewer has finished; it is offered only when they carried words.
  const words = useQuery(courseWordsQueryOptions(groupId, courseId)).data?.words ?? [];
  const [reviewing, setReviewing] = useState(false);
  const create = useMutation({
    mutationFn: (input: LessonInput) => apiRequest(lessonsPath(scope), lessonResponseSchema, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (data) => {
      queryClient.setQueryData(lessonQueryOptions(groupId, courseId, data.lesson.id).queryKey, data);
      await queryClient.invalidateQueries({ queryKey: courseQueryOptions(groupId, courseId).queryKey });
      setShown(outline.length + 1); setAddOpen(false);
    },
  });
  const visible = outline.slice(0, Math.max(shown, Math.min(outline.length, detail.lessons.length)));
  const next = outline[visible.length];
  const jumpTo = (index: number) => {
    setShown((value) => Math.max(value, index + 1));
    setOutlineOpen(false);
    requestAnimationFrame(() => document.getElementById(lessonAnchor(outline[index]!.id))?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  };
  const addAction = scope.contribute && <Button onClick={() => { create.reset(); setAddOpen(true); }}>{t("courses.lessons.add")}</Button>;
  return <div className={styles.layout}>
    <nav className={styles.outline} aria-label={t("courses.lessons.outline")}>
      {narrow
        ? <button type="button" className={styles.outlineToggle} aria-expanded={outlineOpen} aria-controls="course-outline" onClick={() => setOutlineOpen((open) => !open)}>
          <span className={styles.outlineTitle}>{t("courses.lessons.outline")}</span>
          <span className={styles.outlineCount}>{t("courses.lessons.outlineCount", { count: outline.length })}</span>
          <span aria-hidden="true" className={styles.chevron} />
        </button>
        : <SectionHeader title={t("courses.lessons.outline")} />}
      <div className={styles.outlineBody} id="course-outline" hidden={narrow && !outlineOpen}>
        {outline.length ? <ol>{outline.map((lesson, index) => <li key={lesson.id}>
          <button type="button" onClick={() => jumpTo(index)}>
            <span className={styles.outlineNumber}>{completed.has(lesson.id) ? <span className={styles.check} role="img" aria-label={t("courses.progress.completed")}>✓</span> : index + 1}</span><span>{lesson.title}</span>
          </button>
          <StateChips lesson={lesson} />
        </li>)}</ol> : <p className={styles.emptyLesson}>{t("courses.lessons.outlineEmpty")}</p>}
        {addAction}
      </div>
    </nav>
    <div className={styles.lessons}>
      {words.length > 0 && <Surface tone="quiet" className={styles.recap}>
        <p>{t("courses.words.courseHelp", { count: words.length })}</p>
        <Button variant="secondary" onClick={() => setReviewing(true)}>{t("courses.words.review")}</Button>
      </Surface>}
      {outline.length
        ? visible.map((lesson, index) => <LessonSection key={lesson.id} scope={scope} summary={lesson} number={index + 1} outline={outline}
          preloaded={detail.lessons.find((entry) => entry.id === lesson.id)} dataUpdatedAt={dataUpdatedAt}
          completed={completed.has(lesson.id)} position={positions.find((entry) => entry.lessonId === lesson.id)} round={round} />)
        : <Surface tone="quiet"><EmptyState title={t("courses.noLessonsTitle")} action={addAction || undefined}>{t("courses.noLessonsBody")}</EmptyState></Surface>}
      {next && <Button variant="secondary" className={styles.continue} onClick={() => jumpTo(visible.length)}>{t("courses.lessons.continue", { number: visible.length + 1, title: next.title })}</Button>}
    </div>
    <AdaptiveDialog opened={reviewing && words.length > 0} onClose={() => setReviewing(false)} title={t("courses.words.recapTitle")}>
      {reviewing && <WordRecap words={words} doneLabel={t("courses.words.backToCourse")} onDone={() => setReviewing(false)} />}
    </AdaptiveDialog>
    <AdaptiveDialog opened={addOpen} onClose={() => setAddOpen(false)} title={t("courses.lessons.addTitle")}>
      {addOpen && <LessonForm submitLabel={t("courses.lessons.addSubmit")} pending={create.isPending} error={create.error} onSubmit={(input) => create.mutate(input)} onCancel={() => setAddOpen(false)} />}
    </AdaptiveDialog>
  </div>;
}
