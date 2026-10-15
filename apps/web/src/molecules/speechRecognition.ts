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
export type SpokenAnswer = { heard: string; matches: boolean };
export type ListenStatus = "idle" | "listening" | "noSpeech" | "blocked" | "failed";
type ListenOutcome = Exclude<ListenStatus, "listening">;

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
type RecognitionResultEvent = { readonly results: ArrayLike<ArrayLike<RecognitionAlternative>> };
type RecognitionErrorEvent = { readonly error: string };
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
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
type RecognitionScopeValue = { locale: string; token: TokenSource };
const RecognitionScopeContext = createContext<RecognitionScopeValue | null>(null);

export function SpeechRecognitionScope({ locale, token, children }: { locale: string | null; token: TokenSource; children: ReactNode }) {
  return createElement(RecognitionScopeContext.Provider, { value: locale ? { locale, token } : null }, children);
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

// ---- Listening ----

// One utterance: `onAlternatives` gets what was heard, best first; `onEnd` comes once, last. `stop` ends early.
type Handlers = { onAlternatives: (alternatives: string[]) => void; onEnd: (outcome: ListenOutcome) => void };
type Session = { stop: () => void };

function listenWithBrowser(locale: string, handlers: Handlers): Session {
  const recognition = new (recognitionConstructor()!)();
  recognition.lang = locale; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 5;
  let outcome: ListenOutcome = "noSpeech";
  recognition.onresult = (event) => {
    const alternatives = Array.from(event.results[0] ?? [], (alternative) => alternative.transcript.trim()).filter(Boolean);
    if (!alternatives.length) return;
    outcome = "idle";
    handlers.onAlternatives(alternatives);
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted") outcome = "idle";
    else if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") outcome = "blocked";
    else if (event.error !== "no-speech") outcome = "failed";
  };
  recognition.onend = () => handlers.onEnd(outcome);
  try { recognition.start(); } catch { handlers.onEnd("failed"); }
  return { stop: () => recognition.stop() };
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

function listenWithMicrosoft(locale: string, token: TokenSource, handlers: Handlers): Session {
  let stopped = false; let ended = false;
  let close: (() => void) | null = null;
  const end = (outcome: ListenOutcome) => { if (ended) return; ended = true; close?.(); handlers.onEnd(stopped ? "idle" : outcome); };
  void (async () => {
    // Asking for the microphone first tells a blocked microphone apart from a failing service.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch { end("blocked"); return; }
    if (stopped) { end("idle"); return; }
    let sdk: typeof import("microsoft-cognitiveservices-speech-sdk");
    let access: SpeechRecognitionTokenResponse;
    try { [sdk, access] = await Promise.all([import("microsoft-cognitiveservices-speech-sdk"), token.get()]); } catch { end("failed"); return; }
    if (stopped) { end("idle"); return; }
    const config = sdk.SpeechConfig.fromAuthorizationToken(access.token, access.region);
    config.speechRecognitionLanguage = locale;
    config.outputFormat = sdk.OutputFormat.Detailed;
    const recognizer = new sdk.SpeechRecognizer(config, sdk.AudioConfig.fromDefaultMicrophoneInput());
    close = () => { try { recognizer.close(); } catch { /* Already closed. */ } };
    recognizer.recognizeOnceAsync((result) => {
      if (result.reason === sdk.ResultReason.RecognizedSpeech) {
        const alternatives = azureAlternatives(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult), result.text);
        if (alternatives.length && !stopped) { handlers.onAlternatives(alternatives); end("idle"); } else end("noSpeech");
      } else if (result.reason === sdk.ResultReason.NoMatch) end("noSpeech");
      else {
        const code = sdk.CancellationDetails.fromResult(result).ErrorCode;
        if (code === sdk.CancellationErrorCode.AuthenticationFailure || code === sdk.CancellationErrorCode.Forbidden) token.forget();
        end("failed");
      }
    }, () => end("failed"));
  })();
  return { stop: () => { stopped = true; end("idle"); } };
}

// One recognition at a time for a card, in the surrounding scope's locale with the device's recognizer. `listen` starts it
// (stopping any playing clip, so the speaker is not heard back) or, while listening, stops it; `onAnswer` gets the best
// alternative and whether any alternative matched. Unmounting the card stops it. `available` is false outside a scope or where
// no recognizer can run.
export function useSpokenAnswer(term: string, onAnswer: (answer: SpokenAnswer) => void) {
  const scope = useContext(RecognitionScopeContext);
  const recognizer = effectiveRecognizer(useRecognizerPreference());
  const [status, setStatus] = useState<ListenStatus>("idle");
  const session = useRef<Session | null>(null);
  const latest = useRef(onAnswer);
  latest.current = onAnswer;
  useEffect(() => () => { const current = session.current; session.current = null; current?.stop(); }, []);

  const listen = () => {
    if (!scope || !recognizer) return;
    if (session.current) { session.current.stop(); return; }
    stopSpeech();
    let current: Session | null = null;
    const handlers: Handlers = {
      onAlternatives: (alternatives) => { if (session.current === current) latest.current({ heard: alternatives[0]!, matches: matchesTerm(alternatives, term) }); },
      onEnd: (outcome) => {
        // A recognizer can end before it returns, so its session is recognized by the `ended` flag as well.
        if (current === null) { ended = outcome; return; }
        if (session.current !== current) return;
        session.current = null;
        setStatus(outcome);
      },
    };
    let ended: ListenOutcome | null = null;
    setStatus("listening");
    current = recognizer === "browser" ? listenWithBrowser(scope.locale, handlers) : listenWithMicrosoft(scope.locale, scope.token, handlers);
    if (ended !== null) { setStatus(ended); return; }
    session.current = current;
  };
  return { status, listen, available: scope !== null && recognizer !== null };
}
