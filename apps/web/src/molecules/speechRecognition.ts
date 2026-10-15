import { wordSearchKey } from "@wordinator/contracts/lesson-document";
import { useEffect, useRef, useState } from "react";
import { stopSpeech } from "./Speech";

// Spoken answers on drill and word cards (docs/words.md#spoken-answers). Recognition is the browser's Web Speech API, so it
// exists only where the browser provides it (Chrome, Edge, Safari) and the browser decides where the audio is processed.

// The recognition locale of each library language, matching the accents of its speech voices (docs/speech.md#voices).
export const RECOGNITION_LOCALES = { nl: "nl-NL", de: "de-DE" } as const;

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

export const speechRecognitionSupported = () => recognitionConstructor() !== null;

// Leading articles are optional on either side: "kaartje" answers "het kaartje", and "het kaartje" answers "kaartje".
const LEADING_ARTICLE = /^(?:de|het|een|der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines) (?=\S)/;
// Punctuation and ellipses are not spoken, so letters and digits are all that is compared.
const spokenKey = (value: string) => wordSearchKey(value.replace(/[^\p{L}\p{N}]+/gu, " ")).replace(LEADING_ARTICLE, "");

// Whether any of the recognizer's alternatives says the term, compared by search key without punctuation or a leading article.
export function matchesTerm(transcripts: readonly string[], term: string): boolean {
  const expected = spokenKey(term);
  return expected !== "" && transcripts.some((transcript) => spokenKey(transcript) === expected);
}

export type SpokenAnswer = { heard: string; matches: boolean };
export type ListenStatus = "idle" | "listening" | "noSpeech" | "blocked" | "failed";

// One recognition at a time for a card: `listen` starts it (stopping any playing clip, so the speaker is not heard back), and
// `onAnswer` gets the best alternative and whether any alternative matched. Unmounting the card aborts it.
export function useSpokenAnswer(locale: string, term: string, onAnswer: (answer: SpokenAnswer) => void) {
  const [status, setStatus] = useState<ListenStatus>("idle");
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef(onAnswer);
  latest.current = onAnswer;
  useEffect(() => () => { recognition.current?.abort(); recognition.current = null; }, []);

  const listen = () => {
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    if (recognition.current) { recognition.current.stop(); return; }
    stopSpeech();
    const current = new Constructor();
    current.lang = locale; current.interimResults = false; current.continuous = false; current.maxAlternatives = 5;
    let outcome: ListenStatus = "noSpeech";
    current.onresult = (event) => {
      const alternatives = Array.from(event.results[0] ?? [], (alternative) => alternative.transcript.trim()).filter(Boolean);
      if (!alternatives.length) return;
      outcome = "idle";
      latest.current({ heard: alternatives[0]!, matches: matchesTerm(alternatives, term) });
    };
    current.onerror = (event) => {
      if (event.error === "aborted") outcome = "idle";
      else if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") outcome = "blocked";
      else if (event.error !== "no-speech") outcome = "failed";
    };
    current.onend = () => {
      if (recognition.current !== current) return;
      recognition.current = null;
      setStatus(outcome);
    };
    recognition.current = current;
    setStatus("listening");
    try { current.start(); } catch { recognition.current = null; setStatus("failed"); }
  };
  return { status, listen };
}
