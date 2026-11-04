import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  adminImageFiltersResponseSchema, adminImageKindFilterSchema, adminImageReplaceResponseSchema, adminImagesResponseSchema,
  type AdminImage, type AdminImageKindFilter,
} from "@wordinator/contracts/admin";
import { ApiError, apiRequest, sessionQueryOptions } from "../api";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { renderLessonImage, UPLOAD_MAX_BYTES } from "../organisms/ImageCropper/crop";
import { Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, PageHeader, SelectField, Surface } from "../ui";
import styles from "./AdminImagesPage.module.css";

// The superuser's image library (docs/settings-and-administration.md#image-library): every course cover, lesson image, and dialogue
// scene asset, filtered by kind, course, lesson, and usage, with links to where each is used and a Replace action that swaps the
// image everywhere. Other accounts get a not-available state and no request is made; the API refuses them anyway.

export type AdminImagesSearch = { kind?: AdminImageKindFilter; course?: string; lesson?: string; usage?: "used" | "unused" };
const KIND_FILTERS = adminImageKindFilterSchema.options;

export function validateImagesSearch(search: Record<string, unknown>): AdminImagesSearch {
  const kind = adminImageKindFilterSchema.safeParse(search.kind);
  const text = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 64 ? value : undefined;
  const course = text(search.course);
  return {
    ...(kind.success ? { kind: kind.data } : {}),
    ...(course ? { course } : {}),
    // A lesson filter only makes sense inside its course.
    ...(course && text(search.lesson) ? { lesson: text(search.lesson) } : {}),
    ...(search.usage === "used" || search.usage === "unused" ? { usage: search.usage } : {}),
  };
}

