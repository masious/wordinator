import { Mic, Send, Volume2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { activitySpeechResponseSchema, type LessonActivityRun, type LessonActivityViewPayload } from "@wordinator/contracts/lesson-activities";
import { ApiError, apiRequest, speechRecognitionTokenSource } from "../../api";
import { playSpeech, stopSpeech, useSpeechFailure, useSpeechPlayback } from "../../molecules/Speech";
import { AssessmentBreakdown, ScoreRing, unscored } from "../../molecules/SpeakControls";
import { isListening, RECOGNITION_LOCALES, SENTENCE_ANSWER_WINDOW, SpeechRecognitionScope, useSpokenAnswer, type PronunciationAssessment } from "../../molecules/speechRecognition";
import { Button, SelectField, Surface, TextAreaField } from "../../ui";
import { readDraft, useAnswerAttempt, writeDraft } from "./activityAnswers";
import styles from "./LessonActivity.module.css";

// Role-play (docs/lesson-activities.md#original-dialogue-role-play, plan section 04): the learner plays Sofia; the app voices the other
// original characters from the stored dialogue. Partner audio plays only after an explicit Start or Continue; the learner's line is
// captured only while the hold control is held, and only Send submits it.

type RoleplayTurn = Extract<LessonActivityViewPayload, { type: "roleplay" }>["turns"][number];
type CueMode = LessonActivityRun["cueMode"];

export type RoleplayActivityProps = {
  groupId: string; language: string | undefined; endpoint: string; runId: string; turns: readonly RoleplayTurn[]; cursor: number; cueMode: CueMode;
  keyFor: (itemId: string) => string | null; advancing: boolean; onCueMode: (cueMode: CueMode) => void; onContinue: () => void;
  // The return link, shown beside Finish on the last turn.
  backToLesson: ReactNode;
};

// Speech limits (docs/speech.md#lesson-activity-role-play): a line over CHUNK_CHARS arrives as chunks, asked for in order until the server
// refuses the next index. Pending clips are asked again after the server's delay, within a bound.
const CHUNK_CHARS = 300;
const MAX_CHUNKS = 20;
const SPEECH_POLLS = 10;
const SPEECH_WAIT_MS = 30_000;
const wait = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });
const pollDelay = (ms: number) => Math.min(10_000, Math.max(250, ms));
const isHoldKey = (key: string) => key === " " || key === "Enter";

// One clip of a line (a chunk index for a long line), waiting out pending answers within the bound.
async function requestClip(endpoint: string, runId: string, turnId: string, chunkIndex: number | undefined): Promise<string> {
  const deadline = Date.now() + SPEECH_WAIT_MS;
  for (let attempt = 0; attempt < SPEECH_POLLS; attempt += 1) {
    const body = chunkIndex === undefined ? { runId, turnId } : { runId, turnId, chunkIndex };
    const response = await apiRequest(`${endpoint}/speech`, activitySpeechResponseSchema, { method: "POST", body: JSON.stringify(body) });
    if (response.status === "ready") return response.url;
    const delay = pollDelay(response.retryAfterMs);
    if (Date.now() + delay > deadline) break;
    await wait(delay);
  }
  throw new Error("Speech stayed pending.");
}

// The clip URLs of one line, in order. A short line is one clip; a long one is asked for chunk by chunk, and the first refused index
// after 0 (ACTIVITY_CHUNK_INVALID) ends it. Unavailable audio (503, or 409 on an archived course) rejects, and the caller shows the text.
async function lineUrls(endpoint: string, runId: string, line: RoleplayTurn): Promise<string[]> {
  if (line.dutchText.length <= CHUNK_CHARS) return [await requestClip(endpoint, runId, line.id, undefined)];
  const urls: string[] = [];
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    try {
      urls.push(await requestClip(endpoint, runId, line.id, index));
    } catch (error) {
      if (index > 0 && error instanceof ApiError && error.code === "ACTIVITY_CHUNK_INVALID") break;
      throw error;
    }
  }
  return urls;
}

