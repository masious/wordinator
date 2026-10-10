import {
  COURSE_TEXT_MAX, COURSE_TITLE_MAX, okResponseSchema, outlineResponseSchema, type CourseLessonSummary, type LessonInput, type LessonPosition,
} from "@wordinator/contracts";
import { lessonResponseSchema, type CourseDetailResponse, type CourseLesson } from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, courseQueryOptions, courseWordsQueryOptions, lessonQueryOptions, wordBookmarksKey } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { lessonSpeech, SpeechScope } from "../../molecules/Speech";
import { AdaptiveDialog, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, SectionHeader, Surface, TextAreaField, TextField } from "../../ui";
import { LessonDocument } from "../LessonDocument/LessonDocument";
import { useLessonBookmarkTarget, WordBookmarkScope } from "../WordBookmark/WordBookmark";
import { WordRecap } from "../WordRecap/WordRecap";
import { CourseErrorMessage } from "./CourseErrorMessage";
import { lessonSteps, playableDocument } from "./LessonPlayer";
import styles from "./CourseLessons.module.css";
import { LessonWords, useVisibleWords } from "./LessonWords";
import { practiceFromBlock, PracticeSummary } from "./PracticeBlock";

// The editor and BlockNote load only when someone opens a lesson for editing.
const LessonEditor = lazy(() => import("../LessonEditor/LessonEditor"));

// The owner publishes; contributors edit every lesson draft and the details of unpublished lessons.
type Scope = { groupId: string; courseId: string; courseSlug: string; accountId: string; owner: boolean; contribute: boolean; removable: boolean };

const lessonsPath = ({ groupId, courseId }: Scope) => `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons`;
const swap = (ids: string[], index: number, offset: -1 | 1) => {
  const next = [...ids]; const target = index + offset;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};
const canEditDetails = (scope: Scope, lesson: { published: boolean }) => scope.owner || (scope.contribute && !lesson.published);

function StateChips({ lesson }: { lesson: Pick<CourseLessonSummary, "published" | "changed"> }) {
  const { t } = useTranslation();
  return <>
    {!lesson.published && <LabelChip>{t("courses.lessons.unpublished")}</LabelChip>}
    {lesson.changed && <LabelChip>{t("courses.lessons.changed")}</LabelChip>}
  </>;
}

