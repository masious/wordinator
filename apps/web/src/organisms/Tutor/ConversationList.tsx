import { tutorConversationResponseSchema, type TutorConversation } from "@wordinator/contracts/tutor";
import { Menu, Switch } from "@mantine/core";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, FileText, MoreHorizontal, Pencil, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, tutorConversationQueryOptions, tutorConversationsKey, tutorConversationsQueryOptions } from "../../api";
import { relativeTime } from "../../relativeTime";
import { Button, IconButton } from "../../ui";
import { ConversationDetailsDialog, useTutorSessionInsights } from "./SessionInsights";
import { conversationPath } from "./tutorApi";
import styles from "./Tutor.module.css";

function RelativeTimestamp({ value, locale }: { value: number; locale: string }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refresh((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const date = new Date(value);
  return <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}>{relativeTime(value)}</time>;
}

function ConversationActions({ conversation, moving, onMove }: {
  conversation: TutorConversation; moving: boolean; onMove: (conversation: TutorConversation) => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"summary" | "rename" | null>(null);
  const insights = useTutorSessionInsights(dialog ? conversation.id : null);
  const title = conversation.title || t("tutor.untitled");
  const archived = conversation.archivedAt !== null;
  return <>
    <Menu opened={menuOpen} onChange={setMenuOpen} position="bottom-end" width={210} withinPortal>
      <Menu.Target>
        <IconButton tone="quiet" className={styles.listAction} label={t("tutor.actions.open", { title })} loading={moving}>
          <MoreHorizontal size={16} aria-hidden="true" />
        </IconButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<FileText size={16} aria-hidden="true" />} onClick={() => { setMenuOpen(false); setDialog("summary"); }}>{t("tutor.actions.summary")}</Menu.Item>
        <Menu.Item leftSection={<Pencil size={16} aria-hidden="true" />} onClick={() => { setMenuOpen(false); setDialog("rename"); }}>{t("tutor.actions.rename")}</Menu.Item>
        <Menu.Divider />
        <Menu.Item disabled={moving} leftSection={archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
          onClick={() => { setMenuOpen(false); onMove(conversation); }}>{t(archived ? "tutor.unarchive" : "tutor.archive")}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
    <ConversationDetailsDialog key={`${conversation.id}:${dialog ?? "closed"}`} conversation={conversation} insights={insights}
      opened={dialog !== null} focusTitle={dialog === "rename"} onClose={() => setDialog(null)} />
  </>;
}

// Active conversations are always shown. The switch at the list's end includes archived conversations in the same recency-sorted
// list; nothing is ever deleted. Each row's menu owns the less-common summary, rename, and archive actions.
export function ConversationList({ activeId, onNew, onOpen }: {
  activeId: string | null; onNew: () => void; onOpen?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const compact = new Intl.NumberFormat(i18n.language, { notation: "compact", maximumFractionDigits: 1 });
  const active = useInfiniteQuery(tutorConversationsQueryOptions(false));
  const archived = useInfiniteQuery({ ...tutorConversationsQueryOptions(true), enabled: includeArchived });
  const move = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => apiRequest(`${conversationPath(id)}/${archive ? "archive" : "unarchive"}`, tutorConversationResponseSchema, { method: "POST" }),
    onSuccess: async (response) => {
      queryClient.setQueryData(tutorConversationQueryOptions(response.conversation.id).queryKey, response);
      await queryClient.invalidateQueries({ queryKey: tutorConversationsKey });
    },
  });
  const activeItems = active.data?.pages.flatMap((page) => page.items) ?? [];
  const archivedItems = includeArchived ? archived.data?.pages.flatMap((page) => page.items) ?? [] : [];
  const items = [...activeItems, ...archivedItems].sort((left, right) => right.updatedAt - left.updatedAt);
  const title = (conversation: TutorConversation) => conversation.title || t("tutor.untitled");
  const unavailable = active.isError || (includeArchived && archived.isError);
  const pending = active.isPending || (includeArchived && archived.isPending);
  const hasMore = active.hasNextPage || (includeArchived && archived.hasNextPage);
  const fetchingMore = active.isFetchingNextPage || archived.isFetchingNextPage;
  const fetchMore = () => void Promise.all([
    active.hasNextPage ? active.fetchNextPage() : Promise.resolve(),
    includeArchived && archived.hasNextPage ? archived.fetchNextPage() : Promise.resolve(),
  ]);
  return <nav className={styles.conversationList} aria-label={t("tutor.conversations")}>
    <Button variant="secondary" className={styles.newConversation} onClick={onNew} trailingIcon={<Plus size={16} />}>{t("tutor.new")}</Button>
    {move.isError && <p className={styles.errorLine} role="alert">{t("errors.generic")}</p>}
    {unavailable ? <p className={styles.errorLine} role="alert">{t("tutor.listUnavailable")}</p>
      : !pending && items.length === 0 ? <p className={styles.listEmpty}>{includeArchived ? t("tutor.noConversationsAtAll") : t("tutor.noConversations")}</p>
      : <ul className={styles.listItems}>
        {items.map((conversation) => <li key={conversation.id} className={styles.listItem} data-active={conversation.id === activeId || undefined}
          data-archived={conversation.archivedAt !== null || undefined}>
          <Link to="/ai" search={{ conversation: conversation.id }} aria-current={conversation.id === activeId ? "page" : undefined} onClick={onOpen}>
            <span className={styles.listTitle}>
              {conversation.titleSource === "tutor" && <Sparkles className={styles.listMark} size={12} aria-label={t("tutor.rename.byTutor")} />}
              {title(conversation)}
            </span>
            <span className={styles.listMeta}>
              <RelativeTimestamp value={conversation.updatedAt} locale={i18n.language} />
              {conversation.archivedAt !== null && <span>{t("tutor.archived")}</span>}
              {conversation.tokens > 0 && <span>{t("tutor.usage.tokens", { total: compact.format(conversation.tokens) })}</span>}
            </span>
          </Link>
          <ConversationActions conversation={conversation} moving={move.isPending && move.variables?.id === conversation.id}
            onMove={(entry) => move.mutate({ id: entry.id, archive: entry.archivedAt === null })} />
        </li>)}
      </ul>}
    {hasMore && <Button variant="quiet" loading={fetchingMore} onClick={fetchMore}>{t("tutor.more")}</Button>}
    <Switch className={styles.archiveSwitch} checked={includeArchived} onChange={(event) => setIncludeArchived(event.currentTarget.checked)}
      label={t("tutor.includeArchived")} />
  </nav>;
}