// The partner lines between the previous Sofia turn and this one, in original order.
function partnerLinesBefore(turns: readonly RoleplayTurn[], learner: RoleplayTurn | undefined): RoleplayTurn[] {
  if (!learner) return [];
  const lines: RoleplayTurn[] = [];
  for (let index = turns.indexOf(learner) - 1; index >= 0; index -= 1) {
    const line = turns[index];
    if (!line || line.isLearner) break;
    lines.unshift(line);
  }
  return lines;
}

// The partner lines after Sofia's last turn: shown beside Finish, with Replay.
function partnerLinesAfterLastLearner(turns: readonly RoleplayTurn[]): RoleplayTurn[] {
  const lines: RoleplayTurn[] = [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const line = turns[index];
    if (!line || line.isLearner) break;
    lines.unshift(line);
  }
  return lines;
}

export function RoleplayActivity(props: RoleplayActivityProps) {
  const token = useMemo(() => speechRecognitionTokenSource(props.groupId), [props.groupId]);
  const locale = props.language ? (RECOGNITION_LOCALES[props.language as keyof typeof RECOGNITION_LOCALES] ?? null) : null;
  return <SpeechRecognitionScope locale={locale} token={token}><RoleplayDialogue {...props} /></SpeechRecognitionScope>;
}

type PartnerRun = { cursor: number; status: "loading" | "ready"; turnIds: string[]; unavailable: boolean };

