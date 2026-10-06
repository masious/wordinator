import { okResponseSchema, type Notification, type SessionResponse } from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { apiRequest, notificationsQueryOptions, restrictedNotificationsQueryOptions, sessionQueryOptions } from "../api";
import { Button, EmptyState, ErrorState, LabelChip, LoadingState, MetadataRow, PageHeader, Surface } from "../ui";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import styles from "./PhaseSixPages.module.css";

const notificationKey = (kind: Notification["kind"]) => `notifications.kinds.${kind}` as const;

function Notice({ item, restricted = false }: { item: Notification; restricted?: boolean }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: () => apiRequest(restricted ? `/api/notifications/status/${item.id}/read` : `/api/groups/${item.groupId}/notifications/${item.id}/read`, okResponseSchema, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: restricted ? ["restricted-notifications"] : ["notifications", item.groupId] }),
  });
  const content = <>
    <div className={styles.noticeHeading}><strong>{t(notificationKey(item.kind), { actor: item.actor.displayName })}</strong>{!item.readAt && <LabelChip>{t("notifications.unread")}</LabelChip>}</div>
    {restricted && <p>{item.groupName}</p>}
    {!item.targetAvailable && <p>{t("notifications.deletedTarget")}</p>}
    <MetadataRow><time dateTime={new Date(item.createdAt).toISOString()} title={new Date(item.createdAt).toLocaleString()}>{new Date(item.createdAt).toLocaleString()}</time></MetadataRow>
  </>;
  return <article className={`${styles.notice} ${item.readAt ? styles.read : ""}`}>
    {item.targetAvailable && item.postId
      ? <Link onClick={() => !item.readAt && markRead.mutate()} to="/groups/$groupId/posts/$postId" params={{ groupId: item.groupId, postId: item.postId }} search={item.commentId ? { comment: item.commentId } : {}}>{content}</Link>
      : <div>{content}</div>}
    {!item.readAt && <Button variant="quiet" loading={markRead.isPending} onClick={() => markRead.mutate()}>{t("notifications.markRead")}</Button>}
  </article>;
}

export function NotificationsPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions()); const notices = useQuery(notificationsQueryOptions(groupId));
  const readAll = useMutation({ mutationFn: () => apiRequest(`/api/groups/${groupId}/notifications/read-all`, okResponseSchema, { method: "POST" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", groupId] }) });
  if (session.isPending || notices.isPending) return <main className={styles.center}><LoadingState label={t("notifications.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (notices.isError) return <main className={styles.center}><ErrorState title={t("notifications.unavailable")}><Button onClick={() => notices.refetch()}>{t("common.retry")}</Button></ErrorState></main>;
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.page}><PageHeader eyebrow={<LabelChip>{t("notifications.eyebrow")}</LabelChip>} title={t("notifications.title")} intro={t("notifications.intro")} actions={!!notices.data.items.some((item) => !item.readAt) && <Button variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}>{t("notifications.markAllRead")}</Button>} />
      {!notices.data.items.length ? <Surface tone="quiet"><EmptyState title={t("notifications.emptyTitle")}>{t("notifications.emptyBody")}</EmptyState></Surface> : <Surface className={styles.list} tone="quiet">{notices.data.items.map((item) => <Notice key={item.id} item={item} />)}</Surface>}
    </div>
  </GroupFrame>;
}

export function RestrictedNotices({ session }: { session: Extract<SessionResponse, { status: "signedIn" }> }) {
  const { t } = useTranslation(); const notices = useQuery(restrictedNotificationsQueryOptions());
  if (notices.isPending) return <LoadingState label={t("notifications.loadingStatus")} />;
  if (notices.isError) return <ErrorState title={t("notifications.statusUnavailable")}><Button onClick={() => notices.refetch()}>{t("common.retry")}</Button></ErrorState>;
  const relevant = notices.data.items.filter((item) => session.requests.some((request) => request.groupId === item.groupId));
  return relevant.length ? <Surface className={styles.list} tone="quiet">{relevant.map((item) => <Notice key={item.id} item={item} restricted />)}</Surface> : null;
}