const imagesKey = ["admin-images"] as const;
const imagesQuery = (search: AdminImagesSearch) => infiniteQueryOptions({
  queryKey: [...imagesKey, "list", search] as const,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => {
    const params = new URLSearchParams();
    if (search.kind) params.set("kind", search.kind);
    if (search.course) params.set("courseId", search.course);
    if (search.lesson) params.set("lessonId", search.lesson);
    if (search.usage) params.set("usage", search.usage);
    if (pageParam) params.set("cursor", pageParam);
    const query = params.toString();
    return apiRequest(`/api/admin/images${query ? `?${query}` : ""}`, adminImagesResponseSchema);
  },
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
const filtersQuery = () => queryOptions({
  queryKey: [...imagesKey, "filters"] as const,
  queryFn: () => apiRequest("/api/admin/images/filters", adminImageFiltersResponseSchema),
});

// Masks and portraits keep their transparency, so they go up as chosen. Everything else is re-encoded like a lesson image:
// metadata dropped, the longest edge capped, and the quality lowered until it fits the upload limit.
export async function prepareReplacement(image: Pick<AdminImage, "kind">, file: File): Promise<File> {
  if (image.kind === "mask" || image.kind === "portrait") {
    if (file.size > UPLOAD_MAX_BYTES) throw new Error("IMAGE_SIZE_INVALID");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("IMAGE_TYPE_INVALID");
    return file;
  }
  return renderLessonImage(file, null);
}

function replaceImage({ key, file }: { key: string; file: File }) {
  const form = new FormData(); form.set("key", key); form.set("image", file);
  return apiRequest("/api/admin/images/replace", adminImageReplaceResponseSchema, { method: "POST", body: form });
}

type Pending = { image: AdminImage; file: File; preview: string };
const REPLACE_ERRORS = ["IMAGE_SIZE_INVALID", "IMAGE_TYPE_INVALID", "IMAGE_NOT_FOUND", "IMAGE_PROCESSING_FAILED"];
const errorKey = (error: unknown) => {
  const code = error instanceof ApiError ? error.code : error instanceof Error ? error.message : "";
  return REPLACE_ERRORS.includes(code) ? code : "generic";
};

function ImageReferences({ image }: { image: AdminImage }) {
  const { t } = useTranslation();
  const { course, lesson, dialogue } = image;
  const courseParams = { courseSlug: course.slug };
  return <dl className={styles.references}>
    <div><dt>{t("imageAdmin.course")}</dt><dd><Link to="/courses/$courseSlug" params={courseParams}>{course.title}</Link>
      {course.status !== "published" && <> <LabelChip>{t(`imageAdmin.courseStatus.${course.status}`)}</LabelChip></>}</dd></div>
    {lesson && <div><dt>{t("imageAdmin.lesson")}</dt><dd>
      <Link to="/courses/$courseSlug/lessons/$lessonSlug" params={{ ...courseParams, lessonSlug: lesson.slug }}>{t("imageAdmin.lessonName", { number: lesson.position + 1, title: lesson.title })}</Link></dd></div>}
    {lesson && dialogue && <div><dt>{t("imageAdmin.dialogue")}</dt><dd>
      <Link to="/courses/$courseSlug/lessons/$lessonSlug/dialogues/$blockId" params={{ ...courseParams, lessonSlug: lesson.slug, blockId: dialogue.blockId }}>
        {dialogue.section ?? t("imageAdmin.dialogueUntitled")}</Link>
      {dialogue.speaker && <span className={styles.slot}>{t("imageAdmin.speaker", { speaker: dialogue.speaker })}</span>}
      {dialogue.lineIndex !== null && <span className={styles.slot}>{dialogue.line
        ? t("imageAdmin.line", { number: dialogue.lineIndex + 1, speaker: dialogue.line.speaker, text: dialogue.line.text })
        : t("imageAdmin.lineNumber", { number: dialogue.lineIndex + 1 })}</span>}
    </dd></div>}
  </dl>;
}

function UsageChips({ image }: { image: AdminImage }) {
  const { t } = useTranslation();
  if (image.kind === "cover") return null;
  if (!image.usedInDraft && !image.usedInPublished) return <LabelChip tone="warm">{t("imageAdmin.usage.unused")}</LabelChip>;
  return <>
    {image.usedInPublished && <LabelChip tone="success">{t("imageAdmin.usage.published")}</LabelChip>}
    {image.usedInDraft && <LabelChip tone="info">{t("imageAdmin.usage.draft")}</LabelChip>}
  </>;
}

function ImageCard({ image, onChoose }: { image: AdminImage; onChoose: (image: AdminImage, file: File) => void }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const label = t(`imageAdmin.kinds.${image.kind}`);
  return <li className={styles.card} aria-label={t("imageAdmin.cardLabel", { kind: label, course: image.course.title })}>
    <a className={styles.thumb} data-kind={image.kind} href={image.url} target="_blank" rel="noreferrer">
      <img src={image.url} alt="" loading="lazy" decoding="async" />
    </a>
    <div className={styles.body}>
      <div className={styles.chips}><LabelChip tone="accent">{label}</LabelChip><UsageChips image={image} />
        {image.width && image.height && <span className={styles.size}>{t("imageAdmin.size", { width: image.width, height: image.height })}</span>}</div>
      <ImageReferences image={image} />
      <input ref={input} className={styles.file} type="file" accept="image/*" tabIndex={-1} aria-hidden="true"
        onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) onChoose(image, file); }} />
      <Button className={styles.replace} variant="secondary" onClick={() => input.current?.click()}>{t("imageAdmin.replace")}</Button>
    </div>
  </li>;
}

