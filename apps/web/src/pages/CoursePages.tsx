import { COURSE_LEVEL_MAX, COURSE_TEXT_MAX, COURSE_TITLE_MAX, courseResponseSchema, type Course, type CourseInput, type SpeechCast, type UpdateCourseInput } from "@wordinator/contracts";
import type { CourseDetailResponse } from "@wordinator/contracts/lesson-document";
import type { CourseDashboardResponse } from "@wordinator/contracts/learning";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BookOpen, ChevronDown } from "lucide-react";
import { apiRequest, courseDashboardQueryOptions, courseProgressQueryOptions, courseQueryOptions, courseSpeechCastQueryOptions, sessionQueryOptions } from "../api";
import { PlainText } from "../molecules/PlainText";
import { ProgressMeter } from "../molecules/ProgressMeter";
import { CourseErrorMessage as ErrorMessage } from "../organisms/CourseLessons/CourseErrorMessage";
import { CourseLessons, CourseLessonTools, LessonView } from "../organisms/CourseLessons/CourseLessons";
import { coursePanelId, CourseProgressTab, CourseTabs, courseTabId, type CourseTab } from "../organisms/CourseLessons/CourseProgress";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { LearningHome } from "../organisms/LearningHome/LearningHome";
import { SpeechCastFields } from "../organisms/SpeechCast/SpeechCastFields";
import { AdaptiveDialog, Button, ConfirmDialog, EmptyState, ErrorState, Eyebrow, IconButton, LabelChip, LoadingState, MetadataItem, MetadataRow, PageHeader, SectionHeader, SelectField, Surface, TextAreaField, TextField } from "../ui";
import { relativeTime } from "../relativeTime";
import { ImageUpload } from "./PhaseFivePages";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./CoursePages.module.css";

const json = (value: unknown) => JSON.stringify(value);
const coursePath = (groupId: string, courseId: string) => `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}`;

function StatusChip({ status }: { status: Course["status"] }) {
  const { t } = useTranslation();
  return status === "published" ? null : <LabelChip>{t(`courses.status.${status}`)}</LabelChip>;
}

// Editing an existing course also edits its dialogue cast. The cast is sent only once the editor has loaded, so a failed load
// keeps the current cast.
function CourseForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: {
  initial?: Course; submitLabel: string; pending: boolean; error: Error | null; onSubmit: (input: UpdateCourseInput) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [level, setLevel] = useState(initial?.level ?? "");
  const [intendedLearner, setIntendedLearner] = useState(initial?.intendedLearner ?? "");
  const [cast, setCast] = useState<SpeechCast>(initial?.speechCast ?? {});
  const castEditor = useQuery({ ...courseSpeechCastQueryOptions(initial?.groupId ?? "", initial?.id ?? ""), enabled: Boolean(initial) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ title, summary, level: level || null, intendedLearner: intendedLearner || null, ...(castEditor.isSuccess ? { speechCast: cast } : {}) });
  };
  return <form className={styles.form} onSubmit={submit}>
    <TextField label={t("courses.fields.title")} value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={COURSE_TITLE_MAX} required />
    <TextAreaField label={t("courses.fields.summary")} value={summary} onChange={(event) => setSummary(event.currentTarget.value)} maxLength={COURSE_TEXT_MAX} autosize minRows={3} required />
    <TextField label={t("courses.fields.level")} description={t("courses.fields.levelHelp")} value={level} onChange={(event) => setLevel(event.currentTarget.value)} maxLength={COURSE_LEVEL_MAX} />
    <TextAreaField label={t("courses.fields.intendedLearner")} value={intendedLearner} onChange={(event) => setIntendedLearner(event.currentTarget.value)} maxLength={COURSE_TEXT_MAX} autosize minRows={2} />
    {initial && (castEditor.isPending ? <LoadingState label={t("courses.cast.loading")} />
      : castEditor.isError ? <p className={styles.castUnavailable} role="status">{t("courses.cast.unavailable")}</p>
      : <SpeechCastFields data={castEditor.data} cast={cast} onChange={setCast} />)}
    <ErrorMessage error={error} />
    <div className={styles.formActions}><Button variant="quiet" onClick={onCancel}>{t("common.cancel")}</Button><Button type="submit" loading={pending} disabled={!title.trim() || !summary.trim()}>{submitLabel}</Button></div>
  </form>;
}

