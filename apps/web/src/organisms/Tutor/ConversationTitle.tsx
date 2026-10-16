import { TUTOR_TITLE_MAX, tutorConversationResponseSchema, type TutorConversation } from "@wordinator/contracts/tutor";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, PencilLine, Sparkles, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, tutorConversationQueryOptions, tutorConversationsKey } from "../../api";
import { IconButton, TextField } from "../../ui";
import { conversationPath } from "./tutorApi";
import styles from "./Tutor.module.css";

// The chat header's title (docs/ai-tutor.md#conversation-titles). The learner renames a conversation in place: the pencil opens a
// one-line field, Enter or the check saves, Escape or the cross cancels. A title the tutor chose carries a small marker.
export function ConversationTitle({ conversation, fallback }: { conversation: TutorConversation | null; fallback: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const rename = useMutation({
    mutationFn: (title: string) => apiRequest(conversationPath(conversation!.id), tutorConversationResponseSchema, { method: "PATCH", body: JSON.stringify({ title }) }),
    onSuccess: async (response) => {
      queryClient.setQueryData(tutorConversationQueryOptions(response.conversation.id).queryKey, response);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: tutorConversationsKey });
    },
  });
  const title = conversation?.title || fallback;

  if (!conversation || draft === null) return <div className={styles.titleRow}>
    <h2 className={styles.chatTitle} title={title}>{title}</h2>
    {conversation?.titleSource === "tutor" && <span className={styles.titleMark} title={t("tutor.rename.byTutor")}><Sparkles size={14} aria-label={t("tutor.rename.byTutor")} /></span>}
    {conversation && <IconButton tone="quiet" label={t("tutor.rename.action")} onClick={() => { rename.reset(); setDraft(conversation.title); }}>
      <PencilLine size={16} aria-hidden="true" />
    </IconButton>}
  </div>;

  const value = draft.replace(/\s+/g, " ").trim();
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (!value || rename.isPending) return;
    if (value === conversation.title) { setDraft(null); return; }
    rename.mutate(value);
  };
  return <form className={styles.titleRow} onSubmit={save}>
    <TextField className={styles.titleField} aria-label={t("tutor.rename.label")} value={draft} maxLength={TUTOR_TITLE_MAX} autoFocus size="sm"
      error={rename.isError ? t("tutor.rename.failed") : undefined}
      onChange={(event) => setDraft(event.currentTarget.value)} onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setDraft(null); } }} />
    <IconButton tone="quiet" type="submit" label={t("tutor.rename.save")} disabled={!value} loading={rename.isPending}><Check size={16} aria-hidden="true" /></IconButton>
    <IconButton tone="quiet" label={t("tutor.rename.cancel")} onClick={() => setDraft(null)}><X size={16} aria-hidden="true" /></IconButton>
  </form>;
}
