import { VisuallyHidden } from "@mantine/core";
import { Check, LoaderCircle, Mic, X } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui";
import { isListening, type ListenStatus, type PronunciationAssessment, type SpokenAnswer } from "./speechRecognition";
import styles from "./SpeakControls.module.css";

// How long a word card's verdict stays before it fades away (docs/words.md#spoken-answers).
export const PASSING_VERDICT_MS = 3500;

// A listen in progress, as `useSpokenAnswer` reports it.
export type ListeningState = { status: ListenStatus; interim: string; quiet: boolean; meterRef: (element: HTMLElement | null) => void };

// What a listen is doing, in words (docs/words.md#listening-feedback): getting ready, waiting for speech (or nudging when the
// microphone hears nothing), what has been heard so far, or working out the answer. Empty while not listening.
export function useListeningHint({ status, interim, quiet }: ListeningState): string {
  const { t } = useTranslation();
  if (!isListening(status)) return "";
  if (status === "hearing") return interim ? t("speak.phase.heardSoFar", { interim }) : t("speak.stopHint");
  if (status === "listening") return quiet ? t("speak.phase.quiet") : t("speak.phase.listeningHint");
  return t(`speak.phase.${status}Hint`);
}

// Say it (docs/words.md#spoken-answers). Each phase looks different: a spinner while getting ready and while checking, slow
// ripples while waiting for speech, and rings that swell with the microphone's level (`--level`) while hearing. The full button
// names its phase, carries its `M` shortcut, and hangs the listening hint below it; the compact one is a round icon whose label
// says what pressing it does, and its surface shows the hint itself.
export function SpeakButton({ state, onListen, compact = false, term }: { state: ListeningState; onListen: () => void; compact?: boolean; term?: string }) {
  const { t } = useTranslation();
  const hintId = useId();
  const hint = useListeningHint(state);
  const active = isListening(state.status);
  const busy = state.status === "preparing" || state.status === "checking";
  const icon = busy ? <LoaderCircle className={`${styles.mic} ${styles.spinner}`} size={compact ? 18 : 16} aria-hidden="true" />
    : <Mic className={styles.mic} size={compact ? 18 : 16} aria-hidden="true" />;
  const phase = active ? state.status : undefined;
  if (compact) {
    return <span ref={state.meterRef} className={`${styles.speak} ${styles.round}`} data-phase={phase}>
      <button type="button" className={styles.roundButton} aria-pressed={active} onClick={onListen}
        aria-label={active ? t("speak.stop") : term ? t("speak.sayTerm", { term }) : t("speak.start")}>{icon}</button>
    </span>;
  }
  return <span ref={state.meterRef} className={styles.speak} data-phase={phase}>
    <Button variant="secondary" className={styles.speakButton} aria-keyshortcuts="M" aria-pressed={active}
      aria-describedby={active ? hintId : undefined} onClick={onListen}>
      {icon}{active ? t(`speak.phase.${state.status}`) : t("speak.start")}<kbd className={styles.key} aria-hidden="true">M</kbd>
    </Button>
    {active && <span id={hintId} className={styles.stopHint} data-quiet={state.quiet || undefined} aria-live="polite">{hint}</span>}
  </span>;
}

// A word card's listening hint, floating where its verdict will appear.
export function ListeningPill({ state }: { state: ListeningState }) {
  const hint = useListeningHint(state);
  if (!hint) return null;
  return <div className={styles.passing}><p className={styles.livePill} data-quiet={state.quiet || undefined} aria-live="polite">{hint}</p></div>;
}

// Score bands (docs/words.md#pronunciation-assessment): Azure treats a word under 60 as mispronounced.
export const SCORE_GOOD = 80;
export const SCORE_FAIR = 60;
const band = (score: number) => score >= SCORE_GOOD ? "good" : score >= SCORE_FAIR ? "fair" : "weak";

// The overall pronunciation score as a ring that fills to it, coloured by band.
export function ScoreRing({ score, compact = false }: { score: number; compact?: boolean }) {
  const { t } = useTranslation();
  return <span className={`${styles.ring} ${compact ? styles.ringCompact : ""}`} data-band={band(score)} role="img"
    aria-label={t("speak.assessment.overallScore", { score })} style={{ "--score": score } as CSSProperties}>
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle className={styles.ringTrack} cx="18" cy="18" r="15.9155" /><circle className={styles.ringFill} cx="18" cy="18" r="15.9155" pathLength="100" /></svg>
    <span className={styles.ringValue} aria-hidden="true">{score}</span>
  </span>;
}

