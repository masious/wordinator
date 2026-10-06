import {
  COURSE_TEXT_MAX, COURSE_TITLE_MAX, lessonResponseSchema, okResponseSchema, outlineResponseSchema, blockResponseSchema,
  type CourseBlock, type CourseDetailResponse, type CourseLesson, type CourseLessonSummary, type LessonInput,
} from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, courseProgressQueryOptions, courseQueryOptions, lessonQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { AdaptiveDialog, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, SectionHeader, Surface, TextAreaField, TextField } from "../../ui";
import { BlockEditor, blockContent, courseBlockDraftKey, hasBlockDraft } from "./BlockEditor";
import { CourseErrorMessage } from "./CourseErrorMessage";
import { LessonPlayer } from "./LessonPlayer";
import styles from "./CourseLessons.module.css";
import { PracticeContent, PracticeThread } from "./PracticeBlock";

// The owner edits and publishes everything; contributors add content and edit only what is still unpublished.
type Scope = { groupId: string; courseId: string; accountId: string; owner: boolean; contribute: boolean; removable: boolean };
type LessonData = { lesson: CourseLesson };

const lessonsPath = ({ groupId, courseId }: Scope) => `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons`;
const swap = (ids: string[], index: number, offset: -1 | 1) => {
  const next = [...ids]; const target = index + offset;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};
const lessonAnchor = (lessonId: string) => `lesson-${lessonId}`;
const canEdit = (scope: Scope, item: { published: boolean }) => scope.owner || (scope.contribute && !item.published);

function DraftChip({ published }: { published: boolean }) {
  const { t } = useTranslation();
  return published ? null : <LabelChip>{t("courses.lessons.unpublished")}</LabelChip>;
}

// Readers see blocks as plain text; highlighting comes from the block kind, never from inline markup.
function BlockContent({ scope, block }: { scope: Scope; block: CourseBlock }) {
  switch (block.kind) {
    case "heading": return <h3 className={styles.heading}>{block.payload.title}</h3>;
    case "text": return <p className={styles.text}><PlainText>{block.payload.content}</PlainText></p>;
    case "example": return <figure className={styles.example}>
      <blockquote className={styles.sentence}><PlainText>{block.payload.sentence}</PlainText></blockquote>
      {block.payload.translation && <figcaption className={styles.translation}><PlainText>{block.payload.translation}</PlainText></figcaption>}
      {block.payload.note && <p className={styles.note}><PlainText>{block.payload.note}</PlainText></p>}
    </figure>;
    case "dialogue": return <ol className={styles.dialogue}>
      {block.payload.turns.map((turn, index) => <li key={index}><span className={styles.speaker}>{turn.speaker}</span><span className={styles.line}><PlainText>{turn.text}</PlainText></span></li>)}
    </ol>;
    case "practice": return <>
      <PracticeContent block={block} />
      <PracticeThread scope={{ groupId: scope.groupId, courseId: scope.courseId, lessonId: block.lessonId, accountId: scope.accountId }} block={block} />
    </>;
  }
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
    {error instanceof ApiError && error.code === "VERSION_CONFLICT" ? <p className={styles.error} role="alert">{t("courses.conflict.lesson")}</p> : <CourseErrorMessage error={error} />}
    <div className={styles.actions}><Button variant="quiet" onClick={onCancel}>{t("common.cancel")}</Button><Button type="submit" loading={pending} disabled={!title.trim()}>{submitLabel}</Button></div>
  </form>;
}

