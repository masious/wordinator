import { useState } from "react";
import { okResponseSchema, type Post } from "@wordinator/contracts";
import ComposerForm from "../ComposerForm";
import { Link, useNavigate } from "@tanstack/react-router";
import ReactionBar from "../ReactionBar/ReactionBar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, sessionQueryOptions, settingsQueryOptions } from "../../api";
import {
  AdaptiveDialog,
  ArrowIcon,
  Avatar,
  Button,
  ConfirmDialog,
  LabelChip,
  type LabelChipTone,
} from "../../ui";
import { Menu } from "@mantine/core";
import { Trans, useTranslation } from "react-i18next";
import ErrorMessage from "../../molecules/ErrorMessage";
import {
  EllipsisVertical,
  Heart,
  MessagesSquare,
  PencilLine,
  Trash,
} from "lucide-react";
import { PlainText } from "../../molecules/PlainText";
import CoursePostPreview from "./CoursePostPreview";
import { LessonShareByline, LessonSharePreview } from "../LessonShare/LessonSharePreview";
import { ShareAnswerCheck, ShareNoteForm } from "../LessonShare/LessonSharePost";
import { relativeTime } from "../../relativeTime";
import styles from "./PostCard.module.css";

// Post-type badges (docs/design-system.md#journal): one tint per type, so the feed reads by type at a glance.
const typeTone: Record<Post["type"], LabelChipTone> = {
  shared_sentence: "default",
  question: "info",
  reading: "success",
  fill_in: "warm",
  course: "accent",
  lesson_share: "accent",
};

