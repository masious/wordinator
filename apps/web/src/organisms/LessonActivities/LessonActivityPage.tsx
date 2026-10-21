import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import {
  activityRunPatchResponseSchema, lessonActivityFocus,
  type ActivityDescriptor, type ActivityMetricChange, type ActivityType, type LessonActivityRun, type LessonActivityViewPayload,
} from "@wordinator/contracts/lesson-activities";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Button, ErrorState, LoadingState, Surface, TextAreaField } from "../../ui";
import {
  ApiError, apiRequest, lessonActivitiesQueryOptions, lessonActivityEndpoint, lessonActivityOpen, lessonActivityStatusQueryOptions,
  type LessonActivityOpenResponse,
} from "../../api";
import { useLearningClaim } from "../../learningTime";
import { draftKey, readDraft, useAnswerAttempt, writeDraft, type AnswerInput } from "./activityAnswers";
import { ActivityCompletion, lessonTarget } from "./ActivityCompletion";
import { suggestedActivities } from "./activitySuggestions";
import { GuidedGrammarActivity } from "./GuidedGrammarActivity";
import { ReadAloudActivity } from "./ReadAloudActivity";
import { RoleplayActivity } from "./RoleplayActivity";
import { SpeakFromEnglishActivity } from "./SpeakFromEnglishActivity";
import { SummaryActivity } from "./SummaryActivity";
import styles from "./LessonActivity.module.css";

export type LessonActivityPageProps = {
  groupId: string; courseId: string; courseSlug: string; lessonId: string; lessonSlug: string; lessonTitle: string; accountId: string;
  // The library language (`nl` or `de`), for the microphone of role-play.
  language?: string | undefined;
  // Null when the URL names no known activity type; the page then shows the unavailable state.
  type: ActivityType | null; sourceId: string; archived: boolean;
};

type ReadyActivity = Extract<LessonActivityOpenResponse, { status: "ready" }>;
type Payload = LessonActivityViewPayload;
type Question = Extract<Payload, { type: "tricky_grammar" }>["questions"][number];
type CueMode = LessonActivityRun["cueMode"];
type RunAction = { action: "set_cue_mode"; cueMode: CueMode } | { action: "continue"; expectedCursor: number } | { action: "complete" } | { action: "restart" };

// How long a generation may take before the page offers Retry instead of polling on (docs/lesson-activities.md#shared-cached-content).
export const GENERATION_WAIT_MS = 60_000;

