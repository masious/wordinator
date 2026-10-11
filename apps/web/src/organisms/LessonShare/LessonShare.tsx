import {
  createPostResponseSchema, lessonShareExistsErrorSchema, lessonShareKey, POST_NOTES_MAX, type CreateLessonShareRequest, type PostLessonShare,
} from "@wordinator/contracts";
import { readDialogueTurns, type CourseDetailResponse, type CourseLesson, type LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createContext, useContext, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, courseQueryOptions, lessonQueryOptions, sessionQueryOptions } from "../../api";
import { AdaptiveDialog, Avatar, Button, TextAreaField } from "../../ui";
import { CourseErrorMessage } from "../CourseLessons/CourseErrorMessage";
import { LessonShareByline, LessonSharePreview } from "./LessonSharePreview";
import styles from "./LessonShare.module.css";

// Lesson shares (docs/lesson-shares.md): what a viewer may share from a lesson, the Share or Already shared action, and the
// confirmation dialog that previews the post.

// A piece of a lesson that can be shared. A question carries what its preview shows and whether its practice has a reading
// passage, which makes it unshareable.
export type SharePiece =
  | { kind: "example"; block: LessonBlockOf<"example"> }
  | { kind: "dialogue"; block: LessonBlockOf<"dialogue"> }
  | { kind: "question"; blockId: string; itemIndex: number; instruction: string; prompt: string; authorsVersion: (string | null)[]; passage: boolean };

const pieceBlockId = (piece: SharePiece) => piece.kind === "question" ? piece.blockId : piece.block.id;
export const sharePieceKey = (piece: SharePiece) => lessonShareKey({ blockId: pieceBlockId(piece), prompt: piece.kind === "question" ? piece.prompt : null });

type ShareScope = { groupId: string; courseId: string; lesson: CourseLesson; detail: CourseDetailResponse };
const ShareScopeContext = createContext<ShareScope | null>(null);

// Sharing is offered only from the published document of a published lesson in a course that is not archived; draft previews and
// archived courses get no share action. The course is read from the cache the course pages already fill, never fetched here.
export function useLessonShareScope(groupId: string, courseId: string, lesson: CourseLesson): ShareScope | null {
  const course = useQuery({ ...courseQueryOptions(groupId, courseId), enabled: false });
  const detail = course.data;
  return useMemo(() => detail && detail.course.status !== "archived" && lesson.published && lesson.document !== null
    ? { groupId, courseId, lesson, detail } : null, [courseId, detail, groupId, lesson]);
}

export function LessonShareScope({ scope, children }: { scope: ShareScope | null; children: ReactNode }) {
  return <ShareScopeContext.Provider value={scope}>{children}</ShareScopeContext.Provider>;
}

// Whether share actions show in this part of the page.
export const useCanShare = () => useContext(ShareScopeContext) !== null;

// The post as the feed card will show it, built from the lesson the viewer has open. The server builds the real snapshot itself.
function previewShare({ lesson, detail, courseId }: ShareScope, piece: SharePiece): PostLessonShare {
  const published = detail.outline.filter((entry) => entry.published);
  const number = published.findIndex((entry) => entry.id === lesson.id) + 1;
  const source = {
    courseId, lessonId: lesson.id, blockId: pieceBlockId(piece), linked: false, courseTitle: detail.course.title, lessonTitle: lesson.title,
    lessonNumber: number > 0 ? number : null, courseSlug: null, lessonSlug: null,
  };
  switch (piece.kind) {
    case "example": {
      const { translation, note } = piece.block.props;
      return { kind: "example", source, example: { content: piece.block.content, translation: translation.trim() || null, note: note.trim() || null }, speechUrl: lesson.speech[`example:${piece.block.id}`] ?? null };
    }
    case "dialogue": {
      const prefix = `turn:${piece.block.id}:`;
      const speech = Object.fromEntries(Object.entries(lesson.speech).filter(([key]) => key.startsWith(prefix)));
      return { kind: "dialogue", source, available: true, turns: readDialogueTurns(piece.block), speech };
    }
    case "question":
      return { kind: "question", source, question: { instruction: piece.instruction, prompt: piece.prompt, authorsVersion: piece.authorsVersion, itemIndex: piece.itemIndex } };
  }
}

// Records a share in the cached lesson reads, so the action turns into Already shared at once and without another request.
function useRecordShare({ groupId, courseId, lesson }: ShareScope) {
  const queryClient = useQueryClient();
  return (key: string, postId: string) => {
    const add = <T extends Pick<CourseLesson, "myShares">>(entry: T): T => ({ ...entry, myShares: { ...entry.myShares, [key]: postId } });
    queryClient.setQueryData(lessonQueryOptions(groupId, courseId, lesson.id).queryKey, (current: { lesson: CourseLesson } | undefined) => current && { ...current, lesson: add(current.lesson) });
    queryClient.setQueryData(courseQueryOptions(groupId, courseId).queryKey, (current: CourseDetailResponse | undefined) =>
      current && { ...current, lessons: current.lessons.map((entry) => entry.id === lesson.id ? add(entry) : entry) });
    void queryClient.invalidateQueries({ queryKey: ["posts", groupId] });
    void queryClient.invalidateQueries({ queryKey: ["profile-posts", groupId] });
  };
}

