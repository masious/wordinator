import type { SpeechRecognitionTokenResponse } from "@wordinator/contracts";
import { wordSearchKey } from "@wordinator/contracts/lesson-document";
import { createContext, createElement, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { stopSpeech } from "./Speech";

// Spoken answers on drill and word cards (docs/words.md#spoken-answers). Two exchangeable recognizers listen for one utterance:
// the browser's own Web Speech API (Chrome, Edge, Safari), and Microsoft Azure through its Speech SDK with a short-lived token
// from the API (docs/words.md#recognizers). The learner picks one per device in settings; the browser's is the default, and
// where the browser has none, Microsoft is used.

// The recognition locale of each library language, matching the accents of its speech voices (docs/speech.md#voices).
export const RECOGNITION_LOCALES = { nl: "nl-NL", de: "de-DE" } as const;

export type Recognizer = "browser" | "microsoft";
// Microsoft's pronunciation assessment of an answer against the term (docs/words.md#pronunciation-assessment), scored 0–100.
// Dutch and German get whole-answer and per-word scores; prosody, syllables, and phoneme names are English-only and not asked for.
export type WordAssessment = { word: string; accuracy: number | null; error: "none" | "mispronunciation" | "omission" | "insertion" };
export type PronunciationAssessment = { overall: number; accuracy: number; fluency: number; completeness: number; words: WordAssessment[] };
// What a recognizer heard. Only a recognizer that assesses pronunciation (Microsoft) fills `assessment`; the browser's leaves it null.
export type SpokenAnswer = { heard: string; matches: boolean; assessment: PronunciationAssessment | null };
// While a listen runs it moves through phases (docs/words.md#listening-feedback): preparing (microphone, token, and connection),
// listening (ready, waiting for speech), hearing (speech detected), and checking (speech ended, the answer is being worked out).
export type ListenPhase = "preparing" | "listening" | "hearing" | "checking";
export type ListenStatus = "idle" | ListenPhase | "noSpeech" | "blocked" | "failed";
type ListenOutcome = Exclude<ListenStatus, ListenPhase>;
export const isListening = (status: ListenStatus): status is ListenPhase =>
  status === "preparing" || status === "listening" || status === "hearing" || status === "checking";

// ---- Choosing a recognizer ----

export const RECOGNIZER_STORAGE_KEY = "wordinator:speech-recognizer:v1";
const recognizerListeners = new Set<() => void>();

function readRecognizer(): Recognizer {
  try { return localStorage.getItem(RECOGNIZER_STORAGE_KEY) === "microsoft" ? "microsoft" : "browser"; } catch { return "browser"; }
}

export function setRecognizer(recognizer: Recognizer) {
  try {
    if (recognizer === "browser") localStorage.removeItem(RECOGNIZER_STORAGE_KEY); else localStorage.setItem(RECOGNIZER_STORAGE_KEY, recognizer);
  } catch { /* Storage can be unavailable; the choice then lasts until reload at most. */ }
  for (const listener of recognizerListeners) listener();
}

const subscribeRecognizer = (listener: () => void) => {
  recognizerListeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === RECOGNIZER_STORAGE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { recognizerListeners.delete(listener); window.removeEventListener("storage", onStorage); };
};

// The learner's choice on this device.
export function useRecognizerPreference(): Recognizer {
  return useSyncExternalStore(subscribeRecognizer, readRecognizer, () => "browser");
}

// The slice of the Web Speech API used here; TypeScript's DOM library does not declare it.
type RecognitionAlternative = { readonly transcript: string };
type RecognitionResultEvent = { readonly results: ArrayLike<ArrayLike<RecognitionAlternative> & { readonly isFinal?: boolean }> };
type RecognitionErrorEvent = { readonly error: string };
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onaudiostart?: (() => void) | null; onspeechstart?: (() => void) | null; onspeechend?: (() => void) | null;
  start(): void; abort(): void; stop(): void;
};
type RecognitionConstructor = new () => Recognition;

const recognitionConstructor = (): RecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
};

export const browserRecognitionSupported = () => recognitionConstructor() !== null;
export const microsoftRecognitionSupported = () => typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