function BlockItem({ scope, lesson, block, index }: { scope: Scope; lesson: CourseLesson; block: CourseBlock; index: number }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [editing, setEditing] = useState(() => canEdit(scope, block) && hasBlockDraft(courseBlockDraftKey(scope.accountId, scope.groupId, block.id)));
  const [deleting, setDeleting] = useState(false);
  const lessonKey = lessonQueryOptions(scope.groupId, scope.courseId, lesson.id).queryKey;
  const blockPath = `${lessonsPath(scope)}/${encodeURIComponent(lesson.id)}/blocks/${encodeURIComponent(block.id)}`;
  const setLesson = (update: (value: CourseLesson) => CourseLesson) => queryClient.setQueryData(lessonKey, (current: LessonData | undefined) => current && { lesson: update(current.lesson) });
  const publish = useMutation({
    mutationFn: () => apiRequest(blockPath, blockResponseSchema, { method: "PATCH", body: JSON.stringify({ ...blockContent(block), published: !block.published, version: block.version }) }),
    onSuccess: ({ block: saved }) => setLesson((value) => ({ ...value, blocks: value.blocks.map((entry) => entry.id === saved.id ? saved : entry) })),
    onError: () => void queryClient.invalidateQueries({ queryKey: lessonKey }),
  });
  const move = useMutation({
    mutationFn: (offset: -1 | 1) => apiRequest(`${lessonsPath(scope)}/${encodeURIComponent(lesson.id)}/blocks/order`, lessonResponseSchema, { method: "PUT", body: JSON.stringify({ ids: swap(lesson.blocks.map((entry) => entry.id), index, offset) }) }),
    onSuccess: (data) => queryClient.setQueryData(lessonKey, data),
    onError: () => void queryClient.invalidateQueries({ queryKey: lessonKey }),
  });
  const remove = useMutation({
    mutationFn: () => apiRequest(blockPath, okResponseSchema, { method: "DELETE" }),
    onSuccess: () => { setDeleting(false); setLesson((value) => ({ ...value, blocks: value.blocks.filter((entry) => entry.id !== block.id) })); },
  });
  const label = t(`courses.blocks.kinds.${block.kind}`);
  return <li className={styles.block}>
    {editing
      ? <BlockEditor groupId={scope.groupId} courseId={scope.courseId} lessonId={lesson.id} accountId={scope.accountId} block={block} canPublish={scope.owner} onClose={() => setEditing(false)} />
      : <BlockContent scope={scope} block={block} />}
    {(scope.contribute || scope.removable) && !editing && <div className={styles.blockTools}>
      <DraftChip published={block.published} />
      {scope.contribute && <span className={styles.attribution}>{t("courses.blocks.updatedBy", { name: block.updatedBy.displayName })}</span>}
      <div className={styles.toolButtons}>
        {canEdit(scope, block) && <Button variant="quiet" onClick={() => setEditing(true)} aria-label={t("courses.blocks.editNamed", { kind: label, number: index + 1 })}>{t("courses.blocks.edit")}</Button>}
        {scope.owner && <>
          <Button variant="quiet" loading={publish.isPending} onClick={() => publish.mutate()}>{block.published ? t("courses.blocks.unpublish") : t("courses.blocks.publish")}</Button>
          <Button variant="quiet" disabled={index === 0} loading={move.isPending && move.variables === -1} onClick={() => move.mutate(-1)} aria-label={t("courses.blocks.moveUpNamed", { kind: label, number: index + 1 })}>{t("courses.moveUp")}</Button>
          <Button variant="quiet" disabled={index === lesson.blocks.length - 1} loading={move.isPending && move.variables === 1} onClick={() => move.mutate(1)} aria-label={t("courses.blocks.moveDownNamed", { kind: label, number: index + 1 })}>{t("courses.moveDown")}</Button>
        </>}
        {scope.removable && <Button variant="quiet" onClick={() => setDeleting(true)} aria-label={t("courses.blocks.deleteNamed", { kind: label, number: index + 1 })}>{t("courses.delete")}</Button>}
      </div>
      <CourseErrorMessage error={publish.error ?? move.error} />
    </div>}
    <ConfirmDialog opened={deleting} onClose={() => setDeleting(false)} title={t("courses.blocks.deleteTitle")} confirmLabel={t("courses.delete")} cancelLabel={t("common.cancel")} confirmLoading={remove.isPending} onConfirm={() => remove.mutate()}>
      {t("courses.blocks.deleteConfirm")}<CourseErrorMessage error={remove.error} />
    </ConfirmDialog>
  </li>;
}

