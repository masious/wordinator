import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./Tutor.module.css";

const seenKey = (accountId: string) => `wordinator:ui:v1:tutor-privacy-seen:${accountId}`;

// The privacy notice above a conversation's first message (docs/ai-tutor.md#conversations): in full on the account's first visit
// in this browser, then one line that opens to the full notice. Storage that is unavailable keeps the full notice.
export function PrivacyNotice({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const [seen] = useState(() => { try { return localStorage.getItem(seenKey(accountId)) === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(seenKey(accountId), "1"); } catch { /* shown in full again next time */ } }, [accountId]);
  if (!seen) return <p className={styles.privacy}>{t("tutor.privacy")}</p>;
  return <details className={`${styles.privacy} ${styles.privacyCompact}`}>
    <summary>{t("tutor.privacyShort")}</summary>
    <p>{t("tutor.privacy")}</p>
  </details>;
}