// The recognizer that will listen: the preference, except that a browser without its own recognition uses Microsoft. Null when
// neither can run here.
export function effectiveRecognizer(preference: Recognizer): Recognizer | null {
  if (preference === "browser" && browserRecognitionSupported()) return "browser";
  if (microsoftRecognitionSupported()) return "microsoft";
  return browserRecognitionSupported() ? "browser" : null;
}

// ---- Where answers are heard ----

// A surface that listens says in which locale, and how to get a Microsoft token (docs/words.md#recognizers). Outside a scope,
// nothing listens.
export type TokenSource = { get: () => Promise<SpeechRecognitionTokenResponse>; forget: () => void };
// The lesson word a spoken term belongs to, when the surface knows it.
export type AssessedWord = { lessonId: string; wordId: string };
// `onAssessment` gets each pronunciation assessment with the reference text it was scored against, so the surface can store it
// (docs/words.md#pronunciation-assessment). Only a recognizer that assesses (Microsoft) calls it.
export type AssessmentHandler = (referenceText: string, assessment: PronunciationAssessment, word: AssessedWord | undefined) => void;
type RecognitionScopeValue = { locale: string; token: TokenSource; onAssessment?: AssessmentHandler };
const RecognitionScopeContext = createContext<RecognitionScopeValue | null>(null);

export function SpeechRecognitionScope({ locale, token, onAssessment, children }: { locale: string | null; token: TokenSource; onAssessment?: AssessmentHandler; children: ReactNode }) {
  return createElement(RecognitionScopeContext.Provider, { value: locale ? { locale, token, onAssessment } : null }, children);
}

// ---- Matching ----

// Leading articles are optional on either side: "kaartje" answers "het kaartje", and "het kaartje" answers "kaartje".
const LEADING_ARTICLE = /^(?:de|het|een|der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines) (?=\S)/;
// Punctuation and ellipses are not spoken, so letters and digits are all that is compared.
const spokenKey = (value: string) => wordSearchKey(value.replace(/[^\p{L}\p{N}]+/gu, " ")).replace(LEADING_ARTICLE, "");

// Whether any of the recognizer's alternatives says the term, compared by search key without punctuation or a leading article.
export function matchesTerm(transcripts: readonly string[], term: string): boolean {
  const expected = spokenKey(term);
  return expected !== "" && transcripts.some((transcript) => spokenKey(transcript) === expected);
}

// ---- Microphone ----

// Speech recognizers take 16 kHz, 16-bit, mono PCM.
const PCM_RATE = 16_000;
// A tap on the capture that hands its raw samples to the main thread. Loaded from a blob, so it needs no separate file.
const PCM_TAP = `registerProcessor("wordinator-pcm-tap", class extends AudioWorkletProcessor {
  process(inputs) { const channel = inputs[0] && inputs[0][0]; if (channel) this.port.postMessage(channel.slice(0)); return true; }
});`;

// One microphone capture per listen (docs/words.md#listening-feedback), with the browser's echo cancellation, noise suppression,
// and automatic gain, so sound from the device's own speakers and steady background noise reach the recognizer as little as
// possible. It reports the level (0–1) about sixty times a second, and, for a recognizer fed by the app (Microsoft), 16 kHz PCM.
type Capture = { stream: MediaStream; onLevel: (listener: (level: number) => void) => void; onPcm: ((listener: (pcm: ArrayBuffer) => void) => void) | null; close: () => void };

class MicrophoneBlocked extends Error {}