function ImageLibrary({ search, onSearch }: { search: AdminImagesSearch; onSearch: (next: AdminImagesSearch) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const images = useInfiniteQuery(imagesQuery(search));
  const filters = useQuery(filtersQuery());
  const [pending, setPending] = useState<Pending | null>(null);
  const [replaced, setReplaced] = useState(false);
  const replace = useMutation({
    mutationFn: async ({ image, file }: Pending) => replaceImage({ key: image.key, file: await prepareReplacement(image, file) }),
    onSuccess: async () => {
      setReplaced(true); close();
      await queryClient.invalidateQueries({ queryKey: imagesKey });
    },
  });
  const close = () => { setPending((current) => { if (current) URL.revokeObjectURL(current.preview); return null; }); };
  const choose = (image: AdminImage, file: File) => {
    setReplaced(false); replace.reset();
    setPending({ image, file, preview: URL.createObjectURL(file) });
  };

  const courses = filters.data?.courses ?? [];
  const course = courses.find((item) => item.id === search.course);
  const list = images.data?.pages.flatMap((page) => page.images) ?? [];
  const replaceError = replace.error ? errorKey(replace.error) : null;

  return <Surface className={styles.section}>
    <div className={styles.filters}>
      <SelectField label={t("imageAdmin.filters.kind")} value={search.kind ?? ""} allowDeselect={false}
        data={[{ value: "", label: t("imageAdmin.filters.allKinds") }, ...KIND_FILTERS.map((kind) => ({ value: kind, label: t(`imageAdmin.kinds.${kind}`) }))]}
        onChange={(value) => onSearch(validateImagesSearch({ ...search, kind: value }))} />
      <SelectField label={t("imageAdmin.filters.course")} value={search.course ?? ""} allowDeselect={false} searchable disabled={!filters.data}
        data={[{ value: "", label: t("imageAdmin.filters.allCourses") }, ...courses.map((item) => ({ value: item.id, label: item.title }))]}
        onChange={(value) => onSearch(validateImagesSearch({ ...search, course: value, lesson: undefined }))} />
      <SelectField label={t("imageAdmin.filters.lesson")} value={search.lesson ?? ""} allowDeselect={false} searchable disabled={!course}
        data={[{ value: "", label: t("imageAdmin.filters.allLessons") }, ...(course?.lessons ?? []).map((item) => ({ value: item.id, label: t("imageAdmin.lessonName", { number: item.position + 1, title: item.title }) }))]}
        onChange={(value) => onSearch(validateImagesSearch({ ...search, lesson: value }))} />
      <SelectField label={t("imageAdmin.filters.usage")} value={search.usage ?? ""} allowDeselect={false}
        data={[{ value: "", label: t("imageAdmin.filters.anyUsage") }, { value: "used", label: t("imageAdmin.usage.used") }, { value: "unused", label: t("imageAdmin.usage.unused") }]}
        onChange={(value) => onSearch(validateImagesSearch({ ...search, usage: value }))} />
    </div>
    <p className={styles.status} role="status">{replaced ? t("imageAdmin.replaced") : ""}</p>
    {images.isPending ? <LoadingState label={t("imageAdmin.loading")} />
      : images.isError ? <ErrorState title={t("imageAdmin.error")}><Button onClick={() => images.refetch()}>{t("common.retry")}</Button></ErrorState>
      : list.length === 0 ? <EmptyState title={t("imageAdmin.emptyTitle")}>{t("imageAdmin.emptyBody")}</EmptyState>
      : <ul className={styles.grid}>{list.map((image) => <ImageCard key={image.key} image={image} onChoose={choose} />)}</ul>}
    {images.hasNextPage && <Button className={styles.more} variant="secondary" loading={images.isFetchingNextPage} onClick={() => images.fetchNextPage()}>{t("imageAdmin.more")}</Button>}
    <ConfirmDialog opened={pending !== null} onClose={() => { if (!replace.isPending) close(); }} title={t("imageAdmin.confirmTitle")}
      confirmLabel={t("imageAdmin.confirm")} cancelLabel={t("common.cancel")} confirmLoading={replace.isPending}
      onConfirm={() => { if (pending) replace.mutate(pending); }}>
      {pending && <div className={styles.confirm}>
        <p>{t("imageAdmin.confirmBody")}</p>
        <div className={styles.compare}>
          <figure><img src={pending.image.url} alt="" /><figcaption>{t("imageAdmin.current")}</figcaption></figure>
          <figure><img src={pending.preview} alt="" /><figcaption>{t("imageAdmin.replacement")}</figcaption></figure>
        </div>
        {replaceError && <p className={styles.error} role="alert">{t(`imageAdmin.errors.${replaceError}`)}</p>}
      </div>}
    </ConfirmDialog>
  </Surface>;
}

export function AdminImagesPage({ groupId, search, onSearch }: { groupId: string; search: AdminImagesSearch; onSearch: (next: AdminImagesSearch) => void }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("imageAdmin.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const superuser = session.data.user.isSuperuser === true;
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.page}>
      <PageHeader eyebrow={<LabelChip>{t("aiAdmin.eyebrow")}</LabelChip>} title={t("imageAdmin.title")} intro={t("imageAdmin.intro")}
        actions={superuser && <Link className={styles.backLink} to="/admin/analytics"><ArrowLeft size={16} aria-hidden="true" />{t("aiAdmin.back")}</Link>} />
      {superuser ? <ImageLibrary search={search} onSearch={onSearch} /> : <ErrorState title={t("imageAdmin.unavailableTitle")}>{t("imageAdmin.unavailableBody")}</ErrorState>}
    </div>
  </GroupFrame>;
}
