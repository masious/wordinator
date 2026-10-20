import {
  ADMIN_ANALYTICS_RANGES, aiAnalyticsResponseSchema, learningAnalyticsResponseSchema, speechAnalyticsResponseSchema, timeAnalyticsResponseSchema, type AdminAnalyticsRange,
} from "@wordinator/contracts/admin";
import { AI_SPEECH_CHAR_CAP_MAX, AI_TURN_CAP_MAX, aiModelIdSchema, aiSettingsSchema, type AiProviderSetting, type AiSettings } from "@wordinator/contracts/ai";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, sessionQueryOptions } from "../api";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { Button, CheckboxField, ErrorState, IconButton, LabelChip, LoadingState, PageHeader, SectionHeader, SelectField, Surface, TextField } from "../ui";
import styles from "./AdminAnalyticsPage.module.css";

// The superuser analytics page (C14e, docs/settings-and-administration.md#analytics): plain tables of counts, costs, and learning
// minutes by day and account for the chosen range, and the AI settings form. Other accounts get a not-available state; the API
// refuses them anyway.

export function validateAnalyticsSearch(search: Record<string, unknown>): { days?: AdminAnalyticsRange } {
  const days = Number(search.days);
  return (ADMIN_ANALYTICS_RANGES as readonly number[]).includes(days) ? { days: days as AdminAnalyticsRange } : {};
}

const learningQuery = (days: AdminAnalyticsRange) => queryOptions({
  queryKey: ["admin-analytics", "learning", days] as const,
  queryFn: () => apiRequest(`/api/admin/analytics/learning?days=${days}`, learningAnalyticsResponseSchema),
});
const aiQuery = (days: AdminAnalyticsRange) => queryOptions({
  queryKey: ["admin-analytics", "ai", days] as const,
  queryFn: () => apiRequest(`/api/admin/analytics/ai?days=${days}`, aiAnalyticsResponseSchema),
});
const speechQuery = (days: AdminAnalyticsRange) => queryOptions({
  queryKey: ["admin-analytics", "speech", days] as const,
  queryFn: () => apiRequest(`/api/admin/analytics/speech?days=${days}`, speechAnalyticsResponseSchema),
});
const timeQuery = (days: AdminAnalyticsRange) => queryOptions({
  queryKey: ["admin-analytics", "time", days] as const,
  queryFn: () => apiRequest(`/api/admin/analytics/time?days=${days}`, timeAnalyticsResponseSchema),
});
const aiSettingsQuery = () => queryOptions({
  queryKey: ["admin-ai-settings"] as const,
  queryFn: () => apiRequest("/api/admin/ai-settings", aiSettingsSchema),
});

// A column reads one number from a row; the footer sums it across the rows.
type Column<Row> = { key: string; label: string; value: (row: Row) => number; format?: (value: number) => string };

function useFormats() {
  const { i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const money = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return { number: (value: number) => number.format(value), cost: (microUsd: number) => money.format(microUsd / 1_000_000) };
}

function CountTable<Row>({ caption, head, rows, rowKey, label, columns, totals = false, empty }: {
  caption: string; head: string[]; rows: Row[]; rowKey: (row: Row) => string; label: (row: Row) => ReactNode[]; columns: Column<Row>[]; totals?: boolean; empty?: string;
}) {
  const { t } = useTranslation();
  const formats = useFormats();
  const show = (column: Column<Row>, value: number) => (column.format ?? formats.number)(value);
  if (!rows.length && empty) return <div className={styles.tableBlock}><h3 className={styles.tableTitle}>{caption}</h3><p className={styles.muted}>{empty}</p></div>;
  return <div className={styles.tableBlock}>
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.tableTitle}>{caption}</caption>
        <thead><tr>{head.map((item) => <th key={item} scope="col">{item}</th>)}{columns.map((column) => <th key={column.key} scope="col" className={styles.number}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(row)}>
          {label(row).map((cell, index) => index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}
          {columns.map((column) => <td key={column.key} className={styles.number}>{show(column, column.value(row))}</td>)}
        </tr>)}</tbody>
        {totals && <tfoot><tr>
          <th scope="row" colSpan={head.length}>{t("analytics.total")}</th>
          {columns.map((column) => <td key={column.key} className={styles.number}>{show(column, rows.reduce((sum, row) => sum + column.value(row), 0))}</td>)}
        </tr></tfoot>}
      </table>
    </div>
  </div>;
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Surface className={styles.section}><SectionHeader title={title} description={description} />{children}</Surface>;
}

function SectionState({ query }: { query: { isPending: boolean; isError: boolean; refetch: () => unknown } }) {
  const { t } = useTranslation();
  if (query.isPending) return <LoadingState label={t("analytics.loading")} />;
  return <ErrorState title={t("analytics.sectionUnavailable")}><Button onClick={() => query.refetch()}>{t("common.retry")}</Button></ErrorState>;
}

