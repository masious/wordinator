import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Mic, Send } from "lucide-react";
import { z } from "zod";
import { activityAnswerResponseSchema, activityRunPatchResponseSchema, type ActivityDescriptor, type ActivityType } from "@wordinator/contracts/lesson-activities";
import { Button, ErrorState, LoadingState, ProgressMeter, Surface, TextAreaField } from "../../ui";
import { apiRequest, lessonActivitiesQueryOptions, lessonActivityEndpoint, lessonActivityOpen, lessonActivityStatusQueryOptions } from "../../api";
import { useLearningClaim } from "../../learningTime";
import styles from "./LessonActivity.module.css";

type Props = { groupId: string; courseId: string; courseSlug: string; lessonId: string; lessonSlug: string; lessonTitle: string; accountId: string; type: ActivityType; sourceId: string; archived: boolean };
type ActivityReady = { status: "ready"; activity: { id: string; sourceLabel: string; payload: { type: ActivityType; [key: string]: unknown } }; run: { id: string; cursor: number; status: "active" | "completed"; cueMode: "english" | "dutch" }; ephemeral?: boolean };
type OpenState = { status: "generating"; activityId: string; retryAfterMs: number } | ActivityReady;
const nonce = () => crypto.randomUUID();
const draftKey = (accountId: string, activityId: string, runId: string, itemId: string) => `wordinator:lesson-activity:v1:${accountId}:${activityId}:${runId}:${itemId}`;
const lessonHref = (props: Props, descriptor?: ActivityDescriptor) => ({ to: "/courses/$courseSlug/lessons/$lessonSlug" as const, params: { courseSlug: props.courseSlug, lessonSlug: props.lessonSlug }, hash: descriptor?.returnHeadingId ?? undefined });