// The confirmation: the post's preview under the sharer's byline, an optional note (prefilled with an example's own note, which
// learners already see; a practice item's note is editor-only and never reaches here), and Share or Cancel.
function ShareDialog({ scope, piece, onClose }: { scope: ShareScope; piece: SharePiece; onClose: () => void }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  const user = session.data?.status === "signedIn" ? session.data.user : null;
  const [note, setNote] = useState(() => piece.kind === "example" ? piece.block.props.note : "");
  const share = useMemo(() => previewShare(scope, piece), [scope, piece]);
  const record = useRecordShare(scope);
  const key = sharePieceKey(piece);
  const create = useMutation({
    mutationFn: () => {
      const body: CreateLessonShareRequest = {
        courseId: scope.courseId, lessonId: scope.lesson.id, blockId: pieceBlockId(piece), note: note.trim() || null,
        ...(piece.kind === "question" ? { itemIndex: piece.itemIndex } : {}),
      };
      return apiRequest(`/api/groups/${encodeURIComponent(scope.groupId)}/lesson-shares`, createPostResponseSchema, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: ({ post }) => record(key, post.id),
    // Shared already, for example from another tab: the action links to that post instead.
    onError: (error) => {
      const existing = error instanceof ApiError ? lessonShareExistsErrorSchema.safeParse(error.body) : null;
      if (existing?.success) record(key, existing.data.postId);
    },
  });
  // The dialog renders through a portal, so its submit would otherwise also reach an enclosing form, such as an answer set.
  const submit = (event: FormEvent) => { event.preventDefault(); event.stopPropagation(); create.mutate(); };
  return <form className={styles.form} onSubmit={submit}>
    <p className={styles.help}>{t("lessonShares.intro")}</p>
    <div className={styles.card}>
      {user && <header className={styles.byline}>
        <Avatar name={user.displayName} src={user.avatarUrl || undefined} size={32} />
        <p><LessonShareByline share={share} name={user.displayName} time={t("lessonShares.justNow")} /></p>
      </header>}
      <LessonSharePreview share={share} />
    </div>
    <TextAreaField label={t("lessonShares.note")} description={t("lessonShares.noteHelp")} value={note} maxLength={POST_NOTES_MAX} autosize minRows={2}
      onChange={(event) => setNote(event.currentTarget.value)} />
    <CourseErrorMessage error={create.error} />
    <div className={styles.actions}>
      <Button variant="quiet" onClick={onClose}>{t("common.cancel")}</Button>
      <Button type="submit" loading={create.isPending}>{t("lessonShares.submit")}</Button>
    </div>
  </form>;
}

// The share action for one piece: Share, which opens the confirmation, or Already shared, which links to the post. A question of a
// practice with a reading passage cannot be shared, so its action is disabled with the reason (`describedBy` names a reason the
// caller shows once for several questions). Renders nothing where sharing is not offered.
export function ShareButton({ piece, label, describedBy }: { piece: SharePiece; label?: string; describedBy?: string }) {
  const { t } = useTranslation();
  const scope = useContext(ShareScopeContext);
  const [open, setOpen] = useState(false);
  const reasonId = useId();
  if (!scope) return null;
  const postId = scope.lesson.myShares[sharePieceKey(piece)];
  if (postId) return <Link className={styles.already} to="/journal/$postId" params={{ postId }} aria-label={t("lessonShares.alreadySharedOpen")}>
    <span aria-hidden="true">✓</span>{t("lessonShares.alreadyShared")}
  </Link>;
  if (piece.kind === "question" && piece.passage) return <span className={styles.unshareable}>
    <Button variant="quiet" disabled aria-describedby={describedBy ?? reasonId}>{t("lessonShares.share")}</Button>
    {!describedBy && <span id={reasonId} className={styles.help}>{t("lessonShares.passageHelp")}</span>}
  </span>;
  return <>
    <Button variant="secondary" className={styles.share} onClick={() => setOpen(true)} aria-label={label}>{t("lessonShares.share")}</Button>
    <AdaptiveDialog opened={open} onClose={() => setOpen(false)} title={t(`lessonShares.dialogTitle.${piece.kind}`)}>
      {open && <ShareDialog scope={scope} piece={piece} onClose={() => setOpen(false)} />}
    </AdaptiveDialog>
  </>;
}

// The note shown once above a reading practice's questions, which their disabled Share buttons point to.
export function PassageShareNote({ id }: { id: string }) {
  const { t } = useTranslation();
  return useCanShare() ? <p id={id} className={styles.help}>{t("lessonShares.passageHelp")}</p> : null;
}
