import type { AiProvider } from "@wordinator/contracts/ai";
import { tutorConversationResponseSchema } from "@wordinator/contracts/tutor";
import { Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, List, MoreHorizontal, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { apiRequest, sessionQueryOptions, speechRecognitionTokenSource, tutorConversationQueryOptions, tutorConversationsKey } from "../api";
import { RECOGNITION_LOCALES } from "../molecules/speechRecognition";
import { GroupFrame, useRailSlots } from "../organisms/GroupFrame/GroupFrame";
import { TutorChat } from "../organisms/Tutor/Chat";
import { ConversationList } from "../organisms/Tutor/ConversationList";
import { ConversationTitle } from "../organisms/Tutor/ConversationTitle";
import { ModelPicker } from "../organisms/Tutor/ModelPicker";
import { ConversationDetailsDialog, TutorContextRail, useTutorSessionInsights } from "../organisms/Tutor/SessionInsights";
import { conversationPath } from "../organisms/Tutor/tutorApi";
import { Button, ErrorState, IconButton, LoadingState } from "../ui";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./TutorPage.module.css";

// `/ai` (docs/ai-tutor.md#entry-point): recent conversations continue the app rail, the chat owns the centre, and roomy desktops
// get a session-context rail. The open conversation is the `conversation` search parameter; without one it is created on send.
export function TutorPage({ groupId, conversationId, prompt, onOpen }: { groupId: string; conversationId: string | null; prompt?: string; onOpen: (conversationId: string | null) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions());
  const conversation = useQuery({ ...tutorConversationQueryOptions(conversationId ?? ""), enabled: Boolean(conversationId) });
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const insights = useTutorSessionInsights(conversationId);
  if (session.isPending) return <main className={shellStyles.center}><LoadingState label={t("tutor.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const language = session.data.groups.find((group) => group.id === groupId)?.language ?? "nl";
  const languageName = t(`languages.${language}`, { defaultValue: language });
  const locale = RECOGNITION_LOCALES[language as keyof typeof RECOGNITION_LOCALES] ?? null;
  const current = conversation.data?.conversation ?? null;
  const archived = current?.archivedAt != null;

  return <GroupFrame groupId={groupId} session={session.data} fill><TutorWorkspace conversationList={(closeRail) => <ConversationList activeId={conversationId} onOpen={closeRail}
      onNew={() => { closeRail(); onOpen(null); setDraftProvider(null); }} />} context={<TutorContextRail conversation={current} insights={insights} />}>
    <div className={styles.page}>
    <h1 className={styles.visuallyHidden}>{t("tutor.title")}</h1>
    <section className={styles.chatPane} aria-label={t("tutor.chat")}>
      <header className={styles.chatHead}>
        <RailToggle />
        <span className={styles.tutorMark} aria-hidden="true"><Sparkles /></span>
        <div className={styles.heading}>
          <ConversationTitle key={current?.id ?? "new"} conversation={current} fallback={t("tutor.newTitle")} />
          <p>{t("tutor.subtitle")}</p>
        </div>
        {!(conversationId && !current) && <ModelPicker value={current ? current.provider : draftProvider} disabled={archived || choose.isPending}
          error={choose.isError ? t("tutor.model.failed") : null}
          onChange={(provider) => { if (current) choose.mutate(provider); else setDraftProvider(provider); }} />}
        <IconButton tone="quiet" label={t("tutor.details.open")} onClick={() => setDetailsOpen(true)}><MoreHorizontal size={18} aria-hidden="true" /></IconButton>
        {current && <Tooltip label={archived ? t("tutor.unarchive") : t("tutor.archive")}>
          <IconButton tone="quiet" label={archived ? t("tutor.unarchive") : t("tutor.archive")} loading={move.isPending} onClick={() => move.mutate(!archived)}>
            {archived ? <ArchiveRestore size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}
          </IconButton>
        </Tooltip>}
      </header>
      {conversationId && conversation.isPending ? <LoadingState label={t("tutor.loading")} />
        : conversationId && conversation.isError ? <ErrorState title={t("tutor.unavailable")} action={<Button variant="secondary" onClick={() => onOpen(null)}>{t("tutor.new")}</Button>} />
        : <TutorChat accountId={session.data.user.id} conversationId={conversationId} conversation={current} language={language} languageName={languageName} recognitionLocale={locale} token={token}
          newProvider={draftProvider} initialText={conversationId ? undefined : prompt} onCreated={(created) => onOpen(created.id)} />}
    </section>
    <ConversationDetailsDialog key={current?.id ?? "new"} conversation={current} insights={insights} opened={detailsOpen} onClose={() => setDetailsOpen(false)} />
  </div></TutorWorkspace></GroupFrame>;
}

function TutorWorkspace({ conversationList, context, children }: { conversationList: (closeRail: () => void) => ReactNode; context: ReactNode; children: ReactNode }) {
  const slots = useRailSlots();
  const wideContext = useMediaQuery("(min-width: 75.01em)", false, { getInitialValueInEffect: false });
  return <>
    {slots.tutor && createPortal(<div className={styles.railConversations}>{conversationList(slots.closeRail)}</div>, slots.tutor)}
    {wideContext && slots.reference && createPortal(context, slots.reference)}
    {children}
  </>;
}

function RailToggle() {
  const { t } = useTranslation();
  const slots = useRailSlots();
  return <Button variant="quiet" className={styles.listToggle} onClick={slots.openRail} trailingIcon={<List size={16} />}>{t("tutor.conversations")}</Button>;
}