export default function PostCard({
  post,
  groupId,
  compact = true,
}: {
  post: Post;
  groupId: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [notesVisible, setNotesVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const session = useQuery(sessionQueryOptions());
  const settings = useQuery(settingsQueryOptions());
  const deletion = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}`,
        okResponseSchema,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      setDeleting(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["profile-posts", groupId] }),
      ]);
      if (!compact)
        await navigate({ to: "/journal" });
    },
  });
  const body =
    compact && post.body.length > 360
      ? `${post.body.slice(0, 360)}…`
      : post.body;
  const share = post.lessonShare;
  const byline = (
    <header className={styles.postHeader}>
      <Avatar
        name={post.author.displayName}
        src={post.author.avatarUrl || undefined}
        size={32}
      />
      <p className={styles.byline}>
        {post.lessonShare ? <LessonShareByline share={post.lessonShare} name={post.author.displayName} time={relativeTime(post.createdAt)}
          dateTime={new Date(post.createdAt).toISOString()} /> : <Trans
          i18nKey={`posts.byline.${post.type}`}
          values={{ name: post.author.displayName, time: relativeTime(post.createdAt) }}
          components={{
            name: <strong className={styles.author} />,
            time: (
              <time
                dateTime={new Date(post.createdAt).toISOString()}
                title={new Date(post.createdAt).toLocaleString()}
              />
            ),
          }}
        />}
        {post.edited && <span className={styles.edited}>{t("posts.edited")}</span>}
      </p>
    </header>
  );
  const content = (
    <>
      {byline}
      {share ? null : post.course ? (
        <CoursePostPreview course={post.course} groupId={groupId} linked={!compact} />
      ) : (
        <div className={styles.postBody}>
          <PlainText linkify={!compact}>{body}</PlainText>
        </div>
      )}
      {compact && post.body.length > 360 && (
        <span className={styles.readMore}>
          {t("posts.readMore")}
          <ArrowIcon />
        </span>
      )}
    </>
  );
  const reactionBar =
    settings.data && (
      <ReactionBar
        orientation="horizontal"
        compact
        reactions={post.reactions}
        quickReactions={settings.data.quickReactions}
        path={`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}/reactions`}
        onChanged={() => {
          void queryClient.invalidateQueries({
            queryKey: ["posts", groupId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["post", groupId, post.id],
          });
        }}
      />
    );
  return (
    <article className={styles.postCard}>
        <div className={styles.main}>
          {/* In the feed the whole card body is one link; the actions menu sits beside it so controls never nest inside it.
              A lesson share's piece has its own speech controls and links, so only its byline is the link and the piece follows it. */}
          {compact ? (
            <>
              <Link
                className={styles.cardLink}
                to="/journal/$postId"
                params={{ postId: post.id }}
              >
                {content}
              </Link>
              {share && <div className={styles.share}><LessonSharePreview share={share} /></div>}
            </>
          ) : (
            <div className={styles.cardContent}>
              {content}
              {share && <LessonSharePreview share={share} link />}
              {share?.kind === "question" && session.data?.status === "signedIn" && (
                <ShareAnswerCheck postId={post.id} groupId={groupId} accountId={session.data.user.id} question={share.question} />
              )}
              {post.type === "reading" && (
                <ol className={styles.questions}>
                  {post.questions.map((question) => (
                    <li key={question.id}>
                      <PlainText>{question.text}</PlainText>
                    </li>
                  ))}
                </ol>
              )}
              {post.notes && (
                <div>
                  <Button
                    variant="quiet"
                    onClick={() => setNotesVisible((value) => !value)}
                  >
                    {notesVisible ? t("posts.hideNotes") : t("posts.showNotes")}
                  </Button>
                  {notesVisible && (
                    <div className={styles.notes}>
                      <PlainText>{post.notes}</PlainText>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className={styles.tools}>
          <LabelChip tone={typeTone[post.type]}>{t(`posts.types.${post.type}`)}</LabelChip>
          <Menu
            position="bottom-end"
            width={220}
            withinPortal
            classNames={{ item: styles.actionsDropdownItem }}
          >
            <Menu.Target>
              <Button
                variant="quiet"
                aria-label={t("posts.moreActions")}
                className={styles.postActions}
              >
                <EllipsisVertical />
              </Button>
            </Menu.Target>
            <Menu.Dropdown className={styles.actionsDropdown}>
              {post.permissions.edit && <Menu.Item
                leftSection={<PencilLine size={20} />}
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t("common.edit")}
              </Menu.Item>}
              {post.permissions.delete && <Menu.Item
                color="var(--color-danger-text)"
                leftSection={<Trash size={20} />}
                onClick={() => {
                  setDeleting(true);
                }}
              >
                {t("common.delete")}
              </Menu.Item>}
              <Menu.Divider />
              <Menu.Item
                color="var(--color-danger-text)"
                disabled
                leftSection={<MessagesSquare size={20} />}
              >
                <span>
                  {t("posts.responseCount", { count: post.commentCount })}
                </span>
              </Menu.Item>
              <Menu.Item
                color="var(--color-danger-text)"
                disabled
                leftSection={<Heart size={20} />}
              >
                {t("posts.reactionCount", { count: post.reactionCount })}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          </div>
        </div>
        {/* The reactions row: reactions first, the mono response count at the row's end. */}
        <footer className={styles.footer}>
          {reactionBar}
          <span className={styles.responses}>
            <MessagesSquare size={16} aria-hidden="true" />
            {t("posts.responseCount", { count: post.commentCount })}
          </span>
        </footer>
        <AdaptiveDialog
          opened={editing}
          onClose={() => setEditing(false)}
          title={share ? t("lessonShares.editTitle") : t("posts.editTitle")}
        >
          {share ? (
            <ShareNoteForm
              post={post}
              groupId={groupId}
              onCancel={() => setEditing(false)}
              onDone={() => {
                setEditing(false);
                void queryClient.invalidateQueries({ queryKey: ["posts", groupId] });
                void queryClient.invalidateQueries({ queryKey: ["post", groupId, post.id] });
              }}
            />
          ) : session.data?.status === "signedIn" && (
            <ComposerForm
              groupId={groupId}
              session={session.data}
              initialPost={post}
              onDiscard={() => setEditing(false)}
              onDone={() => {
                setEditing(false);
                void queryClient.invalidateQueries({
                  queryKey: ["posts", groupId],
                });
                void queryClient.invalidateQueries({
                  queryKey: ["post", groupId, post.id],
                });
              }}
            />
          )}
        </AdaptiveDialog>
        <ConfirmDialog
          opened={deleting}
          onClose={() => setDeleting(false)}
          title={t("posts.deleteTitle")}
          confirmLabel={t("common.delete")}
          onConfirm={() => deletion.mutate()}
        >
          <p>{t("posts.deleteBody")}</p>
          <ErrorMessage error={deletion.error} />
        </ConfirmDialog>
    </article>
  );
}
