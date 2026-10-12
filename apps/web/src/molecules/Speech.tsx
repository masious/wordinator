import type { CourseLesson } from "@wordinator/contracts/lesson-document";
import { Square, Volume2, VolumeX } from "lucide-react";
import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./Speech.module.css";

// Lesson speech playback (docs/speech.md#playback). One audio element serves the whole page, so one clip plays at a time:
// starting any clip stops the current one. A playback has an owner (the button or dialogue that started it) and a queue of clip
// URLs played in order; a dialogue queues its turns and can pause, resume, and start at any turn, every other button queues one clip.
export type SpeechPlayback = { owner: string; index: number; status: "loading" | "playing" | "paused" | "error" };

let audio: HTMLAudioElement | null = null;
let queue: readonly string[] = [];
let playback: SpeechPlayback | null = null;
// How far the current clip has played, from 0 to 1. Kept apart from `playback` so its frequent updates re-render only the
// components that show it.
let elapsed = 0;
const elapsedListeners = new Set<() => void>();
// Raised on every start and stop, so a play() promise or media event of an earlier clip never touches the current one.
let generation = 0;
const listeners = new Set<() => void>();

function publish(next: SpeechPlayback | null) {
  playback = next;
  for (const listener of listeners) listener();
}

function publishElapsed(next: number) {
  if (next === elapsed) return;
  elapsed = next;
  for (const listener of elapsedListeners) listener();
}

function element() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("playing", () => {
    if (playback?.status === "loading") publish({ ...playback, status: "playing" });
  });
  audio.addEventListener("timeupdate", () => {
    const duration = audio?.duration ?? 0;
    if (playback && Number.isFinite(duration) && duration > 0) publishElapsed(Math.min(1, audio!.currentTime / duration));
  });
  audio.addEventListener("ended", () => {
    if (!playback || playback.status === "error") return;
    publishElapsed(1);
    if (playback.index + 1 < queue.length) start(playback.owner, playback.index + 1);
    else stopSpeech();
  });
  audio.addEventListener("error", () => {
    if (playback && playback.status !== "error" && audio?.getAttribute("src")) fail(generation);
  });
  return audio;
}

function fail(run: number) {
  if (run !== generation || !playback) return;
  publish({ ...playback, status: "error" });
}

function start(owner: string, index: number) {
  const run = ++generation;
  const player = element();
  publish({ owner, index, status: "loading" });
  publishElapsed(0);
  player.src = queue[index]!;
  // An interrupted play() rejects with AbortError; that is a stop, not a failure.
  player.play().catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === "AbortError")) fail(run);
  });
}

// Plays `urls` in order for `owner` from `from`, stopping whatever plays now.
export function playSpeech(owner: string, urls: readonly string[], from = 0) {
  if (!urls[from]) return;
  queue = urls;
  start(owner, from);
}

// Pauses the current clip where it is; `resumeSpeech` carries on from there and through the rest of the queue.
export function pauseSpeech() {
  if (!playback || (playback.status !== "loading" && playback.status !== "playing")) return;
  generation += 1;
  audio?.pause();
  publish({ ...playback, status: "paused" });
}

export function resumeSpeech() {
  if (playback?.status !== "paused" || !audio) return;
  const run = ++generation;
  publish({ ...playback, status: "loading" });
  audio.play().catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === "AbortError")) fail(run);
  });
}

