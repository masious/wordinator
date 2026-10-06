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
} from "../../ui";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ErrorMessage from "../../molecules/ErrorMessage";
import {
  EllipsisVertical,
  Eye,
  Heart,
  MessagesSquare,
  PencilLine,
  Trash,
} from "lucide-react";
import { PlainText } from "../../molecules/PlainText";
import CoursePostPreview from "./CoursePostPreview";
import styles from "./PostCard.module.css";

function RelativeTime({ value }: { value: number }) {
  const seconds = Math.round((value - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(seconds) < 60
      ? [seconds, "second"]
      : Math.abs(seconds) < 3_600
        ? [Math.round(seconds / 60), "minute"]
        : Math.abs(seconds) < 86_400
          ? [Math.round(seconds / 3_600), "hour"]
          : [Math.round(seconds / 86_400), "day"];
  return (
    <time
      dateTime={new Date(value).toISOString()}
      title={new Date(value).toLocaleString()}
    >
      {formatter.format(amount, unit)}
    </time>
  );
}

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
        await navigate({ to: "/groups/$groupId", params: { groupId } });
    },
  });
  const body =
    compact && post.body.length > 360
      ? `${post.body.slice(0, 360)}…`
      : post.body;
  return (
    <article className={styles.postShell}>
      <div className={styles.postCard}>
        <header className={styles.postHeader}>
          <Link
            to="/groups/$groupId/members/$userId"
            params={{ groupId, userId: post.author.id }}
            className={styles.author}
          >
            <Avatar
              name={post.author.displayName}
              src={post.author.avatarUrl || undefined}
            />
            <span>{post.author.displayName}</span>
          </Link>
          <div className={styles.meta}>
            {/* <LabelChip>{t(`posts.types.${post.type}`)}</LabelChip> */}
            <RelativeTime value={post.createdAt} />
            {/* TODO: move inside dropdown */}
            {post.edited && <span>{t("posts.edited")}</span>}
          </div>
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
               <Menu.Item
                color="var(--color-danger-text)"
                disabled
                leftSection={<Eye size={20} />}
              >
                {t("posts.seen", { count: 7 })}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </header>
        {post.course ? (
          <CoursePostPreview course={post.course} groupId={groupId} />
        ) : (
          <div className={styles.postBody}>
            <PlainText>{body}</PlainText>
          </div>
        )}
        {!compact && post.type === "reading" && (
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
        {settings.data && (
          <ReactionBar
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
        )}
        <footer className={styles.postFooter}>
          <span>{t("posts.responseCount", { count: post.commentCount })}</span>
          <span>{t("posts.reactionCount", { count: post.reactionCount })}</span>
          <span className={styles.grow} />
          {compact && (
            <Link
              className={styles.openPost}
              to="/groups/$groupId/posts/$postId"
              params={{ groupId, postId: post.id }}
            >
              {t(post.body.length > 360 ? "posts.readMore" : "posts.open")}
              <ArrowIcon />
            </Link>
          )}
          {/* {post.permissions.edit && (
            <Button variant="quiet" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
          )}
          {post.permissions.delete && (
            <Button variant="quiet" onClick={() => setDeleting(true)}>
              {t("common.delete")}
            </Button>
          )} */}
        </footer>
        <AdaptiveDialog
          opened={editing}
          onClose={() => setEditing(false)}
          title={t("posts.editTitle")}
        >
          {session.data?.status === "signedIn" && (
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
      </div>
    </article>
  );
}
