import { LoaderCircle, Square, Volume2 } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { playSpeech, stopSpeech, useSpeechFailure, useSpeechPlayback, useStopSpeechOnUnmount } from "../../molecules/Speech";
import type { ClipSource } from "./types";
import styles from "./ClipButton.module.css";

// On-demand audio (docs/speech.md#on-demand-audio): a speaker button whose clip is asked for when it is first pressed. The clip
// may still be synthesizing (`202`), so it is asked again after a second, at most five times; then it plays through the shared
// Speech element like every other clip. A URL is kept for the visit, so a second press plays at once.
export const CLIP_RETRY_MS = 1000;
export const CLIP_RETRIES = 5;

const clipUrls = new Map<string, string>();
// Without the Azure key the route answers `503 SPEECH_UNAVAILABLE`, and every on-demand speaker button hides for the visit.
let unavailable = false;
const unavailableListeners = new Set<() => void>();
const subscribeUnavailable = (listener: () => void) => { unavailableListeners.add(listener); return () => { unavailableListeners.delete(listener); }; };
const readUnavailable = () => unavailable;
function markUnavailable() { unavailable = true; for (const listener of unavailableListeners) listener(); }
export const useOnDemandSpeechAvailable = () => !useSyncExternalStore(subscribeUnavailable, readUnavailable, readUnavailable);

// Forgets cached URLs and the unavailable state. For tests.
export function resetOnDemandSpeech() { clipUrls.clear(); unavailable = false; for (const listener of unavailableListeners) listener(); }

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

type Problem = { kind: "limit"; resetsAt: number } | { kind: "failed" } | null;

export function ClipButton({ clip, label, className }: { clip: ClipSource; label: string; className?: string }) {
  const { t } = useTranslation();
  const owner = useId();
  const available = useOnDemandSpeechAvailable();
  const playback = useSpeechPlayback(owner);
  useStopSpeechOnUnmount(owner);
  const [failed, setFailed] = useSpeechFailure(playback?.status);
  const [fetching, setFetching] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!available) return null;

  const playing = playback?.status === "loading" || playback?.status === "playing";
  const press = async () => {
    setFailed(false); setProblem(null);
    if (playing) { stopSpeech(); return; }
    if (fetching) return;
    const cached = clipUrls.get(clip.key);
    if (cached) { playSpeech(owner, [cached]); return; }
    setFetching(true);
    try {
      for (let attempt = 0; attempt <= CLIP_RETRIES; attempt += 1) {
        if (attempt > 0) await wait(CLIP_RETRY_MS);
        if (!mounted.current) return;
        const result = await clip.load().catch(() => ({ status: "failed" as const }));
        if (!mounted.current) return;
        if (result.status === "pending") continue;
        if (result.status === "ready") { clipUrls.set(clip.key, result.url); playSpeech(owner, [result.url]); return; }
        if (result.status === "limit") { setProblem({ kind: "limit", resetsAt: result.resetsAt }); return; }
        if (result.status === "unavailable") { markUnavailable(); return; }
        setProblem({ kind: "failed" }); return;
      }
      setProblem({ kind: "failed" });
    } finally {
      if (mounted.current) setFetching(false);
    }
  };
  const loading = fetching || playback?.status === "loading";
  const status = fetching ? "loading" : playback?.status ?? "idle";
  const message = problem?.kind === "limit" ? t("tutorComponents.audio.limit", { time: new Date(problem.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
    : problem?.kind === "failed" || failed ? t("tutorComponents.audio.failed") : null;
  return <span className={`${styles.wrap} ${className ?? ""}`}>
    <button type="button" className={styles.button} aria-label={label} aria-pressed={playing || fetching} aria-busy={loading || undefined}
      data-status={status} onClick={() => void press()}>
      {loading ? <LoaderCircle aria-hidden="true" className={`${styles.icon} ${styles.spinner}`} />
        : playback?.status === "playing" ? <Square aria-hidden="true" className={styles.icon} /> : <Volume2 aria-hidden="true" className={styles.icon} />}
    </button>
    {message && <span className={styles.message} role="status">{message}</span>}
  </span>;
}