async function openCapture(): Promise<Capture | null> {
  if (!microsoftRecognitionSupported()) return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch { throw new MicrophoneBlocked(); }
  const AudioContextClass = typeof window === "undefined" ? undefined : window.AudioContext;
  let context: AudioContext | null = null; let frame = 0; let closed = false;
  let levelListener: ((level: number) => void) | null = null; let pcmListener: ((pcm: ArrayBuffer) => void) | null = null;
  let tap: AudioWorkletNode | null = null;
  if (AudioContextClass) {
    try {
      context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const read = () => {
        if (closed) return;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        // Speech sits around 0.02–0.2 RMS; this curve spreads it over the range.
        levelListener?.(Math.min(1, Math.sqrt(Math.sqrt(sum / samples.length)) * 1.6));
        frame = requestAnimationFrame(read);
      };
      read();
      if (context.audioWorklet && typeof AudioWorkletNode !== "undefined") {
        const url = URL.createObjectURL(new Blob([PCM_TAP], { type: "text/javascript" }));
        try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        tap = new AudioWorkletNode(context, "wordinator-pcm-tap");
        const resample = pcmResampler(context.sampleRate);
        tap.port.onmessage = (event: MessageEvent<Float32Array>) => { if (pcmListener) pcmListener(resample(event.data)); };
        source.connect(tap);
      }
    } catch { tap = null; }
  }
  return {
    stream,
    onLevel: (listener) => { levelListener = listener; },
    onPcm: tap ? (listener) => { pcmListener = listener; } : null,
    close: () => {
      closed = true; levelListener = null; pcmListener = null;
      cancelAnimationFrame(frame);
      tap?.port.close();
      for (const track of stream.getTracks()) track.stop();
      void context?.close().catch(() => undefined);
    },
  };
}

