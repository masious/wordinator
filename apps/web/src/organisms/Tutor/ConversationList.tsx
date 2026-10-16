import { tutorConversationResponseSchema, type TutorConversation } from "@wordinator/contracts/tutor";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiRequest, tutorConversationQueryOptions, tutorConversationsKey, tutorConversationsQueryOptions } from "../../api";
import { Button, IconButton } from "../../ui";
import { conversationPath } from "./tutorApi";
import styles from "./Tutor.module.css";

// The conversation list (docs/ai-tutor.md#conversations): active ones most recently updated first, with an Archived view.
// Archive and Unarchive move a conversation between them; nothing is ever deleted.
export function ConversationList({ activeId, archived, onArchivedView, onNew, onOpen }: {
  activeId: string | null; archived: boolean; onArchivedView: (archived: boolean) => void; onNew: () => void; onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const conversations = useInfiniteQuery(tutorConversationsQueryOptions(archived));
  const move = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => apiRequest(`${conversationPath(id)}/${archive ? "archive" : "unarchive"}`, tutorConversationResponseSchema, { method: "POST" }),
    onSuccess: async (response) => {
      queryClient.setQueryData(tutorConversationQueryOptions(response.conversation.id).queryKey, response);
      await queryClient.invalidateQueries({ queryKey: tutorConversationsKey });
    },
  });
  const items = conversations.data?.pages.flatMap((page) => page.items) ?? [];
  const title = (conversation: TutorConversation) => conversation.title || t("tutor.untitled");
  return <nav className={styles.conversationList} aria-label={t("tutor.conversations")}>
    <div className={styles.listHead}>
      <div className={styles.views} role="group" aria-label={t("tutor.views")}>
        <button type="button" aria-pressed={!archived} onClick={() => onArchivedView(false)}>{t("tutor.active")}</button>
        <button type="button" aria-pressed={archived} onClick={() => onArchivedView(true)}>{t("tutor.archived")}</button>
      </div>
      <Button variant="secondary" onClick={onNew} trailingIcon={<Plus size={16} />}>{t("tutor.new")}</Button>
    </div>
    {move.isError && <p className={styles.errorLine} role="alert">{t("errors.generic")}</p>}
    {conversations.isError ? <p className={styles.errorLine} role="alert">{t("tutor.listUnavailable")}</p>
      : !conversations.isPending && items.length === 0 ? <p className={styles.listEmpty}>{archived ? t("tutor.noArchived") : t("tutor.noConversations")}</p>
      : <ul className={styles.listItems}>
        {items.map((conversation) => <li key={conversation.id} className={styles.listItem} data-active={conversation.id === activeId || undefined}>
          <Link to="/ai" search={{ conversation: conversation.id }} aria-current={conversation.id === activeId ? "page" : undefined} onClick={onOpen}>
            <span className={styles.listTitle}>{title(conversation)}</span>
            <span className={styles.listDate}>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
          </Link>
          <IconButton variant="subtle" label={archived ? t("tutor.unarchiveNamed", { title: title(conversation) }) : t("tutor.archiveNamed", { title: title(conversation) })}
            loading={move.isPending && move.variables?.id === conversation.id} onClick={() => move.mutate({ id: conversation.id, archive: !archived })}>
            {archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
          </IconButton>
        </li>)}
      </ul>}
    {conversations.hasNextPage && <Button variant="quiet" loading={conversations.isFetchingNextPage} onClick={() => void conversations.fetchNextPage()}>{t("tutor.more")}</Button>}
  </nav>;
}
