import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./TutorCta.module.css";

// Ask your tutor (docs/ai-tutor.md#entry-point): the featured card at the top of `/courses` that opens `/ai` with a new conversation.
export function TutorCta() {
  const { t } = useTranslation();
  return <Link className={styles.cta} to="/ai">
    <span className={styles.copy}>
      <span className={styles.title}>{t("tutor.cta.title")}</span>
      <span className={styles.pitch}>{t("tutor.cta.pitch")}</span>
    </span>
    <span className={styles.button}><Sparkles size={16} aria-hidden="true" />{t("tutor.cta.action")}</span>
  </Link>;
}