export function LessonActivityPage(props: Props) {
  const { t } = useTranslation(); const client = useQueryClient();
  const descriptors = useQuery({ ...lessonActivitiesQueryOptions(props.groupId, props.courseId, props.lessonId), enabled: !props.archived });
  const descriptor = descriptors.data?.descriptors.find((entry) => entry.sourceId === props.sourceId && entry.activityTypes.includes(props.type));
  const [opened, setOpened] = useState<OpenState | null>(null); const [openError, setOpenError] = useState<Error | null>(null);
  const open = async () => {
    if (!descriptor) return;
    setOpenError(null);
    try {
      const response = await lessonActivityOpen(props.groupId, props.courseId, props.lessonId, { sourceId: props.sourceId, type: props.type, expectedFingerprint: descriptor.fingerprint });
      setOpened(response);
      if (response.status === "ready") await client.invalidateQueries({ queryKey: ["lesson-activity", props.groupId, props.courseId, props.lessonId, response.activity.id] });
    } catch (error) { setOpenError(error instanceof Error ? error : new Error("Could not open activity")); }
  };
  useEffect(() => { if (descriptor) void open(); }, [descriptor?.fingerprint]);
  const pendingId = opened?.status === "generating" ? opened.activityId : "";
  const status = useQuery({ ...lessonActivityStatusQueryOptions(props.groupId, props.courseId, props.lessonId, pendingId), enabled: Boolean(pendingId), refetchInterval: (query) => query.state.data?.status === "generating" ? Math.min(query.state.data.retryAfterMs, 4000) : false });
  const ready = opened?.status === "ready" ? opened : status.data?.status === "ready" ? status.data as ActivityReady : null;
  const [cursor, setCursor] = useState(0); const [answer, setAnswer] = useState(""); const [selected, setSelected] = useState(""); const [feedback, setFeedback] = useState<{ correct: boolean; reference: string | null; explanation: string | null } | null>(null);
  const [language, setLanguage] = useState<"english" | "dutch">("english"); const [started, setStarted] = useState(false); const [done, setDone] = useState(false);
  const [inputMode, setInputMode] = useState<"typed" | "spoken">("typed");
  const claimFocus = props.type === "roleplay" ? "speaking" : props.type.startsWith("story_") ? "reading" : "grammar";
  useLearningClaim(ready && !done && ready.run.status !== "completed" && !ready.ephemeral && ready.status === "ready" && opened?.status !== "generating"
    ? { groupId: props.groupId, target: () => ({ activity: "lesson_activity", courseId: props.courseId, lessonId: props.lessonId, activityId: ready.activity.id, focus: claimFocus }) } : null);
  const payload = ready?.activity.payload;
  const questions = payload?.type === "story_comprehension" || payload?.type === "tricky_grammar" || payload?.type === "mixed_practice" ? payload.questions
    : payload?.type === "quick_grammar" ? [payload.question] : [];
  const roleTurns = payload?.type === "roleplay" ? payload.turns : [];
  const learnerTurns = roleTurns.filter((turn) => turn.isLearner);
  const activeQuestion = questions[cursor];
  const activeTurn = learnerTurns[cursor];
  const currentItemId = activeQuestion?.id ?? activeTurn?.id ?? (cursor === 0 ? "reading" : "");
  useEffect(() => {
    if (!ready || !currentItemId) return;
    const saved = window.localStorage.getItem(draftKey(props.accountId, ready.activity.id, ready.run.id, currentItemId));
    setAnswer(saved ?? ""); setSelected("");
  }, [ready?.activity.id, ready?.run.id, currentItemId, props.accountId]);
  const saveDraft = (value: string) => { setAnswer(value); if (ready && currentItemId) window.localStorage.setItem(draftKey(props.accountId, ready.activity.id, ready.run.id, currentItemId), value); };
  const updateRun = useMutation({ mutationFn: (input: unknown) => apiRequest(`${lessonActivityEndpoint(props.groupId, props.courseId, props.lessonId, ready!.activity.id)}/run`, activityRunPatchResponseSchema, { method: "PATCH", body: JSON.stringify({ runId: ready!.run.id, ...input }) }) });
  const submit = useMutation({ mutationFn: (input: unknown) => apiRequest(`${lessonActivityEndpoint(props.groupId, props.courseId, props.lessonId, ready!.activity.id)}/answers`, activityAnswerResponseSchema, { method: "POST", body: JSON.stringify({ runId: ready!.run.id, itemId: currentItemId, answer: input, inputMode, idempotencyKey: nonce() }) }), onSuccess: (result) => {
    setFeedback({ correct: result.correct, reference: result.reference, explanation: result.explanation });
    window.localStorage.removeItem(draftKey(props.accountId, ready!.activity.id, ready!.run.id, currentItemId));
  } });
  const advance = async () => {
    const next = cursor + 1; await updateRun.mutateAsync({ action: next >= (questions.length || learnerTurns.length) ? "complete" : "continue", expectedCursor: cursor });
    if (next >= (questions.length || learnerTurns.length)) setDone(true); else { setCursor(next); setFeedback(null); setAnswer(""); setSelected(""); }
  };
  const back = <Link className={styles.back} {...lessonHref(props, descriptor)}><ArrowLeft aria-hidden="true" />{t("lessonActivities.backToSection", { section: descriptor?.sourceLabel ?? props.lessonTitle })}</Link>;
  if (descriptors.isPending && !props.archived) return <main className={styles.page}>{back}<LoadingState label={t("lessonActivities.loadingSources")} /></main>;
  if (!descriptor) return <main className={styles.page}>{back}<ErrorState title={t("lessonActivities.unavailable")} /></main>;
  if (descriptors.isError) return <main className={styles.page}>{back}<ErrorState title={t("lessonActivities.unavailable")} action={<Button onClick={() => void descriptors.refetch()}>{t("common.retry")}</Button>} /></main>;
  if (!ready) return <main className={styles.page}>{back}<header className={styles.header}><span className={styles.eyebrow}>{props.lessonTitle}</span><h1>{t(`lessonActivities.types.${props.type}`)}</h1><p>{descriptor.sourceLabel}</p></header>
    <Surface className={styles.panel} role="status">{status.isError || openError ? <><p>{t("lessonActivities.openFailed")}</p><Button onClick={() => { setOpened(null); void open(); }}>{t("common.retry")}</Button></> : <><LoadingState label={t("lessonActivities.preparing")} />{opened?.status === "generating" && <Button variant="quiet" onClick={() => void status.refetch()}>{t("lessonActivities.checkAgain")}</Button>}</>}</Surface></main>;
  return <main className={styles.page}>{back}<header className={styles.header}><span className={styles.eyebrow}>{props.lessonTitle} · {ready.activity.sourceLabel}</span><h1>{t(`lessonActivities.types.${props.type}`)}</h1>{questions.length > 0 && <ProgressMeter value={done ? 100 : (100 * cursor) / questions.length} label={t("lessonActivities.progress", { current: cursor + 1, total: questions.length })} showLabel />}</header>
    {props.archived || ready.ephemeral ? <Surface tone="quiet"><p>{t("lessonActivities.archivedUnsaved")}</p></Surface> : null}
    {done || ready.run.status === "completed" ? <Surface className={styles.panel}><h2>{t("lessonActivities.finished")}</h2><p>{t("lessonActivities.finishedBody")}</p><Button component={Link} {...lessonHref(props, descriptor)}>{t("lessonActivities.backToLesson")}</Button></Surface>
      : payload?.type === "story_summary" ? <Surface className={styles.panel}><h2>{t("lessonActivities.englishSummary")}</h2><p>{payload.englishSummary}</p><h2>{t("lessonActivities.dutchRecap")}</h2><p>{payload.dutchRecap}</p><Button onClick={async () => { await updateRun.mutateAsync({ action: "complete" }); setDone(true); }}>{t("lessonActivities.done")}</Button></Surface>
      : payload?.type === "grammar_explanation" ? <Surface className={styles.panel}><h2>{t("lessonActivities.explanation")}</h2>{payload.paragraphs.map((line, i) => <p key={i}>{line}</p>)}{payload.examples.map((example, i) => <div className={styles.turn} key={i}><strong lang="nl">{example.dutch}</strong><p>{example.english}</p></div>)}<Button onClick={async () => { await updateRun.mutateAsync({ action: "complete" }); setDone(true); }}>{t("lessonActivities.done")}</Button></Surface>
      : payload?.type === "roleplay" ? <Roleplay {...{ t, payload, learnerTurns, activeTurn, cursor, started, setStarted, language, setLanguage, answer, saveDraft, feedback, setFeedback, submit, advance, ready, updateRun, inputMode, setInputMode }} />
      : activeQuestion ? <Surface className={styles.panel}><p>{activeQuestion.prompt}</p>
        {activeQuestion.kind === "choice" && <div className={styles.choices}>{activeQuestion.options.map((option) => <Button key={option.id} variant={selected === option.id ? "primary" : "secondary"} className={styles.choice} aria-pressed={selected === option.id} onClick={() => setSelected(option.id)}>{option.text}</Button>)}</div>}
        {activeQuestion.kind === "fill_in" && <TextAreaField label={t("lessonActivities.answerLabel")} value={answer} onChange={(event) => saveDraft(event.currentTarget.value)} autosize minRows={2} />}
        {activeQuestion.kind === "word_order" && <><p>{activeQuestion.tokens.join(" · ")}</p><TextAreaField label={t("lessonActivities.answerLabel")} value={answer} onChange={(event) => saveDraft(event.currentTarget.value)} autosize minRows={2} /></>}
        {feedback ? <div className={styles.feedback} role="status"><strong>{feedback.correct ? t("lessonActivities.correct") : t("lessonActivities.tryAgain")}</strong>{feedback.reference && <p>{feedback.reference}</p>}{feedback.explanation && <p>{feedback.explanation}</p>}<div className={styles.actions}><Button onClick={() => { setFeedback(null); setAnswer(""); setSelected(""); }}>{t("lessonActivities.retry")}</Button><Button onClick={() => void advance()}>{cursor + 1 === questions.length ? t("lessonActivities.finish") : t("lessonActivities.continue")}</Button></div></div>
          : <div className={styles.actions}><Button loading={submit.isPending} disabled={activeQuestion.kind === "choice" ? !selected : !answer.trim()} onClick={() => void submit.mutateAsync(activeQuestion.kind === "choice" ? { kind: "choice", optionId: selected } : activeQuestion.kind === "fill_in" ? { kind: "text", text: answer } : { kind: "text", text: answer })}>{t("lessonActivities.checkAnswer")}</Button></div>}</Surface>
      : <Surface className={styles.panel}><p>{t("lessonActivities.unavailable")}</p><Button onClick={() => { setOpened(null); void open(); }}>{t("common.retry")}</Button></Surface>}
  </main>;
}