// Turns float samples at the capture's rate into 16 kHz, 16-bit PCM, averaging the samples each output sample covers and carrying
// the fractional remainder between chunks.
export function pcmResampler(inputRate: number) {
  const step = inputRate / PCM_RATE;
  let position = 0;
  return (input: Float32Array): ArrayBuffer => {
    const output = new Int16Array(Math.max(0, Math.floor((input.length - position) / step) + 1));
    let count = 0;
    for (; position < input.length && count < output.length; position += step, count++) {
      const from = Math.floor(position); const to = Math.min(input.length, Math.max(from + 1, Math.floor(position + step)));
      let sum = 0;
      for (let index = from; index < to; index++) sum += input[index]!;
      const sample = Math.max(-1, Math.min(1, sum / (to - from)));
      output[count] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    position -= input.length;
    return output.buffer.slice(0, count * 2);
  };
}

// ---- Listening ----

// One utterance: `onPhase` follows its progress and `onInterim` what has been heard so far; `onAlternatives` gets what was heard,
// best first, with an assessment when the recognizer gives one; `onEnd` comes once, last. `finish` ends the audio and keeps what
// was said so far; `cancel` drops it.
type Handlers = {
  onPhase: (phase: Exclude<ListenPhase, "preparing">) => void; onInterim: (text: string) => void;
  onAlternatives: (alternatives: string[], assessment: PronunciationAssessment | null) => void; onEnd: (outcome: ListenOutcome) => void;
};
type Session = { finish: () => void; cancel: () => void };

// The browser's recognizer captures the microphone itself; the app's capture only drives the meter and endpointing beside it.
function listenWithBrowser(locale: string, handlers: Handlers): Session {
  const recognition = new (recognitionConstructor()!)();
  recognition.lang = locale; recognition.interimResults = true; recognition.continuous = false; recognition.maxAlternatives = 5;
  let outcome: ListenOutcome = "noSpeech";
  recognition.onaudiostart = () => handlers.onPhase("listening");
  recognition.onspeechstart = () => handlers.onPhase("hearing");
  recognition.onspeechend = () => handlers.onPhase("checking");
  recognition.onresult = (event) => {
    const result = event.results[0];
    const alternatives = Array.from(result ?? [], (alternative) => alternative.transcript.trim()).filter(Boolean);
    if (!alternatives.length) return;
    if (result?.isFinal === false) { handlers.onPhase("hearing"); handlers.onInterim(alternatives[0]!); return; }
    outcome = "idle";
    handlers.onAlternatives(alternatives, null);
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted") outcome = "idle";
    else if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") outcome = "blocked";
    else if (event.error !== "no-speech") outcome = "failed";
  };
  recognition.onend = () => handlers.onEnd(outcome);
  try { recognition.start(); } catch { handlers.onEnd("failed"); }
  // stop() asks for a final result from the audio so far; abort() drops it.
  return { finish: () => recognition.stop(), cancel: () => recognition.abort() };
}

// Azure's detailed result lists alternatives (NBest), each with its display and lexical form.
function azureAlternatives(json: string | undefined, fallback: string): string[] {
  try {
    const parsed = JSON.parse(json ?? "") as { NBest?: Array<{ Display?: unknown; Lexical?: unknown }> };
    const forms = (parsed.NBest ?? []).flatMap((best) => [best.Display, best.Lexical]).filter((form): form is string => typeof form === "string");
    const alternatives = [...new Set([fallback, ...forms].map((form) => form.trim()).filter(Boolean))];
    if (alternatives.length) return alternatives;
  } catch { /* Fall back to the result text. */ }
  return fallback.trim() ? [fallback.trim()] : [];
}

const score = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : null;
const ERRORS = { None: "none", Mispronunciation: "mispronunciation", Omission: "omission", Insertion: "insertion" } as const;

// The assessment in Azure's detailed result: scores on the best alternative (inside `PronunciationAssessment`, or directly on it
// in older responses) and on each of its words. Null when the result carries none.
export function readAssessment(json: string | undefined): PronunciationAssessment | null {
  type Scores = { AccuracyScore?: unknown; FluencyScore?: unknown; CompletenessScore?: unknown; PronScore?: unknown; ErrorType?: unknown };
  type Best = Scores & { PronunciationAssessment?: Scores; Words?: Array<Scores & { Word?: unknown; PronunciationAssessment?: Scores }> };
  let best: Best | undefined;
  try { best = (JSON.parse(json ?? "") as { NBest?: Best[] }).NBest?.[0]; } catch { return null; }
  if (!best) return null;
  const totals = best.PronunciationAssessment ?? best;
  const overall = score(totals.PronScore); const accuracy = score(totals.AccuracyScore);
  const fluency = score(totals.FluencyScore); const completeness = score(totals.CompletenessScore);
  if (overall === null || accuracy === null || fluency === null || completeness === null) return null;
  const words = (best.Words ?? []).flatMap((entry): WordAssessment[] => {
    const scores = entry.PronunciationAssessment ?? entry;
    if (typeof entry.Word !== "string" || !entry.Word) return [];
    const error = typeof scores.ErrorType === "string" && scores.ErrorType in ERRORS ? ERRORS[scores.ErrorType as keyof typeof ERRORS] : "none";
    return [{ word: entry.Word, accuracy: error === "omission" ? null : score(scores.AccuracyScore), error }];
  });
  return { overall, accuracy, fluency, completeness, words };
}

// The term as Azure should expect it spoken: letters, digits, apostrophes, and hyphens, without the punctuation and ellipses that
// a phrase such as "Zullen we …?" carries.
const referenceText = (term: string) => term.replace(/[^\p{L}\p{N}'’-]+/gu, " ").trim();

// Microsoft hears the app's own capture through a push stream, so the app decides when the audio ends: closing the stream makes
// Azure recognize and assess what it has, which is how finishing early keeps the word.
function listenWithMicrosoft(locale: string, token: TokenSource, term: string, capture: Capture, handlers: Handlers): Session {
  let cancelled = false; let ended = false;
  let close: (() => void) | null = null; let endAudio: (() => void) | null = null;
  const end = (outcome: ListenOutcome) => { if (ended) return; ended = true; close?.(); handlers.onEnd(cancelled ? "idle" : outcome); };
  void (async () => {
    let sdk: typeof import("microsoft-cognitiveservices-speech-sdk");
    let access: SpeechRecognitionTokenResponse;
    try { [sdk, access] = await Promise.all([import("microsoft-cognitiveservices-speech-sdk"), token.get()]); } catch { end("failed"); return; }
    if (cancelled) { end("idle"); return; }
    const config = sdk.SpeechConfig.fromAuthorizationToken(access.token, access.region);
    config.speechRecognitionLanguage = locale;
    config.outputFormat = sdk.OutputFormat.Detailed;
    let audio: import("microsoft-cognitiveservices-speech-sdk").AudioConfig;
    if (capture.onPcm) {
      const push = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(PCM_RATE, 16, 1));
      let open = true;
      capture.onPcm((pcm) => { if (open && pcm.byteLength) push.write(pcm); });
      endAudio = () => { if (!open) return; open = false; push.close(); };
      audio = sdk.AudioConfig.fromStreamInput(push);
    } else {
      // Without an audio worklet the SDK reads the processed stream itself; finishing early then stops the recognizer.
      audio = sdk.AudioConfig.fromStreamInput(capture.stream);
    }
    const recognizer = new sdk.SpeechRecognizer(config, audio);
    // Scripted assessment against the term: whole-answer and per-word scores, and missed or extra words (miscue).
    const reference = referenceText(term);
    if (reference) {
      sdk.PronunciationAssessmentConfig.fromJSON(JSON.stringify({ referenceText: reference, gradingSystem: "HundredMark", granularity: "Word", enableMiscue: true }))
        .applyTo(recognizer);
    }
    close = () => { endAudio?.(); try { recognizer.close(); } catch { /* Already closed. */ } };
    recognizer.sessionStarted = () => handlers.onPhase("listening");
    recognizer.speechStartDetected = () => handlers.onPhase("hearing");
    recognizer.recognizing = (_sender, event) => { const text = event.result.text.trim(); if (text) { handlers.onPhase("hearing"); handlers.onInterim(text); } };
    recognizer.speechEndDetected = () => handlers.onPhase("checking");
    if (!endAudio) endAudio = () => { try { recognizer.close(); } catch { /* Already closed. */ } end("noSpeech"); };
    recognizer.recognizeOnceAsync((result) => {
      if (result.reason === sdk.ResultReason.RecognizedSpeech) {
        const json = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
        const alternatives = azureAlternatives(json, result.text);
        if (alternatives.length && !cancelled) { handlers.onAlternatives(alternatives, reference ? readAssessment(json) : null); end("idle"); } else end("noSpeech");
      } else if (result.reason === sdk.ResultReason.NoMatch) end("noSpeech");
      else {
        const code = sdk.CancellationDetails.fromResult(result).ErrorCode;
        if (code === sdk.CancellationErrorCode.AuthenticationFailure || code === sdk.CancellationErrorCode.Forbidden) token.forget();
        // Ending the audio early can surface as an end-of-stream cancellation; it still means nothing was recognized.
        end(code === sdk.CancellationErrorCode.NoError ? "noSpeech" : "failed");
      }
    }, () => end("failed"));
  })();
  return {
    finish: () => { if (endAudio) endAudio(); else { cancelled = true; end("idle"); } },
    cancel: () => { cancelled = true; end("idle"); },
  };
}

// ---- Ending an answer ----

// How long the microphone can stay silent before the learner is nudged.
export const QUIET_NUDGE_MS = 3000;
const QUIET_LEVEL = 0.04;
// The app ends an answer itself rather than waiting on the recognizer's own silence detection, which steady noise can hold open:
// speech is sound above the measured background by SPEECH_MARGIN; the answer ends after END_SILENCE_MS back near the background,
// and at the latest MAX_ANSWER_MS after speech began. Terms are a word or a short phrase.
export const END_SILENCE_MS = 900;
export const MAX_ANSWER_MS = 6000;
const SPEECH_MARGIN = 0.12;
const MIN_LEVEL = 0.01;

// One recognition at a time for a card, in the surrounding scope's locale with the device's recognizer. `listen` starts it
// (stopping any playing clip, so the speaker is not heard back) or, while listening, finishes it with what was said so far;
// `onAnswer` gets the best alternative and whether any alternative matched. While it listens, `status` is its phase, `interim`
// what has been heard so far, and `quiet` whether the microphone has heard nothing for QUIET_NUDGE_MS; `meterRef` takes the
// element whose `--level` (0–1) follows the microphone. Unmounting the card cancels it. `available` is false outside a scope or
// where no recognizer can run.
export function useSpokenAnswer(term: string, onAnswer: (answer: SpokenAnswer) => void, word?: AssessedWord) {
  const scope = useContext(RecognitionScopeContext);
  const recognizer = effectiveRecognizer(useRecognizerPreference());
  const [status, setStatus] = useState<ListenStatus>("idle");
  const [interim, setInterim] = useState("");
  const [quiet, setQuiet] = useState(false);
  const run = useRef<{ finish: () => void; cancel: () => void } | null>(null);
  const meterElement = useRef<HTMLElement | null>(null);
  const latest = useRef(onAnswer);
  latest.current = onAnswer;
  useEffect(() => () => { const current = run.current; run.current = null; current?.cancel(); }, []);

  const listen = () => {
    if (!scope || !recognizer) return;
    if (run.current) { run.current.finish(); return; }
    stopSpeech();
    const locale = scope.locale; const token = scope.token; const onAssessment = scope.onAssessment;
    let session: Session | null = null; let capture: Capture | null = null;
    let phase: ListenPhase = "preparing"; let done = false; let finishing = false; let pendingFinish = false;
    let lastSound = Date.now(); let floor: number | null = null; let speechAt: number | null = null; let lastLoud = 0; let silent = false;
    const self = {
      finish: () => {
        if (finishing || done) return;
        if (!session) { pendingFinish = true; return; }
        finishing = true;
        if (phase === "hearing") handlers.onPhase("checking");
        session.finish();
      },
      cancel: () => { done = true; session?.cancel(); capture?.close(); },
    };
    const live = () => run.current === self && !done;
    const settle = (outcome: ListenOutcome) => {
      if (done) return;
      done = true; capture?.close(); meterElement.current?.style.removeProperty("--level");
      if (run.current !== self) return;
      run.current = null;
      setInterim(""); setQuiet(false); setStatus(outcome);
    };
    const handlers: Handlers = {
      onPhase: (next) => {
        if (!live() || next === phase) return;
        if (next === "listening" && phase !== "preparing") return;
        if (next !== "checking" && finishing) return;
        phase = next; lastSound = Date.now(); setStatus(next);
      },
      onInterim: (text) => { if (live()) setInterim(text); },
      onAlternatives: (alternatives, assessment) => {
        if (!live()) return;
        latest.current({ heard: alternatives[0]!, matches: matchesTerm(alternatives, term), assessment });
        // Stored after the card has shown it; a failed save is the handler's to ignore.
        if (assessment) onAssessment?.(referenceText(term), assessment, word);
      },
      onEnd: settle,
    };
    const onLevel = (level: number) => {
      if (!live()) return;
      meterElement.current?.style.setProperty("--level", level.toFixed(3));
      const now = Date.now();
      if (level >= QUIET_LEVEL) lastSound = now;
      const nextSilent = phase === "listening" && now - lastSound >= QUIET_NUDGE_MS;
      if (nextSilent !== silent) { silent = nextSilent; setQuiet(nextSilent); }
      // The background level, ignoring the digital silence a capture can start with: it drops to quieter moments at once, rises
      // toward steadier noise within a second or so, and barely moves while someone speaks.
      if (level < MIN_LEVEL) return;
      const loud = floor !== null && level > floor + SPEECH_MARGIN;
      floor = floor === null || level < floor ? level : floor + (level - floor) * (loud ? 0.002 : 0.05);
      if (loud) { lastLoud = now; speechAt ??= now; }
      if (speechAt !== null && !finishing && (now - lastLoud >= END_SILENCE_MS || now - speechAt >= MAX_ANSWER_MS)) self.finish();
    };
    run.current = self;
    setStatus("preparing"); setInterim(""); setQuiet(false);
    // The browser's recognizer captures the microphone itself and starts at once; the app's capture only meters beside it.
    // Microsoft hears the app's capture, so it starts once the capture is open, and a blocked microphone ends it.
    if (recognizer === "browser") session = listenWithBrowser(locale, handlers);
    void (async () => {
      try { capture = await openCapture(); } catch (error) {
        if (error instanceof MicrophoneBlocked && recognizer === "microsoft") { settle("blocked"); return; }
        capture = null;
      }
      if (done || run.current !== self) { capture?.close(); return; }
      capture?.onLevel(onLevel);
      if (recognizer === "browser") return;
      if (!capture) { settle("failed"); return; }
      session = listenWithMicrosoft(locale, token, term, capture, handlers);
      if (pendingFinish && !done) self.finish();
    })();
  };
  const meterRef = (element: HTMLElement | null) => { meterElement.current = element; };
  return { status, interim, quiet, listen, meterRef, available: scope !== null && recognizer !== null };
}