type DashboardView = "recent" | "not-started";

function CourseArt({ src, tone }: { src: string | null; tone: number }) {
  return <div aria-hidden="true" className={styles.dashboardArt} data-art={tone % 3}>{src && <img alt="" src={src} />}</div>;
}

function RecentLessonCard({ item, tone }: { item: CourseDashboardResponse["recentLessons"][number]; tone: number }) {
  const { t } = useTranslation(); const [expanded, setExpanded] = useState(false);
  const { course, lesson, metrics } = item;
  const reviewed = metrics.wordRecency.total ? Math.round(100 * metrics.wordRecency.recent / metrics.wordRecency.total) : 0;
  return <article className={styles.dashboardCard}>
    <Link className={styles.cardLink} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: course.slug, lessonSlug: lesson.slug }}>
      <CourseArt src={lesson.imageUrl} tone={tone} />
      <div className={styles.dashboardCardBody}>
        <LabelChip tone="info">{course.title}</LabelChip><h3>{lesson.title}</h3>
        <p className={styles.cardMeta}>{t("courses.dashboard.lessonNumber", { number: lesson.number, total: lesson.total })}</p>
        <ProgressMeter value={lesson.storylinePercent} label={t("courses.dashboard.lessonProgress")} showLabel />
        <ProgressMeter value={course.coursePercent} label={t("courses.progress.yourLabel")} showLabel />
      </div>
    </Link>
    <div className={styles.cardFooter}>
      <span>{t("courses.dashboard.lastOpened", { time: relativeTime(item.activityAt) })}</span>
      <IconButton label={expanded ? t("courses.dashboard.hideMetrics") : t("courses.dashboard.showMetrics")} tone="quiet" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><ChevronDown className={expanded ? styles.chevronOpen : ""} /></IconButton>
    </div>
    {expanded && <div className={styles.metrics}>
      <div><strong>{t("courses.dashboard.wordRecency")}</strong><span>{metrics.wordRecency.lastReviewedAt ? relativeTime(metrics.wordRecency.lastReviewedAt) : t("courses.dashboard.notPractised")}</span><ProgressMeter value={reviewed} label={t("courses.dashboard.reviewedRecently", { count: metrics.wordRecency.recent, total: metrics.wordRecency.total })} showLabel /></div>
      <div><strong>{t("courses.dashboard.memoryStrength")}</strong><div className={styles.memoryBar} aria-label={t("courses.dashboard.memorySummary", metrics.memory)}>{metrics.memory.total > 0 && <><span data-band="strong" style={{ flexGrow: metrics.memory.strong }} /><span data-band="fading" style={{ flexGrow: metrics.memory.fading }} /><span data-band="new" style={{ flexGrow: metrics.memory.new }} /></>}</div><span>{t("courses.dashboard.memorySummary", metrics.memory)}</span></div>
      <div><strong>{t("courses.dashboard.pronunciation")}</strong><span>{metrics.pronunciation.fluency === null ? t("courses.dashboard.noSpokenAttempts") : t("courses.dashboard.fluencySummary", metrics.pronunciation)}</span></div>
    </div>}
  </article>;
}

function NotStartedCard({ course, tone }: { course: CourseDashboardResponse["notStarted"][number]; tone: number }) {
  const { t } = useTranslation();
  return <article className={styles.dashboardCard}><Link className={styles.cardLink} to="/courses/$courseSlug" params={{ courseSlug: course.slug }}>
    <CourseArt src={course.coverUrl} tone={tone} /><div className={styles.dashboardCardBody}>{course.level && <LabelChip tone="accent">{course.level}</LabelChip>}<h3>{course.title}</h3><p className={styles.cardMeta}>{t("courses.dashboard.lessonCount", { count: course.lessonCount })}</p><span className={styles.startCourse}>{t("courses.dashboard.startCourse")}</span></div>
  </Link></article>;
}

