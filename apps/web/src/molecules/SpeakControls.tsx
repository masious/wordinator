import { Check, Mic, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui";
import type { ListenStatus, SpokenAnswer } from "./speechRecognition";
import styles from "./SpeakControls.module.css";

// How long a word card's verdict stays before it fades away (docs/words.md#spoken-answers).
export const PASSING_VERDICT_MS = 3500;

// Say it (docs/words.md#spoken-answers). While it listens, the button takes an action tint, its microphone breathes, and two
// rings ripple out from it. The full button names itself, carries its `M` shortcut, and hangs a Click to stop hint below it;
// the compact one is a round icon whose label says what pressing it does.
export function SpeakButton({ listening, onListen, compact = false, term }: { listening: boolean; onListen: () => void; compact?: boolean; term?: string }) {
  const { t } = useTranslation();
  const hint = useId();
  if (compact) {
    return <span className={`${styles.speak} ${styles.round}`} data-listening={listening || undefined}>
      <button type="button" className={styles.roundButton} aria-pressed={listening} onClick={onListen}
        aria-label={listening ? t("speak.stop") : term ? t("speak.sayTerm", { term }) : t("speak.start")}>
        <Mic className={styles.mic} size={18} aria-hidden="true" />
      </button>
    </span>;
  }
  return <span className={styles.speak} data-listening={listening || undefined}>
    <Button variant="secondary" className={styles.speakButton} aria-keyshortcuts="M" aria-pressed={listening}
      aria-describedby={listening ? hint : undefined} onClick={onListen}>
      <Mic className={styles.mic} size={16} aria-hidden="true" />{listening ? t("speak.listening") : t("speak.start")}<kbd className={styles.key} aria-hidden="true">M</kbd>
    </Button>
    {listening && <span id={hint} className={styles.stopHint}>{t("speak.stopHint")}</span>}
  </span>;
}

// What was heard and whether it matched: a badge that pops in, then glows on a match or shakes on a miss.
export function SpokenVerdict({ answer, compact = false }: { answer: SpokenAnswer; compact?: boolean }) {
  const { t } = useTranslation();
  return <p className={`${styles.verdict} ${compact ? styles.compact : ""}`} data-match={answer.matches || undefined} role="status">
    <span className={styles.verdictIcon} aria-hidden="true">{answer.matches ? <Check size={compact ? 14 : 18} strokeWidth={3} /> : <X size={compact ? 14 : 18} strokeWidth={3} />}</span>
    <span className={styles.verdictLabel}>{answer.matches ? t("speak.match") : t("speak.miss")}</span>
    <span className={styles.verdictHeard}>{t("speak.heard", { heard: answer.heard })}</span>
  </p>;
}

// A word card's verdict, or why nothing was heard, floating over the card and fading away after PASSING_VERDICT_MS. Each new
// outcome is a new object and restarts it; clicking dismisses it early. Nothing is kept.
export function PassingVerdict({ outcome, onGone }: { outcome: SpokenAnswer | Exclude<ListenStatus, "idle" | "listening">; onGone: () => void }) {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    setLeaving(false);
    const leave = window.setTimeout(() => setLeaving(true), PASSING_VERDICT_MS);
    return () => window.clearTimeout(leave);
  }, [outcome]);
  return <div className={styles.passing} data-leaving={leaving || undefined} onAnimationEnd={(event) => { if (leaving && event.target === event.currentTarget) onGone(); }}
    onClick={() => setLeaving(true)}>
    {typeof outcome === "string"
      ? <p className={styles.passingStatus} role="status">{t(`speak.${outcome}`)}</p>
      : <SpokenVerdict answer={outcome} compact />}
  </div>;
}

// The front's quiet line after a listen that heard nothing or could not run.
export function ListenStatusLine({ status, className }: { status: ListenStatus; className?: string }) {
  const { t } = useTranslation();
  if (status === "idle" || status === "listening") return null;
  return <p className={`${styles.listenStatus} ${className ?? ""}`} role="status">{t(`speak.${status}`)}</p>;
}
