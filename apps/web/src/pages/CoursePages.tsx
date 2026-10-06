import { COURSE_LEVEL_MAX, COURSE_TEXT_MAX, COURSE_TITLE_MAX, courseResponseSchema, type Course, type CourseInput } from "@wordinator/contracts";
import type { CourseDetailResponse } from "@wordinator/contracts/lesson-document";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseQueryOptions, coursesQueryOptions, sessionQueryOptions } from "../api";
import { PlainText } from "../molecules/PlainText";
import { CourseContributors } from "../organisms/CourseContributors/CourseContributors";
import { CourseErrorMessage as ErrorMessage } from "../organisms/CourseLessons/CourseErrorMessage";
import { CourseLessons } from "../organisms/CourseLessons/CourseLessons";
import { CourseProgress } from "../organisms/CourseProgress/CourseProgress";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { AdaptiveDialog, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, MetadataRow, PageHeader, SectionHeader, Surface, TextAreaField, TextField } from "../ui";
import { ImageUpload } from "./PhaseFivePages";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./CoursePages.module.css";

const json = (value: unknown) => JSON.stringify(value);
const coursePath = (groupId: string, courseId: string) => `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}`;

function StatusChip({ status }: { status: Course["status"] }) {
  const { t } = useTranslation();
  return status === "published" ? null : <LabelChip>{t(`courses.status.${status}`)}</LabelChip>;
}

function CourseForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: {
  initial?: Course; submitLabel: string; pending: boolean; error: Error | null; onSubmit: (input: CourseInput) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [level, setLevel] = useState(initial?.level ?? "");
  const [intendedLearner, setIntendedLearner] = useState(initial?.intendedLearner ?? "");
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit({ title, summary, level: level || null, intendedLearner: intendedLearner || null }); };
  return <form className={styles.form} onSubmit={submit}>
    <TextField label={t("courses.fields.title")} value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={COURSE_TITLE_MAX} required />
    <TextAreaField label={t("courses.fields.summary")} value={summary} onChange={(event) => setSummary(event.currentTarget.value)} maxLength={COURSE_TEXT_MAX} autosize minRows={3} required />
    <TextField label={t("courses.fields.level")} description={t("courses.fields.levelHelp")} value={level} onChange={(event) => setLevel(event.currentTarget.value)} maxLength={COURSE_LEVEL_MAX} />
    <TextAreaField label={t("courses.fields.intendedLearner")} value={intendedLearner} onChange={(event) => setIntendedLearner(event.currentTarget.value)} maxLength={COURSE_TEXT_MAX} autosize minRows={2} />
    <ErrorMessage error={error} />
    <div className={styles.formActions}><Button variant="quiet" onClick={onCancel}>{t("common.cancel")}</Button><Button type="submit" loading={pending} disabled={!title.trim() || !summary.trim()}>{submitLabel}</Button></div>
  </form>;
}

function CourseCover({ course, className }: { course: Course; className?: string }) {
  return <div aria-hidden="true" className={`${styles.cover} ${className ?? ""}`}>{course.coverUrl ? <img alt="" src={course.coverUrl} /> : <span>{course.title.slice(0, 1)}</span>}</div>;
}

function CourseCard({ course, groupId }: { course: Course; groupId: string }) {
  return <Link className={styles.card} to="/groups/$groupId/courses/$courseId" params={{ groupId, courseId: course.id }}>
    <CourseCover course={course} />
    <div className={styles.cardBody}>
      <StatusChip status={course.status} />
      <h2>{course.title}</h2>
      {course.level && <p className={styles.level}>{course.level}</p>}
      <p className={styles.cardSummary}>{course.summary}</p>
      <p className={styles.owner}>{course.owner.displayName}</p>
    </div>
  </Link>;
}