// What was heard and whether it matched: a badge that pops in, then glows on a match or shakes on a miss. With an assessment it
// ends in the overall score ring. `as="span"` lets it sit inside a button.
export function SpokenVerdict({ answer, compact = false, as: Root = "p" }: { answer: SpokenAnswer; compact?: boolean; as?: "p" | "span" }) {
  const { t } = useTranslation();
  return <Root className={`${styles.verdict} ${compact ? styles.compact : ""}`} data-match={answer.matches || undefined} {...(Root === "p" ? { role: "status" } : {})}>
    <span className={styles.verdictIcon} aria-hidden="true">{answer.matches ? <Check size={compact ? 14 : 18} strokeWidth={3} /> : <X size={compact ? 14 : 18} strokeWidth={3} />}</span>
    <span className={styles.verdictLabel}>{answer.matches ? t("speak.match") : t("speak.miss")}</span>
    <span className={styles.verdictHeard}>{t("speak.heard", { heard: answer.heard })}</span>
    {answer.assessment && <ScoreRing score={answer.assessment.overall} compact={compact} />}
  </Root>;
}

// Microsoft's breakdown: accuracy, fluency, and completeness as bars, then each word of the term coloured by its accuracy, with
// missed and extra words named.
export function AssessmentBreakdown({ assessment }: { assessment: PronunciationAssessment }) {
  const { t } = useTranslation();
  const meters = [["accuracy", assessment.accuracy], ["fluency", assessment.fluency], ["completeness", assessment.completeness]] as const;
  return <div className={styles.breakdown}>
    <dl className={styles.meters}>
      {meters.map(([name, value]) => <div key={name} className={styles.meter} data-band={band(value)}>
        <dt>{t(`speak.assessment.${name}`)}</dt>
        <dd><span className={styles.bar} aria-hidden="true"><span style={{ "--score": `${value}%` } as CSSProperties} /></span><span className={styles.meterValue}>{value}</span></dd>
      </div>)}
    </dl>
    {assessment.words.length > 0 && <ul className={styles.words} aria-label={t("speak.assessment.words")}>
      {assessment.words.map((word, index) => <li key={index} className={styles.word} data-error={word.error}
        data-band={word.error === "none" && word.accuracy !== null ? band(word.accuracy) : "weak"}>
        <span className={styles.wordText}>{word.word}</span>
        <span className={styles.wordNote}>{word.error === "none" || word.error === "mispronunciation"
          ? word.accuracy === null ? "" : word.error === "mispronunciation" ? t("speak.assessment.mispronounced", { score: word.accuracy }) : String(word.accuracy)
          : t(`speak.assessment.${word.error}`)}</span>
      </li>)}
    </ul>}
  </div>;
}

type Outcome = SpokenAnswer | "noSpeech" | "blocked" | "failed";

// A word card's verdict, or why nothing was heard, floating over the card and fading away after PASSING_VERDICT_MS. Each new
// outcome is a new object and restarts it. Clicking dismisses it early, except that a verdict with an assessment opens instead
// into a panel with the breakdown, which stays until closed. The verdict is not kept (the recognition scope stores the assessment).
export function PassingVerdict({ outcome, onGone }: { outcome: Outcome; onGone: () => void }) {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setLeaving(false); setOpen(false);
    const leave = window.setTimeout(() => setLeaving(true), PASSING_VERDICT_MS);
    return () => window.clearTimeout(leave);
  }, [outcome]);
  const assessment = typeof outcome === "string" ? null : outcome.assessment;
  if (open && assessment && typeof outcome !== "string") {
    return <div className={styles.panel} role="dialog" aria-label={t("speak.assessment.title")}>
      <div className={styles.panelHead}>
        <SpokenVerdict answer={outcome} compact />
        <button type="button" className={styles.close} aria-label={t("speak.assessment.close")} onClick={onGone}><X size={16} aria-hidden="true" /></button>
      </div>
      <AssessmentBreakdown assessment={assessment} />
    </div>;
  }
  return <div className={styles.passing} data-leaving={leaving || undefined} role="status"
    onAnimationEnd={(event) => { if (leaving && event.target === event.currentTarget) onGone(); }}
    onClick={assessment ? undefined : () => setLeaving(true)}>
    {typeof outcome === "string"
      ? <p className={styles.passingStatus}>{t(`speak.${outcome}`)}</p>
      : assessment
        ? <button type="button" className={styles.verdictButton} aria-expanded={false} onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
          <SpokenVerdict answer={outcome} compact as="span" /><VisuallyHidden>{t("speak.assessment.open")}</VisuallyHidden>
        </button>
        : <SpokenVerdict answer={outcome} compact as="span" />}
  </div>;
}

// The front's quiet line after a listen that heard nothing or could not run.
export function ListenStatusLine({ status, className }: { status: ListenStatus; className?: string }) {
  const { t } = useTranslation();
  if (status === "idle" || isListening(status)) return null;
  return <p className={`${styles.listenStatus} ${className ?? ""}`} role="status">{t(`speak.${status}`)}</p>;
}