export function LessonActivityPage(props: LessonActivityPageProps) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const descriptorsOptions = lessonActivitiesQueryOptions(props.groupId, props.courseId, props.lessonId);
  const descriptors = useQuery(descriptorsOptions);
  const type = props.type;
  const descriptor = type ? descriptors.data?.descriptors.find((entry) => entry.sourceId === props.sourceId && entry.activityTypes.includes(type)) : undefined;
  const fingerprint = descriptor?.fingerprint;

  const [opened, setOpened] = useState<LessonActivityOpenResponse | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const [generationTimedOut, setGenerationTimedOut] = useState(false);
  const open = async () => {
    if (!descriptor || !type) return;
    setOpenFailed(false); setGenerationTimedOut(false);
    try {
      setOpened(await lessonActivityOpen(props.groupId, props.courseId, props.lessonId, { sourceId: props.sourceId, type, expectedFingerprint: descriptor.fingerprint }));
    } catch (error) {
      // The section changed since the descriptors loaded: refresh them, which opens again with the new fingerprint.
      if (error instanceof ApiError && error.code === "SOURCE_CHANGED") void client.invalidateQueries({ queryKey: descriptorsOptions.queryKey });
      setOpenFailed(true);
    }
  };
  useEffect(() => { void open(); }, [fingerprint]);
  // A generation that runs past the wait stops polling and shows the timeout state; Retry opens the activity again.
  useEffect(() => {
    if (opened?.status !== "generating") return;
    const timer = window.setTimeout(() => setGenerationTimedOut(true), GENERATION_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [opened]);

  const pendingId = opened?.status === "generating" ? opened.activityId : "";
  const status = useQuery({
    ...lessonActivityStatusQueryOptions(props.groupId, props.courseId, props.lessonId, pendingId), enabled: Boolean(pendingId),
    refetchInterval: (query) => query.state.data?.status === "generating" && !generationTimedOut ? Math.min(query.state.data.retryAfterMs, 4000) : false,
  });
  const statusReady = status.data?.status === "ready" ? status.data : null;
  const ready: ReadyActivity | null = opened?.status === "ready" ? opened : statusReady;
  const failed = openFailed || status.isError || status.data?.status === "failed";

  // The server's run is authoritative when the activity loads (so a refresh resumes at run.cursor). Our own updates replace it
  // with the run each successful PATCH returns.
  const [runOverride, setRunOverride] = useState<{ runId: string; run: LessonActivityRun } | null>(null);
  const run = ready ? (runOverride?.runId === ready.run.id ? runOverride.run : ready.run) : null;
  const activityId = ready?.activity.id ?? "";
  const endpoint = lessonActivityEndpoint(props.groupId, props.courseId, props.lessonId, activityId);
  const payload = ready?.activity.payload;

  // The metric changes of the completion that just happened; absent when a finished run is revisited.
  const [completionMetrics, setCompletionMetrics] = useState<readonly ActivityMetricChange[] | undefined>(undefined);
  const patchRun = useMutation({
    mutationFn: (input: RunAction) => apiRequest(`${endpoint}/run`, activityRunPatchResponseSchema, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: ({ run: next, metrics }, input) => {
      setRunOverride({ runId: next.id, run: next });
      setCompletionMetrics(input.action === "complete" ? metrics : undefined);
      // Completing or restarting changes the Done marks on the lesson's suggestions, so the list reloads for the lesson page.
      if (input.action === "complete" || input.action === "restart") void client.invalidateQueries({ queryKey: descriptorsOptions.queryKey });
    },
  });

  useLearningClaim(ready && run && payload && !ready.ephemeral && !props.archived && run.status !== "completed"
    ? { groupId: props.groupId, target: () => ({ activity: "lesson_activity", courseId: props.courseId, lessonId: props.lessonId, activityId: ready.activity.id, focus: lessonActivityFocus(payload.type) }) }
    : null);

  const items: Question[] = payload?.type === "story_comprehension" || payload?.type === "tricky_grammar" || payload?.type === "mixed_practice" ? payload.questions : [];
  const learnerTurns = payload?.type === "roleplay" ? payload.turns.filter((turn) => turn.isLearner) : [];
  const total = payload?.type === "roleplay" ? learnerTurns.length
    : payload?.type === "guided_grammar" ? payload.steps.length
      : payload?.type === "read_aloud" || payload?.type === "speak_from_english" ? payload.lines.length : items.length;
  const cursor = run?.cursor ?? 0;
  const completed = run?.status === "completed";
  const keyFor = (itemId: string) => run && ready ? draftKey(props.accountId, ready.activity.id, run.id, itemId) : null;
  const advance = () => {
    if (!run) return;
    const next = run.cursor + 1;
    patchRun.mutate(next >= total ? { action: "complete" } : { action: "continue", expectedCursor: run.cursor });
  };

  const back = <Link className={styles.back} {...lessonTarget(props, descriptor)}><ArrowLeft aria-hidden="true" />{t("lessonActivities.backToSection", { section: descriptor?.sourceLabel ?? props.lessonTitle })}</Link>;
  if (!type) return <main className={styles.page}>{back}<ErrorState title={t("lessonActivities.unavailable")} /></main>;
  if (descriptors.isError) return <main className={styles.page}>{back}<ErrorState title={t("lessonActivities.unavailable")} action={<Button onClick={() => void descriptors.refetch()}>{t("common.retry")}</Button>} /></main>;
  if (descriptors.isPending) return <main className={styles.page}>{back}<LoadingState label={t("lessonActivities.loadingSources")} /></main>;
  if (!descriptor) return <main className={styles.page}>{back}<ErrorState title={t("lessonActivities.unavailable")} /></main>;
  if (!ready) return <main className={styles.page}>{back}
    {failed
      ? <ErrorState title={t("lessonActivities.openFailed")} action={<Button onClick={() => { setOpened(null); void open(); }}>{t("common.retry")}</Button>} />
      : generationTimedOut
        ? <ErrorState title={t("lessonActivities.generationTimedOut")} action={<Button onClick={() => { setOpened(null); void open(); }}>{t("common.retry")}</Button>} />
        : <Surface className={styles.panel}><div role="status"><p>{t("lessonActivities.preparing")}</p><LoadingState label={t("lessonActivities.preparing")} /></div>
        <div className={styles.preparationSteps}>
          <details className={styles.preparation}><summary>{t(opened?.status === "generating" ? "lessonActivities.openedStep" : "lessonActivities.openingStep")}</summary>
            <p>{t("lessonActivities.preparingFor", { activity: t(`lessonActivities.types.${type}`), section: descriptor.sourceLabel })}</p>
          </details>
          {opened?.status === "generating" && <details className={styles.preparation}><summary>{t("lessonActivities.generatingStep")}</summary>
            <p>{t("lessonActivities.waitingForGeneration")}</p>
          </details>}
        </div>
        {opened?.status === "generating" && <Button variant="quiet" onClick={() => void status.refetch()}>{t("lessonActivities.checkAgain")}</Button>}</Surface>}
  </main>;

  const restart = () => patchRun.mutate({ action: "restart" });
  // Skip this activity: a plain link to the first suggestion that is neither this activity nor already done, else the lesson. It sends nothing.
  const skipTo = suggestedActivities(descriptors.data.descriptors, descriptor, payload?.type === "guided_grammar" ? payload.followUps : undefined)
    .find(({ source, type: suggested }) => !(source.sourceId === descriptor.sourceId && suggested === type)
      && !descriptors.data.completed.some((done) => done.sourceId === source.sourceId && done.type === suggested));
  const skipLabel = skipTo ? `${t(`lessonActivities.types.${skipTo.type}`)} · ${skipTo.source.sourceLabel}` : t("lessonActivities.backToLesson");
  const skipProps = skipTo
    ? { to: "/courses/$courseSlug/lessons/$lessonSlug/activities/$sourceId/$activityType" as const,
      params: { courseSlug: props.courseSlug, lessonSlug: props.lessonSlug, sourceId: skipTo.source.sourceId, activityType: skipTo.type } }
    : lessonTarget(props, descriptor);
  return <main className={styles.page}>{back}
    <header className={styles.header}>
      <span className={styles.eyebrow}>{props.lessonTitle} · {ready.activity.sourceLabel}</span>
      <h1 className={styles.title}>{t(`lessonActivities.types.${ready.activity.payload.type}`)}</h1>
      {total > 0 && <ProgressMeter value={completed ? 100 : (100 * cursor) / total} label={t("lessonActivities.progress", { current: Math.min(cursor + 1, total), total })} showLabel />}
    </header>
    {(props.archived || ready.ephemeral) && <Surface tone="quiet"><p>{t("lessonActivities.archivedUnsaved")}</p></Surface>}
    {completed
      ? <ActivityCompletion courseSlug={props.courseSlug} lessonSlug={props.lessonSlug} lessonLabel={props.lessonTitle} descriptors={descriptors.data.descriptors}
        descriptor={descriptor} completed={descriptors.data.completed} followUps={payload?.type === "guided_grammar" ? payload.followUps : undefined} metrics={completionMetrics}
        restarting={patchRun.isPending} onRestart={restart} />
      : payload?.type === "story_summary" ? <SummaryActivity payload={payload} completing={patchRun.isPending} onComplete={() => patchRun.mutate({ action: "complete" })} />
      : payload?.type === "guided_grammar" && run ? <GuidedGrammarActivity endpoint={endpoint} runId={run.id} steps={payload.steps} cursor={cursor}
        advancing={patchRun.isPending} onContinue={() => advance()} onComplete={() => patchRun.mutate({ action: "complete" })} />
      : (payload?.type === "read_aloud" || payload?.type === "speak_from_english") && run ? (() => {
        const common = { groupId: props.groupId, language: props.language, endpoint, runId: run.id, cursor, advancing: patchRun.isPending, onContinue: () => advance(),
          backToLesson: <Link className={styles.back} {...lessonTarget(props, descriptor)}>{t("lessonActivities.backToLesson")}</Link> };
        return payload.type === "read_aloud" ? <ReadAloudActivity {...common} lines={payload.lines} /> : <SpeakFromEnglishActivity {...common} lines={payload.lines} />;
      })()
      : payload?.type === "grammar_explanation" ? <Surface className={styles.panel}><h2>{t("lessonActivities.explanation")}</h2>
        {payload.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {payload.examples.map((example, index) => <div className={styles.turn} key={index}><strong lang="nl">{example.dutch}</strong><p>{example.english}</p></div>)}
        <div className={styles.actions}><Button loading={patchRun.isPending} onClick={() => patchRun.mutate({ action: "complete" })}>{t("lessonActivities.done")}</Button></div></Surface>
      : payload?.type === "roleplay" && run ? <RoleplayActivity groupId={props.groupId} language={props.language} endpoint={endpoint} runId={run.id} turns={payload.turns}
        cursor={cursor} cueMode={run.cueMode} keyFor={keyFor} advancing={patchRun.isPending} onCueMode={(cueMode) => patchRun.mutate({ action: "set_cue_mode", cueMode })}
        onContinue={() => advance()} backToLesson={<Link className={styles.back} {...lessonTarget(props, descriptor)}>{t("lessonActivities.backToLesson")}</Link>} />
      : items[cursor] && run ? <ActivityItem key={items[cursor].id} endpoint={endpoint} runId={run.id} item={items[cursor]} draftKey={items[cursor].kind === "fill_in" ? keyFor(items[cursor].id) : null}
        last={cursor + 1 >= items.length} advancing={patchRun.isPending} onContinue={() => advance()} />
      : <Surface className={styles.panel}><p>{t("lessonActivities.unavailable")}</p><Button onClick={() => { setOpened(null); void open(); }}>{t("common.retry")}</Button></Surface>}
    {patchRun.isError && <p className={styles.alert} role="alert">{t("lessonActivities.saveFailed")}</p>}
    {!completed && <div className={styles.skipRow}>
      <Link className={styles.back} {...skipProps} aria-label={t("lessonActivities.skipActivityTo", { destination: skipLabel })}>{t("lessonActivities.skipActivity")}</Link>
    </div>}
  </main>;
}

type ActivityItemProps = { endpoint: string; runId: string; item: Question; draftKey: string | null; last: boolean; advancing: boolean; onContinue: () => void };
function ActivityItem({ endpoint, runId, item, draftKey, last, advancing, onContinue }: ActivityItemProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => readDraft(draftKey));
  const attempt = useAnswerAttempt(endpoint, runId, item.id, () => writeDraft(draftKey, ""));
  const [selected, setSelected] = useState("");
  const [order, setOrder] = useState<number[]>([]);
  const result = attempt.result;
  const locked = result !== null;
  const input: AnswerInput | null = item.kind === "choice" ? (selected ? { kind: "choice", optionId: selected } : null)
    : item.kind === "fill_in" ? (draft.trim() ? { kind: "text", text: draft } : null)
      : (order.length === item.tokens.length ? { kind: "word_order", order } : null);
  const save = (value: string) => { setDraft(value); writeDraft(draftKey, value); };
  const retry = () => { attempt.retry(); setSelected(""); setOrder([]); save(""); };

  return <Surface className={styles.panel}>
    <p className={styles.prompt}>{item.prompt}</p>
    {item.kind === "choice" && <div className={styles.choices} role="group" aria-label={item.prompt}>
      {item.options.map((option) => <Button key={option.id} variant={selected === option.id ? "primary" : "secondary"} className={styles.choice}
        aria-pressed={selected === option.id} disabled={locked} onClick={() => setSelected(option.id)}>{option.text}</Button>)}
    </div>}
    {item.kind === "fill_in" && <TextAreaField label={t("lessonActivities.answerLabel")} value={draft} disabled={locked} onChange={(event) => save(event.currentTarget.value)}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing && input && !attempt.pending) { event.preventDefault(); attempt.check(input); } }}
      autosize minRows={2} />}
    {item.kind === "word_order" && <WordOrder tokens={item.tokens} order={order} disabled={locked} onChange={setOrder} />}
    {result
      ? <div className={styles.feedback} role="status">
        <strong>{result.correct ? t("lessonActivities.correct") : t("lessonActivities.tryAgain")}</strong>
        {result.reference && <p>{result.reference}</p>}
        {result.explanation && <p>{result.explanation}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={retry}>{t("lessonActivities.retry")}</Button>
          <Button loading={advancing} disabled={advancing} onClick={onContinue}>{last ? t("lessonActivities.finish") : t("lessonActivities.continue")}</Button>
        </div>
      </div>
      : <div className={styles.actions}><Button loading={attempt.pending} disabled={!input || attempt.pending} onClick={() => { if (input) attempt.check(input); }}>{t("lessonActivities.checkAnswer")}</Button></div>}
    {attempt.error && <p className={styles.alert} role="alert">{t("lessonActivities.answerFailed")}</p>}
  </Surface>;
}

