import type { TutorTokenCount } from "@wordinator/contracts/tutor";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { tutorUsageQueryOptions } from "../../api";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import styles from "./Tutor.module.css";

// The learner's own tutor usage (docs/ai-tutor.md#usage-box) under the conversation list: today's tokens across every conversation
// with the turns used of the daily cap, and the open conversation's tokens. The chat refreshes it after every turn.
export function UsageBox({ conversationId }: { conversationId: string | null }) {
  const { t, i18n } = useTranslation();
  const usage = useQuery(tutorUsageQueryOptions(conversationId));
  const compact = new Intl.NumberFormat(i18n.language, { notation: "compact", maximumFractionDigits: 1 });
  const tokens = (count: TutorTokenCount) => <>
    <span className={styles.usageValue}>{t("tutor.usage.tokens", { total: compact.format(count.tokensIn + count.tokensOut) })}</span>
    <span className={styles.usageSplit}>{t("tutor.usage.split", { input: compact.format(count.tokensIn), output: compact.format(count.tokensOut) })}</span>
  </>;
  if (usage.isError) return <p className={styles.errorLine}>{t("tutor.usage.unavailable")}</p>;
  if (!usage.data) return null;
  const { today, conversation } = usage.data;
  const resets = new Date(today.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return <section className={styles.usage} aria-label={t("tutor.usage.title")}>
    <h2 className={styles.usageTitle}>{t("tutor.usage.title")}</h2>
    <dl className={styles.usageList}>
      <div><dt>{t("tutor.usage.today")}</dt><dd>{tokens(today)}</dd></div>
      {conversation && <div><dt>{t("tutor.usage.conversation")}</dt><dd>{tokens(conversation)}</dd></div>}
    </dl>
    {today.turnCap > 0 && <div className={styles.usageTurns}>
      <ProgressMeter size="compact" value={(today.turns / today.turnCap) * 100} label={t("tutor.usage.turns", { used: today.turns, cap: today.turnCap })} />
      <p className={styles.usageMeta}><span>{t("tutor.usage.turns", { used: today.turns, cap: today.turnCap })}</span><span>{t("tutor.usage.resets", { time: resets })}</span></p>
    </div>}
  </section>;
}