function RoleplayDialogue({ endpoint, runId, turns, cursor, cueMode, keyFor, advancing, onCueMode, onContinue, backToLesson, language }: RoleplayActivityProps) {
  const { t } = useTranslation();
  const owner = useId();
  // The partner dialogue, the replay of one line, and Sofia's own line each have an owner, so each button can tell its playback apart.
  const replayOwner = `${owner}:replay`;
  const sofiaOwner = `${owner}:sofia`;
  const [started, setStarted] = useState(false);
  const [partner, setPartner] = useState<PartnerRun | null>(null);
  const [holding, setHolding] = useState(false);
  const [replayFailed, setReplayFailed] = useState(false);
  const clips = useRef(new Map<string, Promise<string[]>>());
  // Each partner run takes a new number; a run that finds another number (cursor moved, unmounted) plays nothing.
  const runToken = useRef(0);
  const regionRef = useRef<HTMLDivElement>(null);
  const shownCursor = useRef(cursor);

  const learnerTurns = turns.filter((turn) => turn.isLearner);
  const active = learnerTurns[cursor];
  const lines = partnerLinesBefore(turns, active);
  const isLastLine = cursor === learnerTurns.length - 1;
  const trailing = isLastLine ? partnerLinesAfterLastLearner(turns) : [];
  const playback = useSpeechPlayback(owner);
  const [audioFailed, setAudioFailed] = useSpeechFailure(playback?.status);
  const playing = playback?.status === "loading" || playback?.status === "playing" || playback?.status === "paused";
  const partnerReady = started && partner?.cursor === cursor && partner.status === "ready";
  // Sofia's turn waits while partner lines load or play, and the learner cannot capture or send then.
  const busy = started && (!partnerReady || playing);
  const playingTurnId = playing ? partner?.turnIds[playback?.index ?? -1] : undefined;

  const loadLine = (line: RoleplayTurn) => {
    let pending = clips.current.get(line.id);
    if (!pending) {
      pending = lineUrls(endpoint, runId, line);
      clips.current.set(line.id, pending);
      // A failed load is not kept, so the next press asks again.
      pending.catch(() => { clips.current.delete(line.id); });
    }
    return pending;
  };

  // Partner lines play once the learner has pressed Start, and again after each Continue. Sofia's own turn never starts playback.
  useEffect(() => {
    if (!started || !active) return;
    const token = ++runToken.current;
    if (lines.length === 0) { setPartner({ cursor, status: "ready", turnIds: [], unavailable: false }); return; }
    setPartner({ cursor, status: "loading", turnIds: [], unavailable: false });
    void Promise.all(lines.map((line) => loadLine(line).then((urls) => ({ line, urls }), () => ({ line, urls: null })))).then((results) => {
      if (runToken.current !== token) return;
      const queue = results.flatMap(({ line, urls }) => urls ? urls.map((url) => ({ url, turnId: line.id })) : []);
      setPartner({ cursor, status: "ready", turnIds: queue.map((entry) => entry.turnId), unavailable: results.some((result) => result.urls === null) });
      if (queue.length > 0) {
        setAudioFailed(false);
        playSpeech(owner, queue.map((entry) => entry.url));
      }
    });
    return () => { runToken.current += 1; };
  }, [started, cursor]);

  // Leaving the dialogue (route change, sign-out) stops any clip it started.
  useEffect(() => () => { stopSpeech(); }, []);

  // When Continue moves to the next turn, focus goes to the new turn only if the control that had it was removed (focus would
  // otherwise be lost); focus is never taken from anything else.
  useEffect(() => {
    if (shownCursor.current === cursor) return;
    shownCursor.current = cursor;
    const focused = document.activeElement;
    if (!focused || focused === document.body) regionRef.current?.querySelector<HTMLElement>("[data-focus-target]")?.focus();
  }, [cursor]);

  const replay = (line: RoleplayTurn) => {
    setReplayFailed(false);
    void loadLine(line).then((urls) => { playSpeech(replayOwner, urls); }, () => { setReplayFailed(true); });
  };
  const listenSofia = (turn: RoleplayTurn) => {
    setReplayFailed(false);
    void loadLine(turn).then((urls) => { playSpeech(sofiaOwner, urls); }, () => { setReplayFailed(true); });
  };

  const sofiaPlaying = useSpeechPlayback(sofiaOwner) !== null;
  const statusLine = !started ? "" : !partnerReady ? t("lessonActivities.roleplay.preparingDialogue")
    : playing ? t("lessonActivities.roleplay.playing")
      : active ? t("lessonActivities.roleplay.yourTurn", { speaker: active.speaker }) : "";

  return <Surface className={styles.panel}>
    <div className={styles.actions}>
      <SelectField label={t("lessonActivities.cueLanguage")} value={cueMode} allowDeselect={false} onChange={(value) => { if (value === "english" || value === "dutch") onCueMode(value); }}
        data={[{ value: "english", label: t("lessonActivities.english") }, { value: "dutch", label: t("lessonActivities.dutch") }]} />
    </div>
    <div ref={regionRef} className={styles.panel}>
      {!started ? <>
        <p>{t("lessonActivities.roleplayIntro", { speaker: "Sofia" })}</p>
        <div className={styles.actions}><Button onClick={() => setStarted(true)}>{t("lessonActivities.startDialogue")}</Button></div>
      </> : active ? <>
        <p className={styles.hint} role="status" aria-live="polite">{statusLine}</p>
        {lines.map((line) => <PartnerLine key={line.id} line={line} language={language} playing={line.id === playingTurnId} disabled={holding} onReplay={() => replay(line)} />)}
        {(partner?.unavailable || audioFailed || replayFailed) && <p className={styles.notice} role="status">{t("lessonActivities.roleplay.audioUnavailable")}</p>}
        <RoleplayReply key={active.id} endpoint={endpoint} runId={runId} turn={active} cueMode={cueMode} busy={busy} language={language}
          draftKey={keyFor(active.id)} last={isLastLine} advancing={advancing} onContinue={onContinue} onHoldChange={setHolding}
          onListenSofia={() => listenSofia(active)} backToLesson={backToLesson} sofiaPlaying={sofiaPlaying} />
        {trailing.length > 0 && <>
          <p className={styles.hint}>{t("lessonActivities.roleplay.afterLast")}</p>
          {trailing.map((line) => <PartnerLine key={line.id} line={line} language={language} playing={line.id === playingTurnId} disabled={holding} onReplay={() => replay(line)} />)}
        </>}
      </> : null}
    </div>
  </Surface>;
}