const accountName = (username: string | null, fallback: string) => username ?? fallback;
const newestFirst = <Row,>(rows: Row[]) => [...rows].reverse();

function LearningSection({ days }: { days: AdminAnalyticsRange }) {
  const { t } = useTranslation();
  const query = useQuery(learningQuery(days));
  type Counts = NonNullable<typeof query.data>["daily"][number] | NonNullable<typeof query.data>["accounts"][number];
  const counts: Column<Counts>[] = [
    { key: "lessonsCompleted", label: t("analytics.columns.lessonsCompleted"), value: (row) => row.lessonsCompleted },
    { key: "drillReviews", label: t("analytics.columns.drillReviews"), value: (row) => row.drillReviews },
    { key: "practiceLesson", label: t("analytics.columns.practiceLesson"), value: (row) => row.practiceAttempts.lesson },
    { key: "practiceAiChat", label: t("analytics.columns.practiceAiChat"), value: (row) => row.practiceAttempts.aiChat },
    { key: "practiceAiPractice", label: t("analytics.columns.practiceAiPractice"), value: (row) => row.practiceAttempts.aiPractice },
    { key: "pronunciation", label: t("analytics.columns.pronunciation"), value: (row) => row.pronunciationAttempts },
  ];
  return <Section title={t("analytics.learning.title")} description={t("analytics.learning.description")}>
    {query.data ? <>
      <CountTable caption={t("analytics.byDay")} head={[t("analytics.columns.day")]} rows={newestFirst(query.data.daily)} rowKey={(row) => row.day} label={(row) => [row.day]}
        columns={[{ key: "activeAccounts", label: t("analytics.columns.activeAccounts"), value: (row) => row.activeAccounts }, ...counts]} />
      <CountTable caption={t("analytics.byAccount")} head={[t("analytics.columns.account")]} rows={query.data.accounts} rowKey={(row) => row.userId}
        label={(row) => [accountName(row.username, t("analytics.noUsername"))]} empty={t("analytics.noAccounts")} totals
        columns={[{ key: "activeDays", label: t("analytics.columns.activeDays"), value: (row) => row.activeDays }, ...counts]} />
    </> : <SectionState query={query} />}
  </Section>;
}

function AiSection({ days }: { days: AdminAnalyticsRange }) {
  const { t } = useTranslation();
  const formats = useFormats();
  const query = useQuery(aiQuery(days));
  type Counts = { turns: number; requests: number; failures: number; tokensIn: number; tokensOut: number; costMicroUsd: number };
  const columns: Column<Counts>[] = [
    { key: "turns", label: t("analytics.columns.turns"), value: (row) => row.turns },
    { key: "requests", label: t("analytics.columns.requests"), value: (row) => row.requests },
    { key: "failures", label: t("analytics.columns.failures"), value: (row) => row.failures },
    { key: "tokensIn", label: t("analytics.columns.tokensIn"), value: (row) => row.tokensIn },
    { key: "tokensOut", label: t("analytics.columns.tokensOut"), value: (row) => row.tokensOut },
    { key: "cost", label: t("analytics.columns.cost"), value: (row) => row.costMicroUsd, format: formats.cost },
  ];
  return <Section title={t("analytics.ai.title")} description={t("analytics.ai.description")}>
    {query.data ? <>
      <CountTable caption={t("analytics.byDay")} head={[t("analytics.columns.day")]} rows={newestFirst(query.data.daily)} rowKey={(row) => row.day} label={(row) => [row.day]} columns={columns} totals />
      <CountTable caption={t("analytics.byAccount")} head={[t("analytics.columns.account")]} rows={query.data.accounts} rowKey={(row) => row.userId}
        label={(row) => [accountName(row.username, t("analytics.noUsername"))]} columns={columns} empty={t("analytics.noAccounts")} />
      <CountTable caption={t("analytics.byModel")} head={[t("analytics.columns.provider"), t("analytics.columns.model")]} rows={query.data.models}
        rowKey={(row) => `${row.provider}\n${row.model}`} label={(row) => [t(`analytics.providers.${row.provider}`), <code className={styles.model}>{row.model}</code>]}
        columns={columns} empty={t("analytics.noModels")} />
    </> : <SectionState query={query} />}
  </Section>;
}