function LearningDashboard({ groupId, accountId, onCreate }: { groupId: string; accountId: string; onCreate: () => void }) {
  const { t } = useTranslation(); const dashboard = useQuery(courseDashboardQueryOptions(groupId));
  const storageKey = `wordinator:course-dashboard-view:${accountId}`;
  const [view, setView] = useState<DashboardView>(() => window.localStorage.getItem(storageKey) === "not-started" ? "not-started" : "recent");
  const chooseView = (next: string | null) => { const value: DashboardView = next === "not-started" ? "not-started" : "recent"; setView(value); window.localStorage.setItem(storageKey, value); };
  if (dashboard.isPending) return <LoadingState label={t("courses.dashboard.loading")} />;
  if (dashboard.isError) return <ErrorState title={t("courses.unavailable")} />;
  const items = view === "recent" ? dashboard.data.recentLessons : dashboard.data.notStarted;
  return <section className={styles.dashboardSection}>
    <SectionHeader eyebrow={<Eyebrow>{t("courses.dashboard.eyebrow")}</Eyebrow>} title={t("courses.title")}
      action={<div className={styles.libraryActions}>
        <SelectField aria-label={t("courses.dashboard.viewLabel")} value={view} onChange={chooseView} data={[{ value: "recent", label: t("courses.dashboard.recent") }, { value: "not-started", label: t("courses.dashboard.notStarted") }]} />
        <Button onClick={onCreate}>{t("courses.create")}</Button>
      </div>} />
    {items.length ? <div className={styles.library}>{view === "recent"
      ? dashboard.data.recentLessons.map((item, index) => <RecentLessonCard key={item.lesson.id} item={item} tone={index} />)
      : dashboard.data.notStarted.map((course, index) => <NotStartedCard key={course.id} course={course} tone={index} />)}</div>
      : <Surface><EmptyState title={view === "recent" ? t("courses.dashboard.noRecentTitle") : t("courses.dashboard.noNotStartedTitle")}>{view === "recent" ? t("courses.dashboard.noRecentBody") : t("courses.dashboard.noNotStartedBody")}</EmptyState></Surface>}
  </section>;
}

