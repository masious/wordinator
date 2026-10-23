import { Radio } from "@mantine/core";
import { Mic, Send, Volume2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { activitySpeechResponseSchema, dialogueSpeakers, type LessonActivityViewPayload } from "@wordinator/contracts/lesson-activities";
import { ApiError, apiRequest, speechRecognitionTokenSource } from "../../api";
import { playSpeech, stopSpeech, useSpeechFailure, useSpeechPlayback } from "../../molecules/Speech";
import { AssessmentBreakdown, ScoreRing, unscored } from "../../molecules/SpeakControls";
import { isListening, RECOGNITION_LOCALES, SENTENCE_ANSWER_WINDOW, SpeechRecognitionScope, useSpokenAnswer, type PronunciationAssessment } from "../../molecules/speechRecognition";
import { Button, RadioField, Surface, TextAreaField } from "../../ui";
import { useAnswerAttempt } from "./activityAnswers";
import styles from "./LessonActivity.module.css";

// Read aloud (docs/lesson-activities.md#read-aloud): the learner chooses whose lines to read, one speaker or all of them. The app
// voices every other speaker's lines in the course cast voices. Partner audio plays only after an explicit Start or Continue; the
// learner's line is captured only while the hold control is held, and only Send submits it. Nothing is saved to the device.

type ReadAloudLine = Extract<LessonActivityViewPayload, { type: "read_aloud" }>["lines"][number];

export type ReadAloudActivityProps = {
  groupId: string; language: string | undefined; endpoint: string; runId: string; lines: readonly ReadAloudLine[]; cursor: number;
  // The run's speaker; null reads every line.
  reader: string | null;
  choosing: boolean; advancing: boolean; onChooseReader: (reader: string | null) => Promise<unknown>; onContinue: () => void;
  // The return link, shown beside Finish on the last line.
  backToLesson: ReactNode;
};

// Speech limits (docs/speech.md#lesson-activity-read-aloud): a line over CHUNK_CHARS arrives as chunks, asked for in order until the
// server refuses the next index. Pending clips are asked again after the server's delay, within a bound.
const CHUNK_CHARS = 300;
const MAX_CHUNKS = 20;
const SPEECH_POLLS = 10;
const SPEECH_WAIT_MS = 30_000;
const ALL = "\u0000all";
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

// The clip URLs of one line, in order. A short line is one clip; a long one is asked for chunk by chunk, and the first refused index
// after 0 (ACTIVITY_CHUNK_INVALID) ends it. Unavailable audio (503, or 409 on an archived course) rejects, and the caller shows the text.
async function lineUrls(endpoint: string, runId: string, line: ReadAloudLine): Promise<string[]> {
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

export function ReadAloudActivity(props: ReadAloudActivityProps) {
  const token = useMemo(() => speechRecognitionTokenSource(props.groupId), [props.groupId]);
  const locale = props.language ? (RECOGNITION_LOCALES[props.language as keyof typeof RECOGNITION_LOCALES] ?? null) : null;
  return <SpeechRecognitionScope locale={locale} token={token}><ReadAloudDialogue {...props} /></SpeechRecognitionScope>;
}

type PartnerRun = { cursor: number; status: "loading" | "ready"; lineIds: string[]; unavailable: boolean };

function ReadAloudDialogue({ endpoint, runId, lines, cursor, reader, choosing, advancing, onChooseReader, onContinue, backToLesson, language }: ReadAloudActivityProps) {
  const { t } = useTranslation();
  const owner = useId();
  // The voiced lines, the replay of one line, and the learner's own line each have an owner, so each button can tell its playback apart.
  const replayOwner = `${owner}:replay`;
  const ownLineOwner = `${owner}:own`;
  const speakers = dialogueSpeakers(lines);
  // A run that has started reading resumes where it was; a new or restarted run asks whose lines to read first.
  const [started, setStarted] = useState(!choosing);
  const [choice, setChoice] = useState(reader ?? ALL);
  const [starting, setStarting] = useState(false);
  const [partner, setPartner] = useState<PartnerRun | null>(null);
  const [holding, setHolding] = useState(false);
  const [replayFailed, setReplayFailed] = useState(false);
  const clips = useRef(new Map<string, Promise<string[]>>());
  // Each partner run takes a new number; a run that finds another number (cursor moved, unmounted) plays nothing.
  const runToken = useRef(0);
  const regionRef = useRef<HTMLDivElement>(null);
  const shownCursor = useRef(cursor);

  const isOwn = (line: ReadAloudLine) => reader === null || line.speaker === reader;
  const ownLines = lines.filter(isOwn);
  const active = ownLines[cursor];
  // The voiced lines between the learner's previous line and this one, in original order; after the last one, the rest.
  const voicedBefore = (target: ReadAloudLine | undefined) => {
    if (!target) return [];
    const before: ReadAloudLine[] = [];
    for (let index = lines.indexOf(target) - 1; index >= 0 && !isOwn(lines[index]!); index -= 1) before.unshift(lines[index]!);
    return before;
  };
  const voiced = voicedBefore(active);
  const isLastLine = cursor === ownLines.length - 1;
  const trailing = isLastLine && active ? lines.slice(lines.indexOf(active) + 1) : [];
  const playback = useSpeechPlayback(owner);
  const [audioFailed, setAudioFailed] = useSpeechFailure(playback?.status);
  const playing = playback?.status === "loading" || playback?.status === "playing" || playback?.status === "paused";
  const partnerReady = started && partner?.cursor === cursor && partner.status === "ready";
  // The learner's line waits while voiced lines load or play, and the learner cannot capture or send then.
  const busy = started && (!partnerReady || playing);
  const playingLineId = playing ? partner?.lineIds[playback?.index ?? -1] : undefined;

  const loadLine = (line: ReadAloudLine) => {
    let pending = clips.current.get(line.id);
    if (!pending) {
      pending = lineUrls(endpoint, runId, line);
      clips.current.set(line.id, pending);
      // A failed load is not kept, so the next press asks again.
      pending.catch(() => { clips.current.delete(line.id); });
    }
    return pending;
  };

  // Voiced lines play once the learner has pressed Start, and again after each Continue. The learner's own line never starts playback.
  useEffect(() => {
    if (!started || !active) return;
    const token = ++runToken.current;
    if (voiced.length === 0) { setPartner({ cursor, status: "ready", lineIds: [], unavailable: false }); return; }
    setPartner({ cursor, status: "loading", lineIds: [], unavailable: false });
    void Promise.all(voiced.map((line) => loadLine(line).then((urls) => ({ line, urls }), () => ({ line, urls: null })))).then((results) => {
      if (runToken.current !== token) return;
      const queue = results.flatMap(({ line, urls }) => urls ? urls.map((url) => ({ url, lineId: line.id })) : []);
      setPartner({ cursor, status: "ready", lineIds: queue.map((entry) => entry.lineId), unavailable: results.some((result) => result.urls === null) });
      if (queue.length > 0) {
        setAudioFailed(false);
        playSpeech(owner, queue.map((entry) => entry.url));
      }
    });
    return () => { runToken.current += 1; };
  }, [started, cursor, reader]);

  // Leaving the activity (route change, sign-out) stops any clip it started.
  useEffect(() => () => { stopSpeech(); }, []);

  // When Continue moves to the next line, focus goes to it only if the control that had it was removed; focus is never taken from
  // anything else.
  useEffect(() => {
    if (shownCursor.current === cursor) return;
    shownCursor.current = cursor;
    const focused = document.activeElement;
    if (!focused || focused === document.body) regionRef.current?.querySelector<HTMLElement>("[data-focus-target]")?.focus();
  }, [cursor]);

  const play = (playOwner: string, line: ReadAloudLine) => {
    setReplayFailed(false);
    void loadLine(line).then((urls) => { playSpeech(playOwner, urls); }, () => { setReplayFailed(true); });
  };
  // Start keeps the run's reader, or chooses the new one first (which starts the reading over on the server).
  const start = async () => {
    const chosen = choice === ALL ? null : choice;
    if (chosen !== reader) {
      setStarting(true);
      try { await onChooseReader(chosen); } catch { setStarting(false); return; }
      setStarting(false);
    }
    setStarted(true);
  };

  const ownPlaying = useSpeechPlayback(ownLineOwner) !== null;
  const statusLine = !started ? "" : !partnerReady ? t("lessonActivities.readAloud.preparingDialogue")
    : playing ? t("lessonActivities.readAloud.playing")
      : active ? t("lessonActivities.readAloud.yourTurn", { speaker: active.speaker }) : "";

  return <Surface className={styles.panel}>
    <div ref={regionRef} className={styles.panel}>
      {!started ? <>
        <Radio.Group label={t("lessonActivities.readAloud.chooseReader")} description={t("lessonActivities.readAloud.chooseReaderHint")} value={choice} onChange={setChoice}>
          <div className={styles.actions}>
            {speakers.map((speaker) => <RadioField key={speaker} value={speaker} label={speaker} />)}
            <RadioField value={ALL} label={t("lessonActivities.readAloud.allLines")} />
          </div>
        </Radio.Group>
        <div className={styles.actions}><Button loading={starting} disabled={starting} onClick={() => void start()}>{t("lessonActivities.startDialogue")}</Button></div>
      </> : active ? <>
        <p className={styles.hint} role="status" aria-live="polite">{statusLine}</p>
        {voiced.map((line) => <VoicedLine key={line.id} line={line} language={language} playing={line.id === playingLineId} disabled={holding} onReplay={() => play(replayOwner, line)} />)}
        {(partner?.unavailable || audioFailed || replayFailed) && <p className={styles.notice} role="status">{t("lessonActivities.readAloud.audioUnavailable")}</p>}
        <p className={styles.hint}>{t("lessonActivities.speaking.progress", { n: cursor + 1, total: ownLines.length })}</p>
        <OwnLine key={active.id} endpoint={endpoint} runId={runId} line={active} busy={busy} language={language} last={isLastLine}
          advancing={advancing} onContinue={onContinue} onHoldChange={setHolding} onListen={() => play(ownLineOwner, active)} backToLesson={backToLesson} listening={ownPlaying} />
        {trailing.length > 0 && <>
          <p className={styles.hint}>{t("lessonActivities.readAloud.afterLast")}</p>
          {trailing.map((line) => <VoicedLine key={line.id} line={line} language={language} playing={false} disabled={holding} onReplay={() => play(replayOwner, line)} />)}
        </>}
      </> : null}
    </div>
  </Surface>;
}

function VoicedLine({ line, language, playing, disabled, onReplay }: { line: ReadAloudLine; language: string | undefined; playing: boolean; disabled: boolean; onReplay: () => void }) {
  const { t } = useTranslation();
  return <div className={styles.turn} data-playing={playing || undefined} aria-current={playing || undefined}>
    <strong>{line.speaker}</strong>
    <p lang={language}>{line.dutchText}</p>
    <div className={styles.actions}>
      <Button variant="quiet" disabled={disabled} aria-label={t("lessonActivities.readAloud.replayLine", { speaker: line.speaker })} onClick={onReplay}>
        <Volume2 aria-hidden="true" />{t("lessonActivities.readAloud.replay")}
      </Button>
    </div>
  </div>;
}

type OwnLineProps = {
  endpoint: string; runId: string; line: ReadAloudLine; busy: boolean; language: string | undefined; last: boolean; advancing: boolean;
  onContinue: () => void; onHoldChange: (holding: boolean) => void; onListen: () => void; backToLesson: ReactNode; listening: boolean;
};

// The learner's line, shown in Dutch to read aloud. Only Send submits: a hold fills the editable draft, and releasing never sends.
function OwnLine({ endpoint, runId, line, busy, language, last, advancing, onContinue, onHoldChange, onListen, backToLesson, listening: ownPlaying }: OwnLineProps) {
  const { t } = useTranslation();
  const hintId = useId();
  const [draft, setDraft] = useState("");
  // The transcript the draft came from. A draft that still equals it is sent as spoken; an edited one is sent as typed.
  const [spoken, setSpoken] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  // The pronunciation of the sent line, when the spoken line was assessed and sent unedited.
  const [scored, setScored] = useState<PronunciationAssessment | null>(null);
  const [threw, setThrew] = useState(false);
  const holdingRef = useRef(false);
  const attempt = useAnswerAttempt(endpoint, runId, line.id, () => undefined);
  const result = attempt.result;

  // The recognizer gets the exact line as the reference, so Microsoft assesses against it. Matching is the server's, not this hook's.
  const listen = useSpokenAnswer(line.dutchText, (heard) => { setDraft(heard.heard); setSpoken(heard.heard); setAssessment(heard.assessment); }, undefined, SENTENCE_ANSWER_WINDOW);
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
  // Hidden tab: stop capturing. Unmounting (a new line, route change) also stops it: the recognition hook cancels on unmount.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") releaseRef.current(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); };
  }, []);
  useEffect(() => () => { if (holdingRef.current) { holdingRef.current = false; onHoldChange(false); } }, []);

  const sendAnswer = () => {
    const text = draft.trim();
    if (!text || listening || busy) return;
    const fromSpeech = spoken !== null && draft === spoken;
    setScored(fromSpeech && assessment && !unscored(assessment) ? assessment : null);
    attempt.check({ kind: "text", text }, fromSpeech ? "spoken" : "typed");
  };
  const retry = () => { attempt.retry(); setDraft(""); setSpoken(null); setAssessment(null); setScored(null); };

  const notice = !listen.available ? t("lessonActivities.readAloud.unavailable")
    : threw || listen.status === "failed" ? t("lessonActivities.readAloud.failed")
      : listen.status === "blocked" ? t("lessonActivities.readAloud.blocked")
        : listen.status === "noSpeech" ? t("lessonActivities.readAloud.noSpeech") : "";
  const listenHint = !listening ? "" : listen.status === "preparing" ? t("lessonActivities.readAloud.listen.preparing")
    : listen.status === "checking" ? t("lessonActivities.readAloud.listen.checking")
      : listen.status === "hearing" ? (listen.interim ? t("lessonActivities.readAloud.listen.heardSoFar", { interim: listen.interim }) : t("lessonActivities.readAloud.listen.hearing"))
        : listen.quiet ? t("lessonActivities.readAloud.listen.quiet") : t("lessonActivities.readAloud.listen.listening");

  return <div data-focus-target tabIndex={-1} className={styles.panel}>
    {busy ? null : <div className={styles.cue}>
      <span className={styles.hint}>{t("lessonActivities.readAloud.lineHeading", { speaker: line.speaker })}</span>
      <p lang={language}>{line.dutchText}</p>
    </div>}
    <TextAreaField className={styles.draft} label={t("lessonActivities.yourTurn")} value={draft} disabled={result !== null}
      onChange={(event) => setDraft(event.currentTarget.value)} autosize minRows={2} />
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
      <Button variant="quiet" disabled={busy} loading={ownPlaying} onClick={onListen}><Volume2 aria-hidden="true" />{t("lessonActivities.listen")}</Button>
    </div>}
    {!result && <p id={hintId} className={styles.hint}>{t("lessonActivities.readAloud.holdHint")}</p>}
    {!result && listenHint && <p className={styles.hint} role="status" aria-live="polite">{listenHint}</p>}
    {!result && spoken !== null && <p className={styles.hint} role="status">{t("lessonActivities.readAloud.draftFromSpeech")}</p>}
    {!result && notice && <p className={styles.notice} role="status">{notice}</p>}
    {result && <div className={styles.feedback} role="status">
      <strong>{result.correct ? t("lessonActivities.correct") : t("lessonActivities.differentLine")}</strong>
      {!result.correct && result.reference && <p>{t("lessonActivities.speaking.original", { text: result.reference })}</p>}
      {scored && <div className={styles.score}>
        <p>{t("lessonActivities.readAloud.pronunciation")}</p>
        <ScoreRing score={scored.overall} compact />
        <AssessmentBreakdown assessment={scored} />
      </div>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={retry}>{t("lessonActivities.retry")}</Button>
        <Button variant="secondary" loading={ownPlaying} onClick={onListen}><Volume2 aria-hidden="true" />{t("lessonActivities.listen")}</Button>
        <Button loading={advancing} disabled={advancing} onClick={onContinue}>{last ? t("lessonActivities.finish") : t("lessonActivities.continue")}</Button>
        {last && backToLesson}
      </div>
    </div>}
    {attempt.error && <p className={styles.alert} role="alert">{t("lessonActivities.answerFailed")}</p>}
  </div>;
}
