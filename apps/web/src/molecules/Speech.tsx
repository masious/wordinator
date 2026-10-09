import type { CourseLesson } from "@wordinator/contracts/lesson-document";
import { Square, Volume2 } from "lucide-react";
import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./Speech.module.css";

// Lesson speech playback (docs/speech.md#playback). One audio element serves the whole page, so one clip plays at a time:
// starting any clip stops the current one. A playback has an owner (the button or dialogue that started it) and a queue of clip
// URLs played in order; Play dialogue queues its turns, every other button queues one clip.
export type SpeechPlayback = { owner: string; index: number; status: "loading" | "playing" | "error" };

let audio: HTMLAudioElement | null = null;
let queue: readonly string[] = [];
let playback: SpeechPlayback | null = null;
// Raised on every start and stop, so a play() promise or media event of an earlier clip never touches the current one.
let generation = 0;
const listeners = new Set<() => void>();

function publish(next: SpeechPlayback | null) {
  playback = next;
  for (const listener of listeners) listener();
}

function element() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("playing", () => {
    if (playback?.status === "loading") publish({ ...playback, status: "playing" });
  });
  audio.addEventListener("ended", () => {
    if (!playback || playback.status === "error") return;
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
  player.src = queue[index]!;
  // An interrupted play() rejects with AbortError; that is a stop, not a failure.
  player.play().catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === "AbortError")) fail(run);
  });
}

// Plays `urls` in order for `owner`, stopping whatever plays now.
export function playSpeech(owner: string, urls: readonly string[]) {
  if (!urls.length) return;
  queue = urls;
  start(owner, 0);
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
