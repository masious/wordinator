import { Mic, Send, Volume2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { activitySpeechResponseSchema } from "@wordinator/contracts/lesson-activities";
import { ApiError, apiRequest, speechRecognitionTokenSource } from "../../api";
import { playSpeech, stopSpeech, useSpeechFailure, useSpeechPlayback } from "../../molecules/Speech";
import { AssessmentBreakdown, ScoreRing, unscored } from "../../molecules/SpeakControls";
import { isListening, RECOGNITION_LOCALES, SENTENCE_ANSWER_WINDOW, SpeechRecognitionScope, useSpokenAnswer, type PronunciationAssessment } from "../../molecules/speechRecognition";
import { Button, Surface, TextAreaField } from "../../ui";
import { useAnswerAttempt } from "./activityAnswers";
import styles from "./LessonActivity.module.css";

// Shared by the read-aloud and speak-from-English activities (docs/lesson-activities.md): one line at a time, hold-to-talk fills an
// editable draft, only Send submits. Nothing is saved to the device: the draft lives in component state only (no drafts).

export type SpokenLine = { id: string; speaker: string | null; dutchText: string | null; englishText?: string };
export type SpokenLineActivityProps = {
  groupId: string; language: string | undefined; endpoint: string; runId: string; lines: readonly SpokenLine[]; cursor: number;
  advancing: boolean; onContinue: () => void;
  // The return link, shown beside Finish on the last line.
  backToLesson: ReactNode;
};

const CHUNK_CHARS = 300;
const MAX_CHUNKS = 20;
const SPEECH_POLLS = 10;
const SPEECH_WAIT_MS = 30_000;
const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });
const pollDelay = (ms: number) => Math.min(10_000, Math.max(250, ms));
const isHoldKey = (key: string) => key === " " || key === "Enter";

async function requestClip(endpoint: string, runId: string, lineId: string, chunkIndex: number | undefined): Promise<string> {
  const deadline = Date.now() + SPEECH_WAIT_MS;
  for (let attempt = 0; attempt < SPEECH_POLLS; attempt += 1) {
    const body = chunkIndex === undefined ? { runId, lineId } : { runId, lineId, chunkIndex };
    const response = await apiRequest(`${endpoint}/speech`, activitySpeechResponseSchema, { method: "POST", body: JSON.stringify(body) });
    if (response.status === "ready") return response.url;
    const delay = pollDelay(response.retryAfterMs);
    if (Date.now() + delay > deadline) break;
    await wait(delay);
  }
  throw new Error("Speech stayed pending.");
}

// The clip URLs of one line, in order; a long line arrives as chunks, ended by the first refused index after 0.
async function lineUrls(endpoint: string, runId: string, lineId: string, dutchText: string): Promise<string[]> {
  if (dutchText.length <= CHUNK_CHARS) return [await requestClip(endpoint, runId, lineId, undefined)];
  const urls: string[] = [];
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    try {
      urls.push(await requestClip(endpoint, runId, lineId, index));
    } catch (error) {
      if (index > 0 && error instanceof ApiError && error.code === "ACTIVITY_CHUNK_INVALID") break;
      throw error;
    }
  }
  return urls;
}

export function SpokenLineActivity(props: SpokenLineActivityProps & { mode: "read" | "speak" }) {
  const token = useMemo(() => speechRecognitionTokenSource(props.groupId), [props.groupId]);
  const locale = props.language ? (RECOGNITION_LOCALES[props.language as keyof typeof RECOGNITION_LOCALES] ?? null) : null;
  return <SpeechRecognitionScope locale={locale} token={token}><SpokenLinePanel {...props} /></SpeechRecognitionScope>;
}