function PartnerLine({ line, language, playing, disabled, onReplay }: { line: RoleplayTurn; language: string | undefined; playing: boolean; disabled: boolean; onReplay: () => void }) {
  const { t } = useTranslation();
  return <div className={styles.turn} data-playing={playing || undefined} aria-current={playing || undefined}>
    <strong>{line.speaker}</strong>
    <p lang={language}>{line.dutchText}</p>
    {line.englishText && <p>{line.englishText}</p>}
    <div className={styles.actions}>
      <Button variant="quiet" disabled={disabled} aria-label={t("lessonActivities.roleplay.replayLine", { speaker: line.speaker })} onClick={onReplay}>
        <Volume2 aria-hidden="true" />{t("lessonActivities.roleplay.replay")}
      </Button>
    </div>
  </div>;
}

type RoleplayReplyProps = {
  endpoint: string; runId: string; turn: RoleplayTurn; cueMode: CueMode; busy: boolean; language: string | undefined; draftKey: string | null;
  last: boolean; advancing: boolean; onContinue: () => void; onHoldChange: (holding: boolean) => void; onListenSofia: () => void;
  backToLesson: ReactNode; sofiaPlaying: boolean;
};

// Sofia's turn. Only Send submits: a hold fills the editable draft, and releasing never sends.
function RoleplayReply({ endpoint, runId, turn, cueMode, busy, language, draftKey, last, advancing, onContinue, onHoldChange, onListenSofia, backToLesson, sofiaPlaying }: RoleplayReplyProps) {
  const { t } = useTranslation();
  const hintId = useId();
  const [draft, setDraft] = useState(() => readDraft(draftKey));
  // The transcript the draft came from. A draft that still equals it is sent as spoken; an edited one is sent as typed.
  const [spoken, setSpoken] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  // The pronunciation of the sent line, when the spoken line was assessed and sent unedited.
  const [scored, setScored] = useState<PronunciationAssessment | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [threw, setThrew] = useState(false);
  const holdingRef = useRef(false);
  const attempt = useAnswerAttempt(endpoint, runId, turn.id, () => writeDraft(draftKey, ""));
  const result = attempt.result;

  // The recognizer gets Sofia's exact line as the reference, so Microsoft assesses against it. Matching is the server's, not this hook's.
  const listen = useSpokenAnswer(turn.dutchText, (heard) => {
    setDraft(heard.heard); writeDraft(draftKey, heard.heard); setSpoken(heard.heard); setAssessment(heard.assessment);
  }, undefined, SENTENCE_ANSWER_WINDOW);
  const listening = isListening(listen.status);
  const canHold = listen.available && !busy && !result && !attempt.pending && !listening;

  const begin = () => {
    if (holdingRef.current || !canHold) return;
    holdingRef.current = true; onHoldChange(true); setThrew(false);
    try { listen.listen(); } catch { holdingRef.current = false; onHoldChange(false); setThrew(true); }
  };
  const release = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false; onHoldChange(false);
    listen.finish();
  };
  const releaseRef = useRef(release);
  releaseRef.current = release;
  // Hidden tab: stop capturing. Unmounting (a new turn, route change) also stops it: the recognition hook cancels on unmount.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") releaseRef.current(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); };
  }, []);
  useEffect(() => () => { if (holdingRef.current) { holdingRef.current = false; onHoldChange(false); } }, []);

  const save = (value: string) => { setDraft(value); writeDraft(draftKey, value); };
  const sendAnswer = () => {
    const text = draft.trim();
    if (!text || listening || busy) return;
    const fromSpeech = spoken !== null && draft === spoken;
    setScored(fromSpeech && assessment && !unscored(assessment) ? assessment : null);
    attempt.check({ kind: "text", text }, fromSpeech ? "spoken" : "typed");
  };
  const retry = () => {
    attempt.retry(); setDraft(""); writeDraft(draftKey, ""); setSpoken(null); setAssessment(null); setScored(null);
  };

  const english = turn.cue ?? turn.englishText;
  const showEnglish = cueMode === "english" && english !== null;
  const notice = !listen.available ? t("lessonActivities.roleplay.unavailable")
    : threw || listen.status === "failed" ? t("lessonActivities.roleplay.failed")
      : listen.status === "blocked" ? t("lessonActivities.roleplay.blocked")
        : listen.status === "noSpeech" ? t("lessonActivities.roleplay.noSpeech") : "";
  const listenHint = !listening ? "" : listen.status === "preparing" ? t("lessonActivities.roleplay.listen.preparing")
    : listen.status === "checking" ? t("lessonActivities.roleplay.listen.checking")
      : listen.status === "hearing" ? (listen.interim ? t("lessonActivities.roleplay.listen.heardSoFar", { interim: listen.interim }) : t("lessonActivities.roleplay.listen.hearing"))
        : listen.quiet ? t("lessonActivities.roleplay.listen.quiet") : t("lessonActivities.roleplay.listen.listening");

  return <div data-focus-target tabIndex={-1} className={styles.panel}>
    {busy ? null : <div className={styles.cue}>
      <span className={styles.hint}>{t("lessonActivities.roleplay.cueHeading", { speaker: turn.speaker })}</span>
      <p>{showEnglish ? english : turn.dutchText}</p>
      {showEnglish && (revealed
        ? <p lang={language}><strong>{turn.dutchText}</strong></p>
        : <div className={styles.actions}><Button variant="quiet" onClick={() => setRevealed(true)}>{t("lessonActivities.roleplay.revealDutch")}</Button></div>)}
    </div>}
    <TextAreaField className={styles.draft} label={t("lessonActivities.yourTurn")} value={draft} disabled={result !== null}
      onChange={(event) => save(event.currentTarget.value)} autosize minRows={2} />
    {!result && <div className={styles.actions}>
      <Button variant="secondary" className={styles.mic} data-holding={listening || undefined} aria-describedby={hintId}
        disabled={!listen.available || busy || attempt.pending}
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
          // Key repeat re-sends keydown while the key is held; only the first press starts a capture.
          if (!event.repeat) begin();
        }}
        onKeyUp={(event: KeyboardEvent<HTMLButtonElement>) => { if (isHoldKey(event.key)) { event.preventDefault(); release(); } }}
        onContextMenu={(event) => event.preventDefault()}>
        <Mic aria-hidden="true" />{t("lessonActivities.holdToSpeak")}
      </Button>
      <Button disabled={!draft.trim() || listening || busy || attempt.pending} loading={attempt.pending} onClick={sendAnswer}>
        <Send aria-hidden="true" />{t("lessonActivities.send")}
      </Button>
    </div>}
    {!result && <p id={hintId} className={styles.hint}>{t("lessonActivities.roleplay.holdHint")}</p>}
    {!result && listenHint && <p className={styles.hint} role="status" aria-live="polite">{listenHint}</p>}
    {!result && spoken !== null && <p className={styles.hint} role="status">{t("lessonActivities.roleplay.draftFromSpeech")}</p>}
    {!result && notice && <p className={styles.notice} role="status">{notice}</p>}
    {result && <div className={styles.feedback} role="status">
      <strong>{result.correct ? t("lessonActivities.correct") : t("lessonActivities.roleplay.different")}</strong>
      {!result.correct && result.reference && <p>{t("lessonActivities.roleplay.original", { text: result.reference })}</p>}
      {scored && <div className={styles.score}>
        <p>{t("lessonActivities.roleplay.pronunciation")}</p>
        <ScoreRing score={scored.overall} compact />
        <AssessmentBreakdown assessment={scored} />
      </div>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={retry}>{t("lessonActivities.retry")}</Button>
        <Button variant="secondary" loading={sofiaPlaying} onClick={onListenSofia}><Volume2 aria-hidden="true" />{t("lessonActivities.roleplay.listenSofia")}</Button>
        <Button loading={advancing} disabled={advancing} onClick={onContinue}>{last ? t("lessonActivities.finish") : t("lessonActivities.continue")}</Button>
        {last && backToLesson}
      </div>
    </div>}
    {attempt.error && <p className={styles.alert} role="alert">{t("lessonActivities.answerFailed")}</p>}
  </div>;
}