// Readers see the published document. Editors of a lesson that is not published yet see its draft, marked as a preview. A practice
// shows only its first prompts; its answer set opens in a dialog that, beside the words panel, sits over the text. New words are
// not shown in the text: the lesson's words sit in a panel beside it, where the words of the blocks on screen are highlighted.
function LessonBody({ scope, lesson }: { scope: Scope; lesson: CourseLesson }) {
  const { t } = useTranslation();
  const document = playableDocument(lesson);
  const steps = useMemo(() => lessonSteps(lesson), [lesson]);
  const reading = useRef<HTMLDivElement>(null); const panel = useRef<HTMLElement>(null);
  const active = useVisibleWords(reading, panel, steps);
  // Only words of the published document can be bookmarked, so a draft preview shows no toggles.
  const bookmarkTarget = useLessonBookmarkTarget(scope.groupId, scope.courseId, lesson.id, lesson.document);
  const speech = useMemo(() => lessonSpeech(lesson), [lesson]);
  const resolveSpeech = useCallback((key: string) => speech[key] ?? null, [speech]);
  if (!document || !steps.length) return <div className={styles.body}><p className={styles.emptyLesson}>{t("courses.lessons.empty")}</p></div>;
  const hasWords = steps.some((step) => step.words.length > 0);
  return <WordBookmarkScope resolve={bookmarkTarget}><SpeechScope resolve={resolveSpeech}><div className={hasWords ? styles.withWords : undefined}>
    <div ref={reading} className={styles.body}>
      {!lesson.document && <p className={styles.preview}>{t("courses.lessons.draftPreview")}</p>}
      <LessonDocument document={document} anchored vocabulary={false} renderPractice={(block) =>
        <PracticeSummary scope={{ groupId: scope.groupId, courseId: scope.courseId, lessonId: lesson.id, accountId: scope.accountId }} block={practiceFromBlock(block, lesson.practiceProgress)}
          published={lesson.document !== null} dock={hasWords ? reading : undefined} />} />
    </div>
    {hasWords && <LessonWords steps={steps} active={active} panelRef={panel} />}
  </div></SpeechScope></WordBookmarkScope>;
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

// One entry of the course's lesson list. It links to the lesson page and reports where the reader stands; the course's single
// resume action opens the player.
function LessonRow({ scope, summary, number, outline, completed, position }: {
  scope: Scope; summary: CourseLessonSummary; number: number; outline: CourseLessonSummary[]; completed: boolean; position: LessonPosition | undefined;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [detailsOpen, setDetailsOpen] = useState(false); const [deleting, setDeleting] = useState(false);
  const courseKey = courseQueryOptions(scope.groupId, scope.courseId).queryKey;
  const lessonKey = lessonQueryOptions(scope.groupId, scope.courseId, summary.id).queryKey;
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
    onSuccess: async () => {
      setDeleting(false); queryClient.removeQueries({ queryKey: lessonKey });
      // Deleting a lesson also deletes its words' bookmarks.
      void queryClient.invalidateQueries({ queryKey: wordBookmarksKey(scope.groupId) });
      await queryClient.invalidateQueries({ queryKey: courseKey });
    },
  });
  return <li className={styles.lesson}>
    <Link className={styles.lessonLink} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: scope.courseSlug, lessonSlug: summary.slug }}
      aria-label={t("courses.lessons.open", { number, title: summary.title })}>
      <span className={styles.lessonNumber}>{completed ? <span className={styles.check} role="img" aria-label={t("courses.progress.completed")}>✓</span> : number}</span>
      <span className={styles.lessonCopy}>
        <span className={styles.lessonTitle}>{summary.title}</span>
        {summary.goal && <span className={styles.goal}>{summary.goal}</span>}
        {(completed || position) && <span className={styles.start}>
          {completed && <span className={styles.completed}>{t("courses.progress.completed")}</span>}
          {!completed && position && <span className={styles.position}>{t("courses.player.step", { current: position.stepIndex + 1, total: position.totalSteps })}</span>}
        </span>}
      </span>
    </Link>
    {(scope.contribute || scope.removable) && <div className={styles.blockTools}>
      <StateChips lesson={summary} />
      <div className={styles.toolButtons}>
        {canEditDetails(scope, summary) && <Button variant="quiet" onClick={() => { update.reset(); setDetailsOpen(true); }}>{t("courses.lessons.editDetails")}</Button>}
        {scope.owner && <>
          <Button variant="quiet" disabled={number === 1} onClick={() => move.mutate(-1)} aria-label={t("courses.lessons.moveUpNamed", { number })}>{t("courses.moveUp")}</Button>
          <Button variant="quiet" disabled={number === outline.length} onClick={() => move.mutate(1)} aria-label={t("courses.lessons.moveDownNamed", { number })}>{t("courses.moveDown")}</Button>
        </>}
        {scope.removable && <Button variant="quiet" onClick={() => setDeleting(true)} aria-label={t("courses.lessons.deleteNamed", { number })}>{t("courses.delete")}</Button>}
      </div>
      <CourseErrorMessage error={move.error} />
    </div>}
    <AdaptiveDialog opened={detailsOpen} onClose={() => setDetailsOpen(false)} title={t("courses.lessons.editTitle")}>
      {detailsOpen && <LessonForm initial={summary} submitLabel={t("common.save")} pending={update.isPending} error={update.error}
        onSubmit={(input) => update.mutate(input)} onCancel={() => setDetailsOpen(false)} />}
    </AdaptiveDialog>
    <ConfirmDialog opened={deleting} onClose={() => setDeleting(false)} title={t("courses.lessons.deleteTitle")} confirmLabel={t("courses.delete")} cancelLabel={t("common.cancel")} confirmLoading={remove.isPending} onConfirm={() => remove.mutate()}>
      {t("courses.lessons.deleteConfirm", { title: summary.title })}<CourseErrorMessage error={remove.error} />
    </ConfirmDialog>
  </li>;
}

