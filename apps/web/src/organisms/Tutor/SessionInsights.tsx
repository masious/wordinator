import { TUTOR_TITLE_MAX, tutorConversationResponseSchema, type TutorConversation, type TutorMessage, type TutorTokenCount, type TutorUsage } from "@wordinator/contracts/tutor";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Clock3, MessageSquareText, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { relativeTime } from "../../relativeTime";
import { apiRequest, tutorConversationQueryOptions, tutorConversationsKey, tutorMessagesQueryOptions, tutorUsageQueryOptions } from "../../api";
import { AdaptiveDialog, Button, TextField } from "../../ui";
import { conversationPath } from "./tutorApi";
import styles from "./SessionInsights.module.css";

const messageText = (message: TutorMessage) => message.parts.flatMap((part) => part.type === "text" ? [part.text.replace(/^#+\s*/gm, "")] : []).join(" ").replace(/\s+/g, " ").trim();
const excerpt = (value: string, length = 180) => value.length > length ? `${value.slice(0, length).trimEnd()}…` : value;

export type TutorSessionInsights = {
  messages: number;
  learnerTurns: number;
  tutorTurns: number;
  completedActivities: number;
  // `summary` is the tutor's own line for the call; results stored before tools took one have none.
  toolCalls: { id: string; name: string; ok: boolean; summary: string | null }[];
  summary: string;
  usage: TutorTokenCount | null;
  today: TutorUsage["today"] | null;
};

export function useTutorSessionInsights(conversationId: string | null): TutorSessionInsights {
  const { t } = useTranslation();
  const messages = useInfiniteQuery({ ...tutorMessagesQueryOptions(conversationId ?? ""), enabled: Boolean(conversationId) });
  const usage = useQuery({ ...tutorUsageQueryOptions(conversationId), enabled: Boolean(conversationId) });
  const list = (messages.data?.pages.flatMap((page) => page.items) ?? []).slice().reverse();
  const learner = list.filter((message) => message.role === "user");
  const tutor = list.filter((message) => message.role === "assistant");
  const completedActivities = tutor.flatMap((message) => message.parts).filter((part) =>
    (part.type === "component" || part.type === "confirmation") && part.answeredAt !== null).length;
  const toolCalls = tutor.flatMap((message) => message.parts.flatMap((part) => part.type === "tool_result"
    ? [{ id: part.toolCallId, name: part.name, ok: part.ok, summary: typeof part.detail.summary === "string" ? part.detail.summary : null }] : [])).slice(-4).reverse();
  const opening = learner.map(messageText).find(Boolean);
  const latest = tutor.map(messageText).filter(Boolean).at(-1);
  const summary = latest
    ? excerpt(latest)
    : opening
      ? t("tutor.session.summaryOpening", { topic: excerpt(opening, 120) })
      : t("tutor.session.emptySummary");
  return {
    messages: list.length,
    learnerTurns: learner.length,
    tutorTurns: tutor.length,
    completedActivities,
    toolCalls,
    summary,
    usage: usage.data?.conversation ?? null,
    today: usage.data?.today ?? null,
  };
}

function ToolLabel({ tool }: { tool: TutorSessionInsights["toolCalls"][number] }) {
  const { t } = useTranslation();
  return <li>
    <span className={styles.contextIcon} data-ok={tool.ok || undefined}>{tool.ok ? <CheckCircle2 aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}</span>
    <span>{tool.summary ?? t(`tutor.steps.done.${tool.name}`, { defaultValue: t("tutor.steps.done.default") })}</span>
  </li>;
}

export function TutorContextRail({ conversation, insights }: { conversation: TutorConversation | null; insights: TutorSessionInsights }) {
  const { t } = useTranslation();
  return <aside className={styles.rail} aria-label={t("tutor.session.contextRail")}>
    <section className={styles.hero}>
      <span className={styles.eyebrow}>{t("tutor.session.focus")}</span>
      <h2>{conversation?.title || t("tutor.newTitle")}</h2>
      <p>{conversation ? <time dateTime={new Date(conversation.updatedAt).toISOString()} title={new Date(conversation.updatedAt).toLocaleString()}>
        {t("tutor.session.updated", { time: relativeTime(conversation.updatedAt) })}
      </time> : t("tutor.session.newHint")}</p>
    </section>
    <section className={styles.card}>
      <header><h2>{t("tutor.session.context")}</h2><span>{t("tutor.session.items", { count: insights.toolCalls.length + (conversation ? 1 : 0) + (insights.completedActivities > 0 ? 1 : 0) })}</span></header>
      <ul className={styles.contextList}>
        {conversation && <li><MessageSquareText aria-hidden="true" /><span>{t("tutor.session.turns", { count: insights.learnerTurns })}</span></li>}
        {insights.completedActivities > 0 && <li><Sparkles aria-hidden="true" /><span>{t("tutor.session.activities", { count: insights.completedActivities })}</span></li>}
        {insights.toolCalls.map((tool) => <ToolLabel key={tool.id} tool={tool} />)}
        {!conversation && <li><Clock3 aria-hidden="true" /><span>{t("tutor.session.contextEmpty")}</span></li>}
      </ul>
    </section>
    <section className={styles.card}>
      <header><h2>{t("tutor.session.tryAsking")}</h2></header>
      <p className={styles.summary}>{insights.summary}</p>
    </section>
  </aside>;
}

export function ConversationDetailsDialog({ conversation, insights, opened, focusTitle = false, onClose }: {
  conversation: TutorConversation | null; insights: TutorSessionInsights; opened: boolean; focusTitle?: boolean; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(conversation?.title ?? "");
  const compact = new Intl.NumberFormat(i18n.language, { notation: "compact", maximumFractionDigits: 1 });
  const rename = useMutation({
    mutationFn: (title: string) => apiRequest(conversationPath(conversation!.id), tutorConversationResponseSchema, { method: "PATCH", body: JSON.stringify({ title }) }),
    onSuccess: async (response) => {
      queryClient.setQueryData(tutorConversationQueryOptions(response.conversation.id).queryKey, response);
      await queryClient.invalidateQueries({ queryKey: tutorConversationsKey });
    },
  });
  const normalized = draft.replace(/\s+/g, " ").trim();
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!conversation || !normalized || rename.isPending) return;
    if (normalized === conversation.title) { onClose(); return; }
    rename.mutate(normalized, { onSuccess: onClose });
  };
  const tokens = insights.usage ? insights.usage.tokensIn + insights.usage.tokensOut : conversation?.tokens ?? 0;
  return <AdaptiveDialog opened={opened} onClose={onClose} title={t("tutor.details.title")}>
    <form className={styles.dialog} onSubmit={save}>
      <TextField label={t("tutor.rename.label")} value={draft} maxLength={TUTOR_TITLE_MAX} disabled={!conversation} data-autofocus={focusTitle || undefined}
        error={rename.isError ? t("tutor.rename.failed") : undefined} onChange={(event) => setDraft(event.currentTarget.value)} />
      <section className={styles.dialogSection}>
        <span className={styles.eyebrow}>{t("tutor.details.summary")}</span>
        <p>{insights.summary}</p>
      </section>
      <dl className={styles.metrics}>
        <div><dt>{t("tutor.details.tokens")}</dt><dd>{t("tutor.usage.tokens", { total: compact.format(tokens) })}</dd></div>
        {insights.today && <div><dt>{t("tutor.details.todayTokens")}</dt><dd>{t("tutor.usage.tokens", { total: compact.format(insights.today.tokensIn + insights.today.tokensOut) })}</dd></div>}
        <div><dt>{t("tutor.details.turns")}</dt><dd>{insights.learnerTurns}</dd></div>
        {insights.today && <div><dt>{t("tutor.details.dailyTurns")}</dt><dd>{t("tutor.usage.turns", { used: insights.today.turns, cap: insights.today.turnCap })}</dd></div>}
        <div><dt>{t("tutor.details.activities")}</dt><dd>{insights.completedActivities}</dd></div>
        <div><dt>{t("tutor.details.tools")}</dt><dd>{insights.toolCalls.length}</dd></div>
      </dl>
      {insights.toolCalls.length > 0 && <section className={styles.dialogSection}>
        <span className={styles.eyebrow}>{t("tutor.details.recentTools")}</span>
        <ul className={styles.toolList}>{insights.toolCalls.map((tool) => <ToolLabel key={tool.id} tool={tool} />)}</ul>
      </section>}
      <div className={styles.dialogActions}><Button variant="quiet" type="button" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={!conversation || !normalized} loading={rename.isPending}>{t("tutor.details.save")}</Button></div>
    </form>
  </AdaptiveDialog>;
}