// Word order: tap the words in sequence to build the answer; tap a word in the answer to take it back; Reset clears the row. Every
// control is a button, so the keyboard reaches each word.
function WordOrder({ tokens, order, disabled, onChange }: { tokens: readonly string[]; order: readonly number[]; disabled: boolean; onChange: (order: number[]) => void }) {
  const { t } = useTranslation();
  const placed = new Set(order);
  return <div className={styles.wordOrder}>
    <p className={styles.hint}>{t("lessonActivities.wordOrderHint")}</p>
    <ol className={styles.answerRow} aria-label={t("lessonActivities.wordOrderAnswer")}>
      {order.length === 0 && <li className={styles.placeholder}>{t("lessonActivities.wordOrderEmpty")}</li>}
      {order.map((tokenIndex, position) => <li key={`${position}-${tokenIndex}`}>
        <button type="button" className={styles.token} disabled={disabled} aria-label={t("lessonActivities.wordOrderRemove", { word: tokens[tokenIndex] ?? "" })}
          onClick={() => onChange(order.filter((_, index) => index !== position))}>{tokens[tokenIndex]}</button>
      </li>)}
    </ol>
    <ul className={styles.bank} aria-label={t("lessonActivities.wordOrderBank")}>
      {tokens.map((token, index) => <li key={index}>
        <button type="button" className={styles.token} data-used={placed.has(index) || undefined} aria-disabled={placed.has(index) || disabled || undefined}
          onClick={() => { if (!placed.has(index) && !disabled) onChange([...order, index]); }}>{token}</button>
      </li>)}
    </ul>
    <div className={styles.actions}><Button variant="quiet" disabled={disabled || order.length === 0} onClick={() => onChange([])}>{t("lessonActivities.reset")}</Button></div>
  </div>;
}