const lessonScope = (groupId: string, courseId: string, accountId: string, detail: CourseDetailResponse): Scope => {
  const { permissions } = detail.course;
  return { groupId, courseId, courseSlug: detail.course.slug, accountId, owner: permissions.edit, contribute: permissions.contribute, removable: permissions.removeContent };
};

// The course page's lesson list. Each lesson's content lives on its own page.
export function CourseLessons({ groupId, courseId, accountId, detail }: { groupId: string; courseId: string; accountId: string; detail: CourseDetailResponse }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const navigate = useNavigate();
  const scope = lessonScope(groupId, courseId, accountId, detail);
  const { outline } = detail;
  const [addOpen, setAddOpen] = useState(false);
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  const completed = new Set(progress.data?.completedLessonIds ?? []);
  // Saved steps of unfinished lessons, shown on each started lesson.
  const positions = (progress.data?.positions ?? []).filter((entry) => !completed.has(entry.lessonId));
  // The course recap covers the published lessons the viewer has finished; it is offered only when they carried words.
  const wordsQuery = useQuery(courseWordsQueryOptions(groupId, courseId));
  const words = useMemo(() => wordsQuery.data?.words ?? [], [wordsQuery.data]);
  const [reviewing, setReviewing] = useState(false);
  // Every recap word comes from the published index and carries its lesson, so each can be bookmarked there.
  const recapTarget = useCallback((_wordId: string, lessonId?: string) => lessonId ? { groupId, courseId, lessonId } : null, [groupId, courseId]);
  const create = useMutation({
    mutationFn: (input: LessonInput) => apiRequest(lessonsPath(scope), lessonResponseSchema, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (data) => {
      queryClient.setQueryData(lessonQueryOptions(groupId, courseId, data.lesson.id).queryKey, data);
      await queryClient.invalidateQueries({ queryKey: courseQueryOptions(groupId, courseId).queryKey });
      setAddOpen(false);
      await navigate({ to: "/courses/$courseSlug/lessons/$lessonSlug", params: { courseSlug: detail.course.slug, lessonSlug: data.lesson.slug } });
    },
  });
  const addAction = scope.contribute && <Button onClick={() => { create.reset(); setAddOpen(true); }}>{t("courses.lessons.add")}</Button>;
  return <section className={styles.index} aria-label={t("courses.lessons.outline")}>
    <SectionHeader title={t("courses.lessons.outline")}
      description={outline.length ? t("courses.lessons.outlineCount", { count: outline.length }) : undefined} action={outline.length ? addAction || undefined : undefined} />
    {words.length > 0 && <Surface tone="quiet" className={styles.recap}>
      <p>{t("courses.words.courseHelp", { count: words.length })}</p>
      <Button variant="secondary" onClick={() => setReviewing(true)}>{t("courses.words.review")}</Button>
    </Surface>}
    {outline.length
      ? <ol className={styles.lessonList}>{outline.map((lesson, index) => <LessonRow key={lesson.id} scope={scope} summary={lesson} number={index + 1} outline={outline}
        completed={completed.has(lesson.id)} position={positions.find((entry) => entry.lessonId === lesson.id)} />)}</ol>
      : <Surface tone="quiet"><EmptyState title={t("courses.noLessonsTitle")} action={addAction || undefined}>{t("courses.noLessonsBody")}</EmptyState></Surface>}
    <AdaptiveDialog opened={reviewing && words.length > 0} onClose={() => setReviewing(false)} title={t("courses.words.recapTitle")}>
      {reviewing && <WordBookmarkScope resolve={recapTarget}>
        <WordRecap words={words} doneLabel={t("courses.words.backToCourse")} onDone={() => setReviewing(false)} />
      </WordBookmarkScope>}
    </AdaptiveDialog>
    <AdaptiveDialog opened={addOpen} onClose={() => setAddOpen(false)} title={t("courses.lessons.addTitle")}>
      {addOpen && <LessonForm submitLabel={t("courses.lessons.addSubmit")} pending={create.isPending} error={create.error} onSubmit={(input) => create.mutate(input)} onCancel={() => setAddOpen(false)} />}
    </AdaptiveDialog>
  </section>;
}

// One lesson on its own page: its blocks, with editing for contributors, and links to the neighbouring lessons.
export function LessonView({ groupId, courseId, accountId, detail, lessonId, dataUpdatedAt }: {
  groupId: string; courseId: string; accountId: string; detail: CourseDetailResponse; lessonId: string; dataUpdatedAt: number;
}) {
  const { t } = useTranslation();
  const scope = lessonScope(groupId, courseId, accountId, detail);
  const { outline } = detail; const index = outline.findIndex((entry) => entry.id === lessonId);
  const summary = outline[index];
  const preloaded = detail.lessons.find((entry) => entry.id === lessonId);
  const lesson = useQuery({ ...lessonQueryOptions(groupId, courseId, lessonId), initialData: preloaded && { lesson: preloaded }, initialDataUpdatedAt: dataUpdatedAt, enabled: index >= 0 });
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  const [editing, setEditing] = useState(false);
  if (!summary) return <ErrorState title={t("courses.lessons.unavailable")} />;
  const number = index + 1; const data = lesson.data?.lesson;
  // The outline summary is fresher after a publish elsewhere; the loaded lesson is fresher after this viewer's own edits.
  const current = data ?? summary;
  const completed = progress.data?.completedLessonIds.includes(lessonId) ?? false;
  const position = completed ? undefined : progress.data?.positions.find((entry) => entry.lessonId === lessonId);
  const playable = data ? lessonSteps(data).length > 0 : false;
  const previous = outline[index - 1]; const next = outline[index + 1];
  const pagerLink = (target: CourseLessonSummary, label: string, className: string) =>
    <Link className={className} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: detail.course.slug, lessonSlug: target.slug }}>{t(label, { title: target.title })}</Link>;
  return <article className={styles.page} aria-labelledby="lesson-title">
    <header className={styles.lessonHeader}>
      <p className={styles.eyebrow}>{t("courses.lessons.number", { number })}</p>
      <h1 id="lesson-title">{current.title}</h1>
      {current.goal && <p className={styles.goal}><PlainText>{current.goal}</PlainText></p>}
      {playable && !editing && (completed || position) && <div className={styles.start}>
        {completed && <span className={styles.completed}>{t("courses.progress.completed")}</span>}
        {!completed && position && <span className={styles.position}>{t("courses.player.step", { current: position.stepIndex + 1, total: position.totalSteps })}</span>}
      </div>}
      {scope.contribute && <div className={styles.blockTools}>
        <StateChips lesson={current} />
        <span className={styles.attribution}>{t("courses.lessons.updatedBy", { name: current.updatedBy.displayName })}</span>
        {data && !editing && <div className={styles.toolButtons}>
          <Button variant="secondary" onClick={() => setEditing(true)} aria-label={t("courses.lessons.editContentNamed", { number })}>{t("courses.lessons.editContent")}</Button>
        </div>}
      </div>}
    </header>
    {lesson.isPending ? <LoadingState label={t("courses.lessons.loading")} />
      : lesson.isError || !data ? <ErrorState title={t("courses.lessons.unavailable")} />
      : editing ? <Suspense fallback={<LoadingState label={t("courses.editor.loading")} />}>
        <LessonEditor groupId={groupId} courseId={courseId} accountId={accountId} owner={scope.owner} lesson={data} onClose={() => setEditing(false)} />
      </Suspense>
      : <LessonBody scope={scope} lesson={data} />}
    {(previous || next) && <nav className={styles.pager} aria-label={t("courses.lessons.pager")}>
      {previous && pagerLink(previous, "courses.lessons.previous", styles.previous!)}
      {next && pagerLink(next, "courses.lessons.next", styles.next!)}
    </nav>}
  </article>;
}