function SpeechSection({ days }: { days: AdminAnalyticsRange }) {
  const { t } = useTranslation();
  const query = useQuery(speechQuery(days));
  type Counts = { requests: number; characters: number; cacheHits: number; azureCalls: number; azureCharacters: number };
  const columns: Column<Counts>[] = [
    { key: "requests", label: t("analytics.columns.speechRequests"), value: (row) => row.requests },
    { key: "characters", label: t("analytics.columns.characters"), value: (row) => row.characters },
    { key: "cacheHits", label: t("analytics.columns.cacheHits"), value: (row) => row.cacheHits },
    { key: "azureCalls", label: t("analytics.columns.azureCalls"), value: (row) => row.azureCalls },
    { key: "azureCharacters", label: t("analytics.columns.azureCharacters"), value: (row) => row.azureCharacters },
  ];
  return <Section title={t("analytics.speech.title")} description={t("analytics.speech.description")}>
    {query.data ? <>
      <CountTable caption={t("analytics.byDay")} head={[t("analytics.columns.day")]} rows={newestFirst(query.data.daily)} rowKey={(row) => row.day} label={(row) => [row.day]} columns={columns} totals />
      <CountTable caption={t("analytics.byAccount")} head={[t("analytics.columns.account")]} rows={query.data.accounts} rowKey={(row) => row.userId}
        label={(row) => [accountName(row.username, t("analytics.noUsername"))]} columns={columns} empty={t("analytics.noAccounts")} />
    </> : <SectionState query={query} />}
  </Section>;
}

function TimeSection({ days }: { days: AdminAnalyticsRange }) {
  const { t } = useTranslation();
  const formats = useFormats();
  const query = useQuery(timeQuery(days));
  type Counts = NonNullable<typeof query.data>["daily"][number] | NonNullable<typeof query.data>["accounts"][number];
  // The API counts seconds; the table shows whole minutes.
  const minutes = (seconds: number) => formats.number(Math.round(seconds / 60));
  const columns: Column<Counts>[] = [
    { key: "lesson", label: t("analytics.columns.timeLesson"), value: (row) => row.lesson, format: minutes },
    { key: "grammar", label: t("analytics.columns.timeGrammar"), value: (row) => row.grammar, format: minutes },
    { key: "practice", label: t("analytics.columns.timePractice"), value: (row) => row.practice, format: minutes },
    { key: "vocabulary", label: t("analytics.columns.timeVocabulary"), value: (row) => row.vocabulary, format: minutes },
    { key: "aiPractice", label: t("analytics.columns.timeAiPractice"), value: (row) => row.aiPractice, format: minutes },
    { key: "total", label: t("analytics.columns.timeTotal"), value: (row) => row.total, format: minutes },
  ];
  return <Section title={t("analytics.time.title")} description={t("analytics.time.description")}>
    {query.data ? <>
      <CountTable caption={t("analytics.byDay")} head={[t("analytics.columns.day")]} rows={newestFirst(query.data.daily)} rowKey={(row) => row.day} label={(row) => [row.day]} columns={columns} totals />
      <CountTable caption={t("analytics.byAccount")} head={[t("analytics.columns.account")]} rows={query.data.accounts} rowKey={(row) => row.userId}
        label={(row) => [accountName(row.username, t("analytics.noUsername"))]} columns={columns} empty={t("analytics.noAccounts")} />
    </> : <SectionState query={query} />}
  </Section>;
}

type SettingsDraft = { providers: AiProviderSetting[]; dailyTurnCap: string; dailySpeechCharCap: string };
const draftOf = (settings: AiSettings): SettingsDraft => ({
  providers: settings.providers.map((item) => ({ ...item })), dailyTurnCap: String(settings.dailyTurnCap), dailySpeechCharCap: String(settings.dailySpeechCharCap),
});

// Checks the draft before saving and returns the first problem's message key, or the settings to send. The API validates again.
export function checkAiSettingsDraft(draft: SettingsDraft): { error: string } | { settings: AiSettings } {
  if (!draft.providers.some((item) => item.enabled)) return { error: "noProvider" };
  if (draft.providers.some((item) => !aiModelIdSchema.safeParse(item.model).success)) return { error: "model" };
  const whole = (value: string, max: number) => /^\d+$/.test(value.trim()) && Number(value) <= max ? Number(value) : null;
  const dailyTurnCap = whole(draft.dailyTurnCap, AI_TURN_CAP_MAX); if (dailyTurnCap === null) return { error: "turnCap" };
  const dailySpeechCharCap = whole(draft.dailySpeechCharCap, AI_SPEECH_CHAR_CAP_MAX); if (dailySpeechCharCap === null) return { error: "speechCap" };
  const parsed = aiSettingsSchema.safeParse({ providers: draft.providers.map((item) => ({ ...item, model: item.model.trim() })), dailyTurnCap, dailySpeechCharCap });
  return parsed.success ? { settings: parsed.data } : { error: "generic" };
}

function AiSettingsForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery(aiSettingsQuery());
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { if (query.data) setDraft(draftOf(query.data)); }, [query.data]);
  const save = useMutation({
    mutationFn: (settings: AiSettings) => apiRequest("/api/admin/ai-settings", aiSettingsSchema, { method: "PUT", body: JSON.stringify(settings) }),
    onSuccess: (saved) => { queryClient.setQueryData(aiSettingsQuery().queryKey, saved); },
  });

  const section = (body: ReactNode) => <Section title={t("analytics.settings.title")} description={t("analytics.settings.description")}>{body}</Section>;
  if (!draft) return section(query.isError ? <SectionState query={query} /> : <LoadingState label={t("analytics.settings.loading")} />);

  const update = (next: SettingsDraft) => { setDraft(next); setProblem(null); save.reset(); };
  const updateProvider = (index: number, change: Partial<AiProviderSetting>) =>
    update({ ...draft, providers: draft.providers.map((item, current) => current === index ? { ...item, ...change } : item) });
  const move = (index: number, offset: -1 | 1) => {
    const providers = [...draft.providers];
    const [item] = providers.splice(index, 1);
    providers.splice(index + offset, 0, item!);
    update({ ...draft, providers });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkAiSettingsDraft(draft);
    if ("error" in checked) { setProblem(checked.error); return; }
    save.mutate(checked.settings);
  };
  const apiProblem = save.error ? (save.error instanceof ApiError && ["AI_SETTINGS_INVALID", "SUPERUSER_REQUIRED"].includes(save.error.code) ? save.error.code : "generic") : null;
  const message = problem ?? apiProblem;

  return section(<form className={styles.form} onSubmit={submit} noValidate>
    <fieldset className={styles.fieldset}>
      <legend className={styles.tableTitle}>{t("analytics.settings.order")}</legend>
      <p className={styles.muted}>{t("analytics.settings.modelHelp")}</p>
      <ol className={styles.providers}>
        {draft.providers.map((item, index) => {
          const provider = t(`analytics.providers.${item.provider}`);
          return <li key={item.provider} className={styles.provider}>
            <span className={styles.position}>{index + 1}</span>
            <strong className={styles.providerName}>{provider}</strong>
            <CheckboxField label={t("analytics.settings.enabled", { provider })} checked={item.enabled} onChange={(event) => updateProvider(index, { enabled: event.currentTarget.checked })} />
            <TextField className={styles.modelField} label={t("analytics.settings.model", { provider })} value={item.model} maxLength={200}
              onChange={(event) => updateProvider(index, { model: event.currentTarget.value })} />
            <span className={styles.moves}>
              <IconButton label={t("analytics.settings.moveUp", { provider })} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></IconButton>
              <IconButton label={t("analytics.settings.moveDown", { provider })} disabled={index === draft.providers.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></IconButton>
            </span>
          </li>;
        })}
      </ol>
    </fieldset>
    <div className={styles.caps}>
      <TextField label={t("analytics.settings.turnCap")} description={t("analytics.settings.turnCapHelp")} inputMode="numeric" value={draft.dailyTurnCap}
        onChange={(event) => update({ ...draft, dailyTurnCap: event.currentTarget.value })} />
      <TextField label={t("analytics.settings.speechCap")} description={t("analytics.settings.speechCapHelp")} inputMode="numeric" value={draft.dailySpeechCharCap}
        onChange={(event) => update({ ...draft, dailySpeechCharCap: event.currentTarget.value })} />
    </div>
    <div className={styles.actions}>
      <Button type="submit" loading={save.isPending}>{t("analytics.settings.save")}</Button>
      {message && <p className={styles.error} role="alert">{t(`analytics.settings.errors.${message}`)}</p>}
      {save.isSuccess && <p className={styles.success}>{t("analytics.settings.saved")}</p>}
    </div>
  </form>);
}

export function AdminAnalyticsPage({ groupId, days, onDays }: { groupId: string; days: AdminAnalyticsRange; onDays: (days: AdminAnalyticsRange) => void }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("analytics.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const superuser = session.data.user.isSuperuser === true;
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.page}>
      <PageHeader eyebrow={<LabelChip>{t("analytics.eyebrow")}</LabelChip>} title={t("analytics.title")} intro={t("analytics.intro")}
        actions={superuser && <SelectField className={styles.range} label={t("analytics.range")} allowDeselect={false} value={String(days)}
          data={ADMIN_ANALYTICS_RANGES.map((value) => ({ value: String(value), label: t("analytics.rangeOption", { count: value }) }))}
          onChange={(value) => { const next = validateAnalyticsSearch({ days: value }).days; if (next) onDays(next); }} />} />
      {superuser ? <>
        <LearningSection days={days} />
        <AiSection days={days} />
        <SpeechSection days={days} />
        <TimeSection days={days} />
        <AiSettingsForm />
      </> : <ErrorState title={t("analytics.unavailableTitle")}>{t("analytics.unavailableBody")}</ErrorState>}
    </div>
  </GroupFrame>;
}
