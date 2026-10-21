import { Switch } from "@mantine/core";
import { useMutation, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AI_SPEECH_CHAR_CAP_MAX, AI_TURN_CAP_MAX, aiModelIdSchema, aiProvidersResponseSchema, aiProviderTestResponseSchema, aiSettingsSchema,
  type AiProvider, type AiProviderSetting, type AiProviderTestResponse, type AiSettings,
} from "@wordinator/contracts/ai";
import { ApiError, apiRequest, sessionQueryOptions } from "../api";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { Button, ErrorState, IconButton, LabelChip, LoadingState, PageHeader, SectionHeader, Surface, TextField } from "../ui";
import styles from "./AdminAiPage.module.css";

// The superuser's AI providers and models page (docs/settings-and-administration.md#ai-providers): the provider order, the enabled
// switch and model per provider, the credentials status, a connection test per provider, and the daily caps. Other accounts get
// a not-available state and no request is made; the API refuses them anyway.

const aiSettingsQuery = () => queryOptions({
  queryKey: ["admin-ai-settings"] as const,
  queryFn: () => apiRequest("/api/admin/ai-settings", aiSettingsSchema),
});
const aiProvidersQuery = () => queryOptions({
  queryKey: ["admin-ai-providers"] as const,
  queryFn: () => apiRequest("/api/admin/ai-providers", aiProvidersResponseSchema),
});
const testConnection = (item: AiProviderSetting) => apiRequest("/api/admin/ai-providers/test", aiProviderTestResponseSchema, {
  method: "POST", body: JSON.stringify({ provider: item.provider, model: item.model.trim() }),
});

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

// The last test of a provider's row. A result is kept until its model changes; the test never changes the saved settings.
type TestOutcome = { kind: "result"; result: AiProviderTestResponse } | { kind: "invalid" } | { kind: "error" };
type Credentials = { state: "checking" | "unknown" | "configured" | "missing"; host: string | null };

function outcomeCopy(t: (key: string, options?: Record<string, unknown>) => string, outcome: TestOutcome): string {
  if (outcome.kind === "invalid") return t("aiAdmin.test.invalidModel");
  if (outcome.kind === "error") return t("aiAdmin.test.error");
  const { ok, status, latencyMs, message } = outcome.result;
  if (ok) return message ? t("aiAdmin.test.reply", { latency: latencyMs, status, message }) : t("aiAdmin.test.connected", { latency: latencyMs, status });
  if (status === null) return t("aiAdmin.test.noAnswer", { latency: latencyMs, message }).trim();
  return t("aiAdmin.test.refused", { latency: latencyMs, status, message }).trim();
}

function ProviderRow({ item, index, total, credentials, outcome, testing, testLocked, onChange, onMove, onTest }: {
  item: AiProviderSetting; index: number; total: number; credentials: Credentials; outcome: TestOutcome | undefined; testing: boolean; testLocked: boolean;
  onChange: (change: Partial<AiProviderSetting>) => void; onMove: (offset: -1 | 1) => void; onTest: () => void;
}) {
  const { t } = useTranslation();
  const name = t(`analytics.providers.${item.provider}`);
  const nameId = `ai-provider-${item.provider}`;
  const badge = credentials.state === "configured" ? t("aiAdmin.credentials.configured")
    : credentials.state === "missing" ? t("aiAdmin.credentials.missing")
      : credentials.state === "checking" ? t("aiAdmin.credentials.checking") : t("aiAdmin.credentials.unknown");
  const tone = credentials.state === "configured" ? "success" : credentials.state === "missing" ? "warm" : "default";
  const state = testing ? "pending" : outcome?.kind === "result" ? (outcome.result.ok ? "ok" : "failed") : outcome ? "failed" : "idle";
  return <li className={styles.provider} aria-labelledby={nameId}>
    <span className={styles.position}>{index + 1}</span>
    <div className={styles.identity}>
      <strong id={nameId} className={styles.providerName}>{name}</strong>
      <div className={styles.badges}>
        <LabelChip tone={tone}>{badge}</LabelChip>
        {credentials.host && <span className={styles.host}>{t("aiAdmin.endpoint", { host: credentials.host })}</span>}
      </div>
    </div>
    <Switch className={styles.enabled} aria-label={t("aiAdmin.settings.enabled", { provider: name })} label={t("aiAdmin.settings.switchLabel")}
      checked={item.enabled} onChange={(event) => onChange({ enabled: event.currentTarget.checked })} />
    <TextField className={styles.modelField} label={t("aiAdmin.settings.model", { provider: name })} value={item.model} maxLength={200}
      onChange={(event) => onChange({ model: event.currentTarget.value })} />
    <span className={styles.moves}>
      <IconButton label={t("aiAdmin.settings.moveUp", { provider: name })} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={16} aria-hidden="true" /></IconButton>
      <IconButton label={t("aiAdmin.settings.moveDown", { provider: name })} disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={16} aria-hidden="true" /></IconButton>
    </span>
    <div className={styles.test}>
      <div className={styles.testRow}>
        <Button variant="secondary" loading={testing} disabled={testLocked} aria-describedby={`${nameId}-help`} onClick={onTest}>{t("aiAdmin.test.button")}</Button>
        <span id={`${nameId}-help`} className={styles.muted}>{t("aiAdmin.test.help")}</span>
      </div>
      <p className={styles.outcome} data-state={state} aria-live="polite">
        {testing ? t("aiAdmin.test.testing", { provider: name }) : outcome ? outcomeCopy(t, outcome) : null}
      </p>
    </div>
  </li>;
}

function AiSettingsForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery(aiSettingsQuery());
  const statuses = useQuery(aiProvidersQuery());
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Partial<Record<AiProvider, TestOutcome>>>({});
  useEffect(() => { if (query.data) setDraft(draftOf(query.data)); }, [query.data]);
  const save = useMutation({
    mutationFn: (settings: AiSettings) => apiRequest("/api/admin/ai-settings", aiSettingsSchema, { method: "PUT", body: JSON.stringify(settings) }),
    onSuccess: (saved) => { queryClient.setQueryData(aiSettingsQuery().queryKey, saved); },
  });
  const test = useMutation({ mutationFn: testConnection });

  const section = (body: ReactNode) => <Surface className={styles.section}><SectionHeader title={t("aiAdmin.settings.title")} description={t("aiAdmin.settings.description")} />{body}</Surface>;
  if (!draft) return section(query.isError ? <ErrorState title={t("analytics.sectionUnavailable")}><Button onClick={() => query.refetch()}>{t("common.retry")}</Button></ErrorState> : <LoadingState label={t("aiAdmin.settings.loading")} />);

  const update = (next: SettingsDraft) => { setDraft(next); setProblem(null); save.reset(); };
  const setOutcome = (provider: AiProvider, outcome: TestOutcome) => setOutcomes((current) => ({ ...current, [provider]: outcome }));
  const updateProvider = (index: number, change: Partial<AiProviderSetting>) => {
    const provider = draft.providers[index]!.provider;
    // A changed model makes an earlier test of that row out of date.
    if ("model" in change) setOutcomes((current) => ({ ...current, [provider]: undefined }));
    update({ ...draft, providers: draft.providers.map((item, current) => current === index ? { ...item, ...change } : item) });
  };
  const move = (index: number, offset: -1 | 1) => {
    const providers = [...draft.providers];
    const [item] = providers.splice(index, 1);
    providers.splice(index + offset, 0, item!);
    update({ ...draft, providers });
  };
  const runTest = (item: AiProviderSetting) => {
    if (!aiModelIdSchema.safeParse(item.model).success) { setOutcome(item.provider, { kind: "invalid" }); return; }
    test.mutate(item, {
      onSuccess: (result) => setOutcome(item.provider, { kind: "result", result }),
      onError: () => setOutcome(item.provider, { kind: "error" }),
    });
  };
  const credentialsOf = (provider: AiProvider): Credentials => {
    if (statuses.isPending) return { state: "checking", host: null };
    const status = statuses.data?.providers.find((entry) => entry.provider === provider);
    if (!status) return { state: "unknown", host: null };
    return { state: status.credentialsPresent ? "configured" : "missing", host: status.endpointHost };
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
      <legend className={styles.legend}>{t("aiAdmin.settings.order")}</legend>
      <p className={styles.muted}>{t("aiAdmin.settings.modelHelp")}</p>
      <ol className={styles.providers}>
        {draft.providers.map((item, index) => <ProviderRow key={item.provider} item={item} index={index} total={draft.providers.length}
          credentials={credentialsOf(item.provider)} outcome={outcomes[item.provider]}
          testing={test.isPending && test.variables?.provider === item.provider} testLocked={test.isPending}
          onChange={(change) => updateProvider(index, change)} onMove={(offset) => move(index, offset)} onTest={() => runTest(item)} />)}
      </ol>
    </fieldset>
    <div className={styles.caps}>
      <TextField label={t("aiAdmin.settings.turnCap")} description={t("aiAdmin.settings.turnCapHelp")} inputMode="numeric" value={draft.dailyTurnCap}
        onChange={(event) => update({ ...draft, dailyTurnCap: event.currentTarget.value })} />
      <TextField label={t("aiAdmin.settings.speechCap")} description={t("aiAdmin.settings.speechCapHelp")} inputMode="numeric" value={draft.dailySpeechCharCap}
        onChange={(event) => update({ ...draft, dailySpeechCharCap: event.currentTarget.value })} />
    </div>
    <div className={styles.actions}>
      <Button type="submit" loading={save.isPending}>{t("aiAdmin.settings.save")}</Button>
      {message && <p className={styles.error} role="alert">{t(`aiAdmin.settings.errors.${message}`)}</p>}
      {save.isSuccess && <p className={styles.success}>{t("aiAdmin.settings.saved")}</p>}
    </div>
  </form>);
}

export function AdminAiPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("aiAdmin.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const superuser = session.data.user.isSuperuser === true;
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.page}>
      <PageHeader eyebrow={<LabelChip>{t("aiAdmin.eyebrow")}</LabelChip>} title={t("aiAdmin.title")} intro={t("aiAdmin.intro")}
        actions={superuser && <Link className={styles.backLink} to="/admin/analytics"><ArrowLeft size={16} aria-hidden="true" />{t("aiAdmin.back")}</Link>} />
      {superuser ? <AiSettingsForm /> : <ErrorState title={t("aiAdmin.unavailableTitle")}>{t("aiAdmin.unavailableBody")}</ErrorState>}
    </div>
  </GroupFrame>;
}