export function CourseLibraryPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const session = useQuery(sessionQueryOptions());
  const create = useMutation({
    mutationFn: (input: CourseInput) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses`, courseResponseSchema, { method: "POST", body: json(input) }),
    onSuccess: async ({ course }) => {
      await queryClient.invalidateQueries({ queryKey: ["courses", groupId] });
      await queryClient.invalidateQueries({ queryKey: ["course-dashboard", groupId] });
      await navigate({ to: "/courses/$courseSlug", params: { courseSlug: course.slug } });
    },
  });
  if (session.isPending) return <main className={shellStyles.center}><LoadingState label={t("courses.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.stack}>
    <LearningHome groupId={groupId} displayName={session.data.user.displayName} />
    <LearningDashboard groupId={groupId} accountId={session.data.user.id} onCreate={() => setCreateOpen(true)} />
    <AdaptiveDialog opened={createOpen} onClose={() => setCreateOpen(false)} title={t("courses.createTitle")}>
      {createOpen && <CourseForm submitLabel={t("courses.createSubmit")} pending={create.isPending} error={create.error} onSubmit={(input) => create.mutate(input)} onCancel={() => setCreateOpen(false)} />}
    </AdaptiveDialog>
  </div></GroupFrame>;
}

// Owners, contributors, and the site creator (who may archive or remove content) each have something to manage.
const canManage = ({ permissions }: Course) => permissions.edit || permissions.archive || permissions.manageContributors || permissions.contribute || permissions.removeContent;

// The viewer's own course percentage in the course header, once the course has published lessons.
function CourseHeaderProgress({ groupId, courseId, accountId }: { groupId: string; courseId: string; accountId: string }) {
  const { t } = useTranslation();
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  const mine = progress.data?.publishedLessons ? progress.data.participants.find((entry) => entry.user.id === accountId) : undefined;
  if (!mine) return null;
  return <ProgressMeter className={styles.headerMeter} value={mine.percent} label={t("courses.progress.yourLabel")} showLabel />;
}

export function CoursePage({ groupId, courseId, tab = "lessons" }: { groupId: string; courseId: string; tab?: CourseTab }) {
  const { t } = useTranslation(); const navigate = useNavigate();
  const session = useQuery(sessionQueryOptions());
  const course = useQuery(courseQueryOptions(groupId, courseId));
  if (session.isPending || course.isPending) return <main className={shellStyles.center}><LoadingState label={t("courses.loadingCourse")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const back = <Link className={styles.back} to="/courses"><ArrowLeft aria-hidden="true" />{t("courses.backToLibrary")}</Link>;
  if (course.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("courses.courseUnavailable")} action={back} /></GroupFrame>;
  const data = course.data.course; const archived = data.status === "archived";
  const lessonCount = course.data.outline.length;
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.stack}>
    {back}
    {/* The Lumen page header: badges, title, summary, metadata, and the viewer's course progress, with the cover beside it and
        Manage course in the tools slot. */}
    <header className={data.coverUrl ? `${styles.courseHeader} ${styles.withCover}` : styles.courseHeader}>
      <div className={styles.headerCopy}>
        {(data.level || data.status !== "published") && <div className={styles.badges}>
          {data.level && <LabelChip tone="accent">{t("courses.levelLabel", { level: data.level })}</LabelChip>}
          <StatusChip status={data.status} />
        </div>}
        <h1>{data.title}</h1>
        <p className={styles.summary}><PlainText>{data.summary}</PlainText></p>
        <MetadataRow>
          {lessonCount > 0 && <MetadataItem icon={<BookOpen />}>{t("courses.lessons.outlineCount", { count: lessonCount })}</MetadataItem>}
        </MetadataRow>
        {data.intendedLearner && <div className={styles.learner}><h2>{t("courses.fields.intendedLearner")}</h2><p><PlainText>{data.intendedLearner}</PlainText></p></div>}
        <CourseHeaderProgress groupId={groupId} courseId={courseId} accountId={session.data.user.id} />
      </div>
      {data.coverUrl && <div aria-hidden="true" className={styles.headerCover}><img alt="" src={data.coverUrl} /></div>}
      {canManage(data) && <div className={styles.headerTools}>
        <Button variant="secondary" onClick={() => void navigate({ to: "/courses/$courseSlug/manage", params: { courseSlug: data.slug } })}>{t("courses.manageTitle")}</Button>
      </div>}
    </header>
    {archived && <Surface tone="quiet"><EmptyState title={t("courses.archivedTitle")}>{t("courses.archivedBody")}</EmptyState></Surface>}
    <CourseTabs courseSlug={data.slug} tab={tab} />
    <div id={coursePanelId(tab)} role="tabpanel" aria-labelledby={courseTabId(tab)}>
      {tab === "progress"
        ? <CourseProgressTab groupId={groupId} courseId={courseId} accountId={session.data.user.id} courseSlug={data.slug} outline={course.data.outline} archived={archived} />
        : <CourseLessons groupId={groupId} courseId={courseId} accountId={session.data.user.id} detail={course.data} />}
    </div>
  </div></GroupFrame>;
}

// Course details, visibility, archiving, the cover live on their own page, away from the reader's course page.
export function ManageCoursePage({ groupId, courseId }: { groupId: string; courseId: string }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false); const [archiveOpen, setArchiveOpen] = useState(false);
  const session = useQuery(sessionQueryOptions());
  const course = useQuery(courseQueryOptions(groupId, courseId));
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["course", groupId, courseId] }), queryClient.invalidateQueries({ queryKey: ["courses", groupId] })]); };
  const applied = async ({ course: next }: { course: Course }) => {
    queryClient.setQueryData(courseQueryOptions(groupId, courseId).queryKey, (current: CourseDetailResponse | undefined) => current && { ...current, course: next });
    await refresh();
  };
  const edit = useMutation({
    mutationFn: (input: UpdateCourseInput) => apiRequest(coursePath(groupId, courseId), courseResponseSchema, { method: "PATCH", body: json(input) }),
    onSuccess: async (data) => { await applied(data); setEditOpen(false); },
  });
  const visibility = useMutation({ mutationFn: (status: "draft" | "published") => apiRequest(`${coursePath(groupId, courseId)}/visibility`, courseResponseSchema, { method: "POST", body: json({ status }) }), onSuccess: applied });
  const archive = useMutation({ mutationFn: () => apiRequest(`${coursePath(groupId, courseId)}/archive`, courseResponseSchema, { method: "POST" }), onSuccess: async (data) => { await applied(data); setArchiveOpen(false); } });
  const restore = useMutation({ mutationFn: () => apiRequest(`${coursePath(groupId, courseId)}/restore`, courseResponseSchema, { method: "POST" }), onSuccess: applied });
  if (session.isPending || course.isPending) return <main className={shellStyles.center}><LoadingState label={t("courses.loadingCourse")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (course.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("courses.courseUnavailable")} action={<Link className={styles.back} to="/courses">{t("courses.backToLibrary")}</Link>} /></GroupFrame>;
  const data = course.data.course; const archived = data.status === "archived";
  const back = <Link className={styles.back} to="/courses/$courseSlug" params={{ courseSlug: data.slug }}>{t("courses.lessons.backToCourse", { title: data.title })}</Link>;
  // The API enforces every action; a viewer without any of them only sees why there is nothing here.
  if (!canManage(data)) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("courses.manageUnavailable")} action={back} /></GroupFrame>;
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.stack}>
    {back}
    <PageHeader eyebrow={<StatusChip status={data.status} />} title={t("courses.manageTitle")} intro={data.title} />
    {archived && <Surface tone="quiet"><EmptyState title={t("courses.archivedTitle")}>{t("courses.archivedBody")}</EmptyState></Surface>}
    {(data.permissions.edit || data.permissions.archive) && <Surface className={styles.tools} tone="featured">
      <SectionHeader title={t("courses.detailsTitle")} description={data.status === "draft" ? t("courses.draftHelp") : undefined} />
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
    {(data.permissions.contribute || data.permissions.removeContent) && <CourseLessonTools groupId={groupId} courseId={courseId} accountId={session.data.user.id} detail={course.data} />}
    <AdaptiveDialog opened={editOpen} onClose={() => setEditOpen(false)} title={t("courses.editTitle")}>
      {editOpen && <CourseForm initial={data} submitLabel={t("common.save")} pending={edit.isPending} error={edit.error} onSubmit={(input) => edit.mutate(input)} onCancel={() => setEditOpen(false)} />}
    </AdaptiveDialog>
    <ConfirmDialog opened={archiveOpen} onClose={() => setArchiveOpen(false)} title={t("courses.archiveTitle")} confirmLabel={t("courses.archive")} cancelLabel={t("common.cancel")} confirmLoading={archive.isPending} onConfirm={() => archive.mutate()}>
      {t("courses.archiveConfirm", { title: data.title })}<ErrorMessage error={archive.error} />
    </ConfirmDialog>
  </div></GroupFrame>;
}

export function LessonPage({ groupId, courseId, lessonId, resume = false }: { groupId: string; courseId: string; lessonId: string; resume?: boolean }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  const course = useQuery(courseQueryOptions(groupId, courseId));
  if (session.isPending || course.isPending) return <main className={shellStyles.center}><LoadingState label={t("courses.lessons.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (course.isError) {
    const back = <Link className={styles.back} to="/courses">{t("courses.backToLibrary")}</Link>;
    return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("courses.courseUnavailable")} action={back} /></GroupFrame>;
  }
  // The lesson header's breadcrumb links back to the course.
  return <GroupFrame groupId={groupId} session={session.data} courseTitle={course.data.course.title}><div className={styles.stack}>
    <LessonView key={lessonId} groupId={groupId} courseId={courseId} accountId={session.data.user.id} detail={course.data} lessonId={lessonId} dataUpdatedAt={course.dataUpdatedAt} resume={resume}
      language={session.data.groups.find((group) => group.id === groupId)?.language} />
  </div></GroupFrame>;
}