function SpokenLinePanel({ mode, endpoint, runId, lines, cursor, advancing, onContinue, backToLesson, language }: SpokenLineActivityProps & { mode: "read" | "speak" }) {
  const { t } = useTranslation();
  const line = lines[cursor];
  const regionRef = useRef<HTMLDivElement>(null);
  const shownCursor = useRef(cursor);
  // Leaving the activity stops any clip it started.
  useEffect(() => () => { stopSpeech(); }, []);
  // When Continue moves to the next line, focus moves to it only if the control that had it was removed.
  useEffect(() => {
    if (shownCursor.current === cursor) return;
    shownCursor.current = cursor;
    const focused = document.activeElement;
    if (!focused || focused === document.body) regionRef.current?.querySelector<HTMLElement>("[data-focus-target]")?.focus();
  }, [cursor]);
  if (!line) return null;
  return <Surface className={styles.panel}>
    <div ref={regionRef} className={styles.panel}>
      <p className={styles.hint} role="status">{t("lessonActivities.speaking.progress", { n: cursor + 1, total: lines.length })}</p>
      <SpokenLineReply key={line.id} mode={mode} endpoint={endpoint} runId={runId} line={line} language={language} last={cursor === lines.length - 1}
        advancing={advancing} onContinue={onContinue} backToLesson={backToLesson} />
    </div>
  </Surface>;
}

