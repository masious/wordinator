import type { TutorConversation } from "@wordinator/contracts/tutor";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./Tutor.module.css";

// The chat header's title. Editing and session metadata live together in the conversation-details dialog.
export function ConversationTitle({ conversation, fallback }: { conversation: TutorConversation | null; fallback: string }) {
  const { t } = useTranslation();
  const title = conversation?.title || fallback;
  return <div className={styles.titleRow}>
    <h2 className={styles.chatTitle} title={title}>{title}</h2>
    {conversation?.titleSource === "tutor" && <span className={styles.titleMark} title={t("tutor.rename.byTutor")}><Sparkles size={14} aria-label={t("tutor.rename.byTutor")} /></span>}
  </div>;
}