function LessonSection({ scope, summary, number, preloaded, outline, dataUpdatedAt, completed, round, onStart }: {
  scope: Scope; summary: CourseLessonSummary; number: number; preloaded?: CourseLesson; outline: CourseLessonSummary[]; dataUpdatedAt: number;
  completed: boolean; round: number; onStart: () => void;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const lessonKey = lessonQueryOptions(scope.groupId, scope.courseId, summary.id).queryKey;
  const lesson = useQuery({ ...lessonQueryOptions(scope.groupId, scope.courseId, summary.id), initialData: preloaded && { lesson: preloaded }, initialDataUpdatedAt: dataUpdatedAt });
  const [adding, setAdding] = useState(() => scope.contribute && hasBlockDraft(courseBlockDraftKey(scope.accountId, scope.groupId, summary.id)));
  const [editOpen, setEditOpen] = useState(false); const [deleting, setDeleting] = useState(false);
  // An edit is based on the version seen when the form opened, so a collaborator's newer save is never silently overwritten.
  const [editVersion, setEditVersion] = useState(summary.version);
  const courseKey = courseQueryOptions(scope.groupId, scope.courseId).queryKey;
  const lessonPath = `${lessonsPath(scope)}/${encodeURIComponent(summary.id)}`;
  const applied = async (data: LessonData) => { queryClient.setQueryData(lessonKey, data); await queryClient.invalidateQueries({ queryKey: courseKey }); };
  const update = useMutation({
    mutationFn: (input: LessonInput & { published: boolean; version: number }) => apiRequest(lessonPath, lessonResponseSchema, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async (data) => { await applied(data); setEditOpen(false); },
    onError: async (error) => {
      if (!(error instanceof ApiError && error.code === "VERSION_CONFLICT")) return;
      const latest = await queryClient.fetchQuery({ ...lessonQueryOptions(scope.groupId, scope.courseId, summary.id), staleTime: 0 });
      await queryClient.invalidateQueries({ queryKey: courseKey });
      setEditVersion(latest.lesson.version);
    },
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
  const data = lesson.data?.lesson; const current = data ?? { ...summary, blocks: [] };
  const openEdit = () => { update.reset(); setEditVersion(current.version); setEditOpen(true); };
  return <section className={styles.lesson} id={lessonAnchor(summary.id)} aria-labelledby={`${lessonAnchor(summary.id)}-title`}>
    <header className={styles.lessonHeader}>
      <p className={styles.lessonNumber}>{t("courses.lessons.number", { number })}</p>
      <h2 id={`${lessonAnchor(summary.id)}-title`}>{current.title}</h2>
      {current.goal && <p className={styles.goal}><PlainText>{current.goal}</PlainText></p>}
      {!!data?.blocks.length && <div className={styles.start}>
        <Button variant={completed ? "secondary" : "primary"} onClick={onStart} aria-label={t(completed ? "courses.player.againNamed" : "courses.player.startNamed", { number })}>
          {completed ? t("courses.player.again") : t("courses.player.start")}
        </Button>
        {completed && <span className={styles.completed}>{t("courses.progress.completed")}</span>}
      </div>}
      {(scope.contribute || scope.removable) && <div className={styles.blockTools}>
        <DraftChip published={current.published} />
        {scope.contribute && <span className={styles.attribution}>{t("courses.blocks.updatedBy", { name: current.updatedBy.displayName })}</span>}
        <div className={styles.toolButtons}>
          {canEdit(scope, current) && <Button variant="secondary" onClick={openEdit}>{t("courses.lessons.edit")}</Button>}
          {scope.owner && <>
            <Button variant="quiet" loading={update.isPending && !editOpen} onClick={() => update.mutate({ title: current.title, goal: current.goal, published: !current.published, version: current.version })}>
              {current.published ? t("courses.lessons.unpublish") : t("courses.lessons.publish")}
            </Button>
            <Button variant="quiet" disabled={number === 1} onClick={() => move.mutate(-1)} aria-label={t("courses.lessons.moveUpNamed", { number })}>{t("courses.moveUp")}</Button>
            <Button variant="quiet" disabled={number === outline.length} onClick={() => move.mutate(1)} aria-label={t("courses.lessons.moveDownNamed", { number })}>{t("courses.moveDown")}</Button>
          </>}
          {scope.removable && <Button variant="quiet" onClick={() => setDeleting(true)} aria-label={t("courses.lessons.deleteNamed", { number })}>{t("courses.delete")}</Button>}
        </div>
        {!editOpen && <CourseErrorMessage error={update.error ?? move.error} />}
      </div>}
    </header>
    {lesson.isPending ? <LoadingState label={t("courses.lessons.loading")} />
      : lesson.isError ? <ErrorState title={t("courses.lessons.unavailable")} />
      // The round changes after the lesson player closes, so answer composers reread drafts the player may have changed.
      : current.blocks.length ? <ol className={styles.blocks} key={round}>{current.blocks.map((block, index) => <BlockItem key={block.id} scope={scope} lesson={current} block={block} index={index} />)}</ol>
      : <p className={styles.emptyLesson}>{t("courses.blocks.empty")}</p>}
    {scope.contribute && data && (adding
      ? <Surface tone="inset" className={styles.addBlock}><BlockEditor groupId={scope.groupId} courseId={scope.courseId} lessonId={summary.id} accountId={scope.accountId} canPublish={scope.owner} onClose={() => setAdding(false)} /></Surface>
      : <Button variant="secondary" className={styles.addButton} onClick={() => setAdding(true)}>{t("courses.blocks.addTo", { number })}</Button>)}
    <AdaptiveDialog opened={editOpen} onClose={() => setEditOpen(false)} title={t("courses.lessons.editTitle")}>
      {editOpen && <LessonForm initial={current} submitLabel={t("common.save")} pending={update.isPending} error={update.error}
        onSubmit={(input) => update.mutate({ ...input, published: current.published, version: editVersion })} onCancel={() => setEditOpen(false)} />}
    </AdaptiveDialog>
    <ConfirmDialog opened={deleting} onClose={() => setDeleting(false)} title={t("courses.lessons.deleteTitle")} confirmLabel={t("courses.delete")} cancelLabel={t("common.cancel")} confirmLoading={remove.isPending} onConfirm={() => remove.mutate()}>
      {t("courses.lessons.deleteConfirm", { title: current.title })}<CourseErrorMessage error={remove.error} />
    </ConfirmDialog>
  </section>;
}

export function CourseLessons({ groupId, courseId, accountId, detail, dataUpdatedAt }: {
  groupId: string; courseId: string; accountId: string; detail: CourseDetailResponse; dataUpdatedAt: number;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const { permissions } = detail.course;
  const scope: Scope = { groupId, courseId, accountId, owner: permissions.edit, contribute: permissions.contribute, removable: permissions.removeContent };
  const { outline } = detail;
  // Lessons render progressively: the preloaded ones first, then one more each time the reader continues.
  const [shown, setShown] = useState(detail.lessons.length);
  const [addOpen, setAddOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null); const [round, setRound] = useState(0);
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  const completed = new Set(progress.data?.completedLessonIds ?? []);
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
    requestAnimationFrame(() => document.getElementById(lessonAnchor(outline[index]!.id))?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  };
  const addAction = scope.contribute && <Button onClick={() => { create.reset(); setAddOpen(true); }}>{t("courses.lessons.add")}</Button>;
  return <div className={styles.layout}>
    <nav className={styles.outline} aria-label={t("courses.lessons.outline")}>
      <SectionHeader title={t("courses.lessons.outline")} />
      {outline.length ? <ol>{outline.map((lesson, index) => <li key={lesson.id}>
        <button type="button" onClick={() => jumpTo(index)}>
          <span className={styles.outlineNumber}>{completed.has(lesson.id) ? <span className={styles.check} role="img" aria-label={t("courses.progress.completed")}>✓</span> : index + 1}</span><span>{lesson.title}</span>
        </button>
        <DraftChip published={lesson.published} />
      </li>)}</ol> : <p className={styles.emptyLesson}>{t("courses.lessons.outlineEmpty")}</p>}
      {addAction}
    </nav>
    <div className={styles.lessons}>
      {outline.length
        ? visible.map((lesson, index) => <LessonSection key={lesson.id} scope={scope} summary={lesson} number={index + 1} outline={outline}
          preloaded={detail.lessons.find((entry) => entry.id === lesson.id)} dataUpdatedAt={dataUpdatedAt}
          completed={completed.has(lesson.id)} round={round} onStart={() => setPlaying(lesson.id)} />)
        : <Surface tone="quiet"><EmptyState title={t("courses.noLessonsTitle")} action={addAction || undefined}>{t("courses.noLessonsBody")}</EmptyState></Surface>}
      {next && <Button variant="secondary" className={styles.continue} onClick={() => jumpTo(visible.length)}>{t("courses.lessons.continue", { number: visible.length + 1, title: next.title })}</Button>}
    </div>
    <LessonPlayer scope={scope} lessonId={playing} outline={outline}
      onChangeLesson={(lessonId) => { setPlaying(lessonId); setShown((value) => Math.max(value, outline.findIndex((entry) => entry.id === lessonId) + 1)); }}
      onClose={() => { setPlaying(null); setRound((value) => value + 1); }} />
    <AdaptiveDialog opened={addOpen} onClose={() => setAddOpen(false)} title={t("courses.lessons.addTitle")}>
      {addOpen && <LessonForm submitLabel={t("courses.lessons.addSubmit")} pending={create.isPending} error={create.error} onSubmit={(input) => create.mutate(input)} onCancel={() => setAddOpen(false)} />}
    </AdaptiveDialog>
  </div>;
}