function SpokenLineReply({ mode, endpoint, runId, line, language, last, advancing, onContinue, backToLesson }: {
  mode: "read" | "speak"; endpoint: string; runId: string; line: SpokenLine; language: string | undefined; last: boolean; advancing: boolean;
  onContinue: () => void; backToLesson: ReactNode;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const owner = useId();
  const [draft, setDraft] = useState("");
  const [spoken, setSpoken] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [scored, setScored] = useState<PronunciationAssessment | null>(null);
  const [threw, setThrew] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const holdingRef = useRef(false);
  const clips = useRef<Promise<string[]> | null>(null);
  const attempt = useAnswerAttempt(endpoint, runId, line.id, () => undefined);
  const result = attempt.result;
  const playback = useSpeechPlayback(owner);
  const [playbackFailed] = useSpeechFailure(playback?.status);
  const audioLoading = playback?.status === "loading";

  // The recognizer gets the Dutch line as the reference when it is known; the speak-from-English line is not known until Send.
  const listen = useSpokenAnswer(line.dutchText ?? "", (heard) => { setDraft(heard.heard); setSpoken(heard.heard); setAssessment(heard.assessment); }, undefined, SENTENCE_ANSWER_WINDOW);
  const listening = isListening(listen.status);
  const canHold = listen.available && !result && !attempt.pending && !listening;

  const begin = () => {
    if (holdingRef.current || !canHold) return;
    holdingRef.current = true; setThrew(false);
    try { listen.listen(); } catch { holdingRef.current = false; setThrew(true); }
  };
  const release = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    listen.finish();
  };
  const releaseRef = useRef(release);
  releaseRef.current = release;
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") releaseRef.current(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); };
  }, []);

  const play = () => {
    if (line.dutchText === null) return;
    const text = line.dutchText;
    setAudioFailed(false);
    if (!clips.current) {
      const pending = lineUrls(endpoint, runId, line.id, text);
      clips.current = pending;
      pending.catch(() => { clips.current = null; });
    }
    void clips.current.then((urls) => { playSpeech(owner, urls); }, () => { setAudioFailed(true); });
  };

  const sendAnswer = () => {
    const text = draft.trim();
    if (!text || listening) return;
    const fromSpeech = spoken !== null && draft === spoken;
    setScored(fromSpeech && assessment && !unscored(assessment) ? assessment : null);
    attempt.check({ kind: "text", text }, fromSpeech ? "spoken" : "typed");
  };
  const retry = () => { attempt.retry(); setDraft(""); setSpoken(null); setAssessment(null); setScored(null); };

  const notice = !listen.available ? t("lessonActivities.roleplay.unavailable")
    : threw || listen.status === "failed" ? t("lessonActivities.roleplay.failed")
      : listen.status === "blocked" ? t("lessonActivities.roleplay.blocked")
        : listen.status === "noSpeech" ? t("lessonActivities.roleplay.noSpeech") : "";
  const listenHint = !listening ? "" : listen.status === "preparing" ? t("lessonActivities.roleplay.listen.preparing")
    : listen.status === "checking" ? t("lessonActivities.roleplay.listen.checking")
      : listen.status === "hearing" ? (listen.interim ? t("lessonActivities.roleplay.listen.heardSoFar", { interim: listen.interim }) : t("lessonActivities.roleplay.listen.hearing"))
        : listen.quiet ? t("lessonActivities.roleplay.listen.quiet") : t("lessonActivities.roleplay.listen.listening");
  const reference = result ? (result.reference ?? line.dutchText) : null;

  return <div data-focus-target tabIndex={-1} className={styles.panel}>
    <div className={styles.cue}>
      {line.speaker && <strong>{line.speaker}</strong>}
      <span className={styles.hint}>{mode === "read" ? t("lessonActivities.speaking.readHeading") : t("lessonActivities.speaking.speakHeading")}</span>
      {mode === "read"
        ? <p lang={language}>{line.dutchText}</p>
        : <p>{line.englishText}</p>}
      {mode === "read" && <div className={styles.actions}>
        <Button variant="quiet" loading={audioLoading} onClick={play}><Volume2 aria-hidden="true" />{t("lessonActivities.listen")}</Button>
      </div>}
      {mode === "speak" && reference && <p lang={language}><strong>{reference}</strong></p>}
    </div>
    {(audioFailed || playbackFailed) && <p className={styles.notice} role="status">{t("lessonActivities.speaking.audioUnavailable")}</p>}
    <TextAreaField className={styles.draft} label={t("lessonActivities.yourTurn")} value={draft} disabled={result !== null}
      onChange={(event) => setDraft(event.currentTarget.value)} autosize minRows={2} />
    {!result && <div className={styles.actions}>
      <Button variant="secondary" className={styles.mic} data-holding={listening || undefined} aria-describedby={hintId} disabled={!listen.available || attempt.pending}
        onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          begin();
        }}
        onPointerUp={() => release()} onPointerCancel={() => release()} onLostPointerCapture={() => release()} onBlur={() => release()}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (!isHoldKey(event.key)) return;
          event.preventDefault();
          if (!event.repeat) begin();
        }}
        onKeyUp={(event: KeyboardEvent<HTMLButtonElement>) => { if (isHoldKey(event.key)) { event.preventDefault(); release(); } }}
        onContextMenu={(event) => event.preventDefault()}>
        <Mic aria-hidden="true" />{t("lessonActivities.holdToSpeak")}
      </Button>
      <Button disabled={!draft.trim() || listening || attempt.pending} loading={attempt.pending} onClick={sendAnswer}>
        <Send aria-hidden="true" />{t("lessonActivities.send")}
      </Button>
    </div>}
    {!result && <p id={hintId} className={styles.hint}>{t("lessonActivities.roleplay.holdHint")}</p>}
    {!result && listenHint && <p className={styles.hint} role="status" aria-live="polite">{listenHint}</p>}
    {!result && spoken !== null && <p className={styles.hint} role="status">{t("lessonActivities.roleplay.draftFromSpeech")}</p>}
    {!result && notice && <p className={styles.notice} role="status">{notice}</p>}
    {result && <div className={styles.feedback} role="status">
      <strong>{result.correct ? t("lessonActivities.correct") : t("lessonActivities.differentLine")}</strong>
      {!result.correct && reference && <p>{t("lessonActivities.speaking.original", { text: reference })}</p>}
      {scored && <div className={styles.score}>
        <p>{t("lessonActivities.roleplay.pronunciation")}</p>
        <ScoreRing score={scored.overall} compact />
        <AssessmentBreakdown assessment={scored} />
      </div>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={retry}>{t("lessonActivities.retry")}</Button>
        <Button loading={advancing} disabled={advancing} onClick={onContinue}>{last ? t("lessonActivities.finish") : t("lessonActivities.continue")}</Button>
        {last && backToLesson}
      </div>
    </div>}
    {attempt.error && <p className={styles.alert} role="alert">{t("lessonActivities.answerFailed")}</p>}
  </div>;
}