export function stopSpeech() {
  generation += 1;
  queue = [];
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  publish(null);
  publishElapsed(0);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => playback;

// The playback of `owner`, or null while it plays nothing.
export function useSpeechPlayback(owner: string) {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  return current?.owner === owner ? current : null;
}

const subscribeElapsed = (listener: () => void) => {
  elapsedListeners.add(listener);
  return () => { elapsedListeners.delete(listener); };
};
const elapsedSnapshot = () => elapsed;

// How far the owner's current clip has played, from 0 to 1; 0 while the owner plays nothing.
export function useSpeechElapsed(owner: string) {
  const value = useSyncExternalStore(subscribeElapsed, elapsedSnapshot, elapsedSnapshot);
  return useSpeechPlayback(owner) ? value : 0;
}

// Stops the owner's playback when the component that started it unmounts, such as a player step moving on.
export function useStopSpeechOnUnmount(owner: string) {
  useEffect(() => () => { if (playback?.owner === owner) stopSpeech(); }, [owner]);
}

// Surfaces that show lesson items say where their ready clips are. Outside a scope, or for an item whose clip is not ready, no
// speaker button renders.
type ResolveSpeech = (key: string) => string | null;
const SpeechScopeContext = createContext<ResolveSpeech | null>(null);

export function SpeechScope({ resolve, children }: { resolve: ResolveSpeech; children: ReactNode }) {
  return <SpeechScopeContext.Provider value={resolve}>{children}</SpeechScopeContext.Provider>;
}

// Resolves item keys to clip URLs in the current scope, for a component that needs several.
export function useSpeechResolver(): ResolveSpeech {
  return useContext(SpeechScopeContext) ?? noSpeech;
}
const noSpeech: ResolveSpeech = () => null;

// The clip URL of an item key in the current scope: `word:{id}`, `wordExample:{id}`, `example:{blockId}`, or `turn:{blockId}:{index}`.
export function useSpeechUrl(key: string) {
  return useContext(SpeechScopeContext)?.(key) ?? null;
}

// The ready clips of the document a lesson shows: the published document's, or for an editor's draft preview the ready items of
// the draft.
export function lessonSpeech(lesson: Pick<CourseLesson, "document" | "speech" | "draftSpeech">): Record<string, string> {
  if (lesson.document) return lesson.speech;
  return Object.fromEntries(Object.entries(lesson.draftSpeech ?? {}).flatMap(([key, item]) => item.url ? [[key, item.url]] : []));
}

// A failed clip stops its playback and is reported for five seconds, or until the next attempt clears it.
export function useSpeechFailure(status: SpeechPlayback["status"] | undefined) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (status !== "error") return;
    setFailed(true); stopSpeech();
  }, [status]);
  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => setFailed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [failed]);
  return [failed, setFailed] as const;
}

export function SpeechFailure() {
  const { t } = useTranslation();
  return <span className={styles.error} role="alert">{t("courses.speech.failed")}</span>;
}

// A speaker button for one clip: pressed while its clip loads or plays, and pressing it again stops it. A clip that cannot play
// says so beside the button for a few seconds. Renders nothing without a URL.
export function SpeechButton({ url, label, owner, className }: { url: string | null | undefined; label: string; owner?: string; className?: string }) {
  const fallback = useId(); const id = owner ?? fallback;
  const current = useSpeechPlayback(id);
  useStopSpeechOnUnmount(id);
  const status = current?.status;
  const [failed, setFailed] = useSpeechFailure(status);
  if (!url) return null;
  const active = status === "loading" || status === "playing";
  return <span className={`${styles.wrap} ${className ?? ""}`}>
    <button type="button" className={styles.button} aria-label={label} aria-pressed={active} aria-busy={status === "loading" || undefined}
      data-status={status ?? "idle"} onClick={() => { setFailed(false); if (active) stopSpeech(); else playSpeech(id, [url]); }}>
      {status === "playing" ? <Square aria-hidden="true" className={styles.icon} /> : <Volume2 aria-hidden="true" className={styles.icon} />}
    </button>
    {failed && <SpeechFailure />}
  </span>;
}

// Whether revealing a word card or a drill card speaks its term (docs/words.md#word-cards). On by default and remembered on the
// device; storage that cannot be read or written leaves it on for this visit.
export const REVEAL_SOUND_STORAGE_KEY = "wordinator:reveal-sound:v1";
const revealSoundListeners = new Set<() => void>();
let revealSound: boolean | null = null;

function readRevealSound() {
  if (revealSound !== null) return revealSound;
  try { revealSound = localStorage.getItem(REVEAL_SOUND_STORAGE_KEY) !== "off"; } catch { revealSound = true; }
  return revealSound;
}

export function setRevealSound(on: boolean) {
  revealSound = on;
  try { localStorage.setItem(REVEAL_SOUND_STORAGE_KEY, on ? "on" : "off"); } catch { /* Kept for this visit only. */ }
  for (const listener of revealSoundListeners) listener();
}

// Forgets the cached preference, so the next read comes from storage again. For tests.
export function resetRevealSound() { revealSound = null; }

const subscribeRevealSound = (listener: () => void) => {
  revealSoundListeners.add(listener);
  return () => { revealSoundListeners.delete(listener); };
};

export function useRevealSound() {
  return useSyncExternalStore(subscribeRevealSound, readRevealSound, readRevealSound);
}

// Plays a revealed term for `owner` when the reveal sound is on and the clip is ready; otherwise the reveal stays silent.
export function playRevealSpeech(owner: string, url: string | null | undefined) {
  if (url && readRevealSound()) playSpeech(owner, [url]);
}

// The reveal sound toggle beside a recap's counter: pressed while revealing speaks the term.
export function RevealSoundToggle() {
  const { t } = useTranslation();
  const on = useRevealSound();
  return <button type="button" className={styles.button} aria-label={t("courses.speech.revealSound")} aria-pressed={on}
    onClick={() => setRevealSound(!on)}>
    {on ? <Volume2 aria-hidden="true" className={styles.icon} /> : <VolumeX aria-hidden="true" className={styles.icon} />}
  </button>;
}