function Roleplay({ t, payload, learnerTurns, activeTurn, cursor, started, setStarted, language, setLanguage, answer, saveDraft, feedback, setFeedback, submit, advance, ready, updateRun, inputMode, setInputMode }: any) {
  const partner = payload.turns.filter((turn: { isLearner: boolean }) => !turn.isLearner);
  const turn = payload.turns[0];
  const cue = activeTurn ? (language === "english" ? activeTurn.cue ?? activeTurn.englishText : activeTurn.dutchText) : "";
  return <Surface className={styles.panel}><div className={styles.actions}><label>{t("lessonActivities.cueLanguage")}<select value={language} onChange={(event) => { setLanguage(event.currentTarget.value); void updateRun.mutate({ action: "set_cue_mode", cueMode: event.currentTarget.value }); }}><option value="english">{t("lessonActivities.english")}</option><option value="dutch">{t("lessonActivities.dutch")}</option></select></label></div>
    {!started ? <><p>{t("lessonActivities.roleplayIntro", { speaker: "Sofia" })}</p><Button onClick={() => setStarted(true)}>{t("lessonActivities.startDialogue")}</Button></>
      : <><div className={styles.turn}><strong>{turn.speaker}</strong><p>{turn.dutchText}</p>{turn.englishText && <p>{turn.englishText}</p>}</div><p>{cue}</p>
        <TextAreaField className={styles.draft} label={t("lessonActivities.yourTurn")} value={answer} onChange={(event) => { saveDraft(event.currentTarget.value); setInputMode("typed"); }} autosize minRows={2} />
        <div className={styles.actions}><Button variant="secondary" aria-label={t("lessonActivities.holdToSpeak")} onPointerDown={(event) => { event.preventDefault(); setInputMode("spoken"); }} onPointerUp={() => undefined}><Mic aria-hidden="true" />{t("lessonActivities.holdToSpeak")}</Button><Button disabled={!answer.trim() || submit.isPending} loading={submit.isPending} onClick={() => void submit.mutateAsync({ kind: "text", text: answer })}><Send aria-hidden="true" />{t("lessonActivities.send")}</Button></div>
        {feedback && <div className={styles.feedback} role="status"><p>{feedback.correct ? t("lessonActivities.correct") : t("lessonActivities.reference", { text: feedback.reference ?? "" })}</p><div className={styles.actions}><Button onClick={() => { setFeedback(null); saveDraft(""); }}>{t("lessonActivities.retry")}</Button><Button onClick={() => void advance()}>{cursor + 1 === learnerTurns.length ? t("lessonActivities.finish") : t("lessonActivities.continue")}</Button></div></div>}
      </>}
  </Surface>;
}
