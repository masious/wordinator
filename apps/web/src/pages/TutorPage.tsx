import type { AiProvider } from "@wordinator/contracts/ai";
import { tutorConversationResponseSchema } from "@wordinator/contracts/tutor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, List } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, sessionQueryOptions, speechRecognitionTokenSource, tutorConversationQueryOptions, tutorConversationsKey } from "../api";
import { RECOGNITION_LOCALES } from "../molecules/speechRecognition";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { TutorChat } from "../organisms/Tutor/Chat";
import { ConversationList } from "../organisms/Tutor/ConversationList";
import { ModelPicker } from "../organisms/Tutor/ModelPicker";
import { conversationPath } from "../organisms/Tutor/tutorApi";
import { Button, ErrorState, LoadingState } from "../ui";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./TutorPage.module.css";

// `/ai` (docs/ai-tutor.md#entry-point): the conversation list beside the chat above `48em`, one pane at a time below it. The open
// conversation is the `conversation` search parameter; without one the chat is a new conversation, created on the first message.
export function TutorPage({ groupId, conversationId, onOpen }: { groupId: string; conversationId: string | null; onOpen: (conversationId: string | null) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions());
  const conversation = useQuery({ ...tutorConversationQueryOptions(conversationId ?? ""), enabled: Boolean(conversationId) });
  const [archivedView, setArchivedView] = useState(false);
  const [pane, setPane] = useState<"list" | "chat">("chat");
  // A new conversation's model is held here until its first message creates it.
  const [draftProvider, setDraftProvider] = useState<AiProvider | null>(null);
  const token = useMemo(() => speechRecognitionTokenSource(groupId), [groupId]);
  const move = useMutation({
    mutationFn: (archive: boolean) => apiRequest(`${conversationPath(conversationId ?? "")}/${archive ? "archive" : "unarchive"}`, tutorConversationResponseSchema, { method: "POST" }),
    onSuccess: async (response) => {
      queryClient.setQueryData(tutorConversationQueryOptions(response.conversation.id).queryKey, response);
      await queryClient.invalidateQueries({ queryKey: tutorConversationsKey });
    },
  });
  const choose = useMutation({
    mutationFn: (provider: AiProvider | null) => apiRequest(conversationPath(conversationId ?? ""), tutorConversationResponseSchema, { method: "PATCH", body: JSON.stringify({ provider }) }),
    onSuccess: (response) => { queryClient.setQueryData(tutorConversationQueryOptions(response.conversation.id).queryKey, response); },
  });
  if (session.isPending) return <main className={shellStyles.center}><LoadingState label={t("tutor.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const language = session.data.groups.find((group) => group.id === groupId)?.language ?? "nl";
  const languageName = t(`languages.${language}`, { defaultValue: language });
  const locale = RECOGNITION_LOCALES[language as keyof typeof RECOGNITION_LOCALES] ?? null;
  const current = conversation.data?.conversation ?? null;
  const archived = current?.archivedAt != null;

  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.page} data-pane={pane}>
    <h1 className={styles.visuallyHidden}>{t("tutor.title")}</h1>
    <div className={styles.listPane}>
      <ConversationList activeId={conversationId} archived={archivedView} onArchivedView={setArchivedView}
        onNew={() => { onOpen(null); setDraftProvider(null); setPane("chat"); }} onOpen={() => setPane("chat")} />
    </div>
    <section className={styles.chatPane} aria-label={t("tutor.chat")}>
      <header className={styles.chatHead}>
        <Button variant="quiet" className={styles.listToggle} onClick={() => setPane("list")} trailingIcon={<List size={16} />}>{t("tutor.conversations")}</Button>
        <h2 className={styles.chatTitle}>{current?.title || t("tutor.newTitle")}</h2>
        {!(conversationId && !current) && <ModelPicker value={current ? current.provider : draftProvider} disabled={archived || choose.isPending}
          error={choose.isError ? t("tutor.model.failed") : null}
          onChange={(provider) => { if (current) choose.mutate(provider); else setDraftProvider(provider); }} />}
        {current && <Button variant="quiet" loading={move.isPending} onClick={() => move.mutate(!archived)}
          trailingIcon={archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}>{archived ? t("tutor.unarchive") : t("tutor.archive")}</Button>}
      </header>
      {conversationId && conversation.isPending ? <LoadingState label={t("tutor.loading")} />
        : conversationId && conversation.isError ? <ErrorState title={t("tutor.unavailable")} action={<Button variant="secondary" onClick={() => onOpen(null)}>{t("tutor.new")}</Button>} />
        : <TutorChat conversationId={conversationId} conversation={current} language={language} languageName={languageName} recognitionLocale={locale} token={token}
          newProvider={draftProvider} onCreated={(created) => onOpen(created.id)} />}
    </section>
  </div></GroupFrame>;
}