export function CourseLibraryPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const session = useQuery(sessionQueryOptions());
  const courses = useInfiniteQuery(coursesQueryOptions(groupId));
  const create = useMutation({
    mutationFn: (input: CourseInput) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses`, courseResponseSchema, { method: "POST", body: json(input) }),
    onSuccess: async ({ course }) => {
      await queryClient.invalidateQueries({ queryKey: ["courses", groupId] });
      await navigate({ to: "/groups/$groupId/courses/$courseId", params: { groupId, courseId: course.id } });
    },
  });
  if (session.isPending || courses.isPending) return <main className={shellStyles.center}><LoadingState label={t("courses.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const items = courses.data?.pages.flatMap((page) => page.items) ?? [];
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.stack}>
    <PageHeader eyebrow={<LabelChip>{t("courses.eyebrow")}</LabelChip>} title={t("courses.title")} intro={t("courses.intro")} actions={<Button onClick={() => setCreateOpen(true)}>{t("courses.create")}</Button>} />
    {courses.isError ? <ErrorState title={t("courses.unavailable")} /> : items.length
      ? <div className={styles.library}>{items.map((course) => <CourseCard key={course.id} course={course} groupId={groupId} />)}</div>
      : <Surface><EmptyState title={t("courses.emptyTitle")} action={<Button onClick={() => setCreateOpen(true)}>{t("courses.create")}</Button>}>{t("courses.emptyBody")}</EmptyState></Surface>}
    {courses.hasNextPage && <Button variant="secondary" loading={courses.isFetchingNextPage} onClick={() => void courses.fetchNextPage()}>{t("courses.loadMore")}</Button>}
    <AdaptiveDialog opened={createOpen} onClose={() => setCreateOpen(false)} title={t("courses.createTitle")}>
      {createOpen && <CourseForm submitLabel={t("courses.createSubmit")} pending={create.isPending} error={create.error} onSubmit={(input) => create.mutate(input)} onCancel={() => setCreateOpen(false)} />}
    </AdaptiveDialog>
  </div></GroupFrame>;
}

export function CoursePage({ groupId, courseId }: { groupId: string; courseId: string }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false); const [archiveOpen, setArchiveOpen] = useState(false);
  const session = useQuery(sessionQueryOptions());
  const course = useQuery(courseQueryOptions(groupId, courseId));
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["course", groupId, courseId] }), queryClient.invalidateQueries({ queryKey: ["courses", groupId] })]); };
  const applied = async ({ course: next }: { course: Course }) => {
    queryClient.setQueryData(courseQueryOptions(groupId, courseId).queryKey, (current: CourseDetailResponse | undefined) => current && { ...current, course: next });
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["course", groupId, courseId] }), queryClient.invalidateQueries({ queryKey: ["courses", groupId] })]);
  };
  const edit = useMutation({
    mutationFn: (input: CourseInput) => apiRequest(coursePath(groupId, courseId), courseResponseSchema, { method: "PATCH", body: json(input) }),
    onSuccess: async (data) => { await applied(data); setEditOpen(false); },
  });
  const visibility = useMutation({ mutationFn: (status: "draft" | "published") => apiRequest(`${coursePath(groupId, courseId)}/visibility`, courseResponseSchema, { method: "POST", body: json({ status }) }), onSuccess: applied });
  const archive = useMutation({ mutationFn: () => apiRequest(`${coursePath(groupId, courseId)}/archive`, courseResponseSchema, { method: "POST" }), onSuccess: async (data) => { await applied(data); setArchiveOpen(false); } });
  const restore = useMutation({ mutationFn: () => apiRequest(`${coursePath(groupId, courseId)}/restore`, courseResponseSchema, { method: "POST" }), onSuccess: applied });
  if (session.isPending || course.isPending) return <main className={shellStyles.center}><LoadingState label={t("courses.loadingCourse")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const back = <Link className={styles.back} to="/groups/$groupId/courses" params={{ groupId }}>{t("courses.backToLibrary")}</Link>;
  if (course.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("courses.courseUnavailable")} action={back} /></GroupFrame>;
  const data = course.data.course; const archived = data.status === "archived";
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.stack}>
    {back}
    <article className={styles.hero}>
      <CourseCover course={data} className={styles.heroCover} />
      <div className={styles.heroCopy}>
        <StatusChip status={data.status} />
        <h1>{data.title}</h1>
        <p className={styles.summary}><PlainText>{data.summary}</PlainText></p>
        <MetadataRow className={styles.meta}>
          {data.level && <span>{t("courses.levelLabel", { level: data.level })}</span>}
          <span>{t("courses.ownerLabel", { name: data.owner.displayName })}</span>
        </MetadataRow>
        {data.intendedLearner && <div className={styles.learner}><h2>{t("courses.fields.intendedLearner")}</h2><p><PlainText>{data.intendedLearner}</PlainText></p></div>}
      </div>
    </article>
    {archived && <Surface tone="quiet"><EmptyState title={t("courses.archivedTitle")}>{t("courses.archivedBody")}</EmptyState></Surface>}
    {(data.permissions.edit || data.permissions.archive) && <Surface className={styles.tools} tone="featured">
      <SectionHeader title={t("courses.manageTitle")} description={data.status === "draft" ? t("courses.draftHelp") : undefined} />
      <div className={styles.toolActions}>
        {data.permissions.edit && <Button variant="secondary" onClick={() => setEditOpen(true)}>{t("courses.edit")}</Button>}
        {data.permissions.publish && (data.status === "draft"
          ? <Button loading={visibility.isPending} onClick={() => visibility.mutate("published")}>{t("courses.publish")}</Button>
          : <Button variant="secondary" loading={visibility.isPending} onClick={() => visibility.mutate("draft")}>{t("courses.unpublish")}</Button>)}
        {data.permissions.archive && (archived
          ? <Button loading={restore.isPending} onClick={() => restore.mutate()}>{t("courses.restore")}</Button>
          : <Button variant="danger" onClick={() => setArchiveOpen(true)}>{t("courses.archive")}</Button>)}
      </div>
      <ErrorMessage error={visibility.error ?? restore.error} />
      {data.permissions.edit && <div className={styles.coverTools}><h3>{t("courses.coverTitle")}</h3><ImageUpload shape="wide" currentUrl={data.coverUrl} name={data.title} uploadPath={`${coursePath(groupId, courseId)}/cover`} removePath={`${coursePath(groupId, courseId)}/cover`} onChanged={refresh} /></div>}
    </Surface>}
    {!archived && <CourseProgress groupId={groupId} courseId={courseId} accountId={session.data.user.id} />}
    {!archived && <CourseContributors groupId={groupId} course={data} />}
    <CourseLessons groupId={groupId} courseId={courseId} accountId={session.data.user.id} detail={course.data} dataUpdatedAt={course.dataUpdatedAt} />
    <AdaptiveDialog opened={editOpen} onClose={() => setEditOpen(false)} title={t("courses.editTitle")}>
      {editOpen && <CourseForm initial={data} submitLabel={t("common.save")} pending={edit.isPending} error={edit.error} onSubmit={(input) => edit.mutate(input)} onCancel={() => setEditOpen(false)} />}
    </AdaptiveDialog>
    <ConfirmDialog opened={archiveOpen} onClose={() => setArchiveOpen(false)} title={t("courses.archiveTitle")} confirmLabel={t("courses.archive")} cancelLabel={t("common.cancel")} confirmLoading={archive.isPending} onConfirm={() => archive.mutate()}>
      {t("courses.archiveConfirm", { title: data.title })}<ErrorMessage error={archive.error} />
    </ConfirmDialog>
  </div></GroupFrame>;
}
