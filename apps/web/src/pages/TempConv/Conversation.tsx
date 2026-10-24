import type { InlineContent, readDialogueTurns } from "@wordinator/contracts/lesson-document";
import { ArrowLeft, ArrowRight, Languages, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { playSpeech, SpeechButton, stopSpeech, useSpeechPlayback, useSpeechResolver, useStopSpeechOnUnmount } from "../../molecules/Speech";
import { InlineText } from "../../organisms/LessonDocument/LessonDocument";
import { MarkedText } from "../TempHovercard/LessonText";
import type { WordSpan } from "../TempHovercard/wordMatch";
import styles from "./TempConv.module.css";

// Controls and marked words handle their own clicks and keys; the stage does not move on for them.
const CONTROLS = "button, a, input, label, textarea, select, [role=button]";

type DialogueTurn = ReturnType<typeof readDialogueTurns>[number];

export type ConversationProps = {
  blockId: string;
  title: string;
  // The section's heading right before the dialogue, shown as the scene's label once the conversation starts.
  scene: string | null;
  // The blocks before the dialogue, one box each.
  intro: InlineContent[];
  turns: readonly DialogueTurn[];
  background: string;
  portraits: Readonly<Record<string, string>>;
  // For a background with the speakers drawn in: one grey mask per speaker (by lowercase name), multiplied over the background
  // so everyone but the one speaking dims. The portraits then stay in the bubbles instead of standing in the scene.
  masks?: Readonly<Record<string, string>>;
  // The empty location behind the title and the intro, when the background has the speakers drawn in; it fades into the
  // background as the conversation begins.
  location?: string;
  // The new words of each line, marked in its bubble; each opens its card on a click.
  spans?: readonly (readonly WordSpan[])[];
};

// Prototype: a dialogue staged over its location. The page opens on the background and the lesson title; each step brings the next
// intro box, then the speakers step into the scene on either side (the latest on each side) and each line of the dialogue slides in from its speaker's side;
// a speaker without a portrait keeps an initial beside their lines. Clicking the stage, Space, Enter, or the right arrow
// moves on; the left arrow or Back goes back. Autoplay reads the dialogue from the current line (or its first, before it starts
// or after it ends) to the end, bringing each line in as it is spoken; stepping, a line's own speaker, or Autoplay again stops
// it. Development only and not translated.
export function Conversation({ blockId, title, scene, intro, turns, background, portraits, masks, location, spans }: ConversationProps) {
  const resolve = useSpeechResolver();
  const owner = `conversation:${blockId}`;
  const autoOwner = `conversation-autoplay:${blockId}`;
  useStopSpeechOnUnmount(owner);
  useStopSpeechOnUnmount(autoOwner);
  const autoPlayback = useSpeechPlayback(autoOwner);
  // The steps an autoplay queued, by queue position, and the position last heard, so the end of the queue can close the dialogue.
  const autoSteps = useRef<number[]>([]);
  const autoAt = useRef(-1);
  // -1 is the bare stage; then one step per intro box, one per line, and the end.
  const [step, setStep] = useState(-1);
  const [autoPlay, setAutoPlay] = useState(true);
  const [showTranslations, setShowTranslations] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const last = intro.length + turns.length;
  const line = step - intro.length;
  const phase = step < 0 ? "stage" : step < intro.length ? "intro" : step < last ? "dialogue" : "end";

  // Speakers take sides in the order they first speak: the first on the start side, the next on the end side, and so on.
  const speakers = [...new Set(turns.map((turn) => turn.speaker))];
  const side = (speaker: string) => (speakers.indexOf(speaker) % 2 === 0 ? "start" : "end");
  // The background zooms out a little with each line, reaching its natural size on the last one; the empty location does the
  // same over the intro boxes.
  const zoomLeft = phase === "dialogue" ? 1 - line / Math.max(1, turns.length - 1) : phase === "end" ? 0 : 1;
  const locationZoomLeft = phase === "stage" ? 1 : phase === "intro" ? 1 - (step + 1) / intro.length : 0;
  const lineUrl = (index: number) => resolve(`turn:${blockId}:${index}`);
  // Each side shows the last speaker who has spoken there so far, so a cast larger than two takes turns on stage.
  const onStage: string[] = [];
  for (const at of ["start", "end"] as const) {
    for (let index = phase === "end" ? turns.length - 1 : line; index >= 0; index--) {
      if (side(turns[index]!.speaker) === at) { onStage.push(turns[index]!.speaker); break; }
    }
  }

  const go = useCallback((next: number) => {
    autoSteps.current = [];
    const target = Math.max(-1, Math.min(last, next));
    setStep(target);
    const index = target - intro.length;
    const url = index >= 0 && index < turns.length ? resolve(`turn:${blockId}:${index}`) : null;
    if (autoPlay && url) playSpeech(owner, [url]); else stopSpeech();
  }, [last, intro.length, turns.length, resolve, blockId, autoPlay, owner]);

  // While autoplay plays, the stage follows the queued line being spoken. When its queue finishes the dialogue ends; when something
  // else takes the player over, autoplay just stops where it is.
  useEffect(() => {
    if (!autoSteps.current.length) return;
    if (autoPlayback && autoPlayback.status !== "error") {
      autoAt.current = autoPlayback.index;
      setStep(autoSteps.current[autoPlayback.index]!);
      return;
    }
    const finished = !autoPlayback && autoAt.current === autoSteps.current.length - 1;
    autoSteps.current = [];
    if (finished) setStep(last);
  }, [autoPlayback, last]);
  const autoplaying = autoSteps.current.length > 0 && autoPlayback !== null;

  const toggleAutoplay = () => {
    if (autoplaying) { autoSteps.current = []; stopSpeech(); return; }
    const from = phase === "dialogue" ? line : 0;
    const lines = turns.map((_, index) => index).filter((index) => index >= from && lineUrl(index));
    if (!lines.length) return;
    autoSteps.current = lines.map((index) => intro.length + index);
    autoAt.current = -1;
    setStep(autoSteps.current[0]!);
    playSpeech(autoOwner, lines.map((index) => lineUrl(index)!));
  };

  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const onControl = event.target instanceof Element && event.target.closest(CONTROLS);
      // Space and Enter belong to a focused control; the arrows always move.
      if ((event.key === " " || event.key === "Enter") && !onControl) { event.preventDefault(); go(stepRef.current + 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); go(stepRef.current + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); go(stepRef.current - 1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go]);

  const onStageClick = (event: MouseEvent<HTMLDivElement>) => {
    // A word's card is portalled out of the stage, but React still bubbles its clicks here.
    if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target) || event.target.closest(CONTROLS)) return;
    if (step < last) go(step + 1);
  };

  const toggleLine = (index: number) => setRevealed((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  const primary = phase === "end"
    ? { label: "Start again", icon: <RotateCcw aria-hidden="true" />, action: () => { setRevealed(new Set()); go(-1); } }
    : { label: phase === "stage" ? "Begin" : step === intro.length - 1 ? "Start conversation" : phase === "intro" ? "Continue" : "Next line", icon: <ArrowRight aria-hidden="true" />, action: () => go(step + 1) };

  return (
    <div className={styles.stage} data-phase={phase} onClick={onStageClick}>
      <div className={styles.background} aria-hidden="true" style={{ "--zoom-left": zoomLeft } as CSSProperties}>
        <img src={background} alt="" />
        {masks && Object.entries(masks).map(([name, url]) => (
          <img key={name} className={styles.mask} src={url} alt="" data-speaker={name}
            data-active={(phase === "dialogue" && turns[line]?.speaker.toLowerCase() === name) || undefined} />
        ))}
      </div>
      {location && (
        <div className={`${styles.background} ${styles.location}`} aria-hidden="true" data-active={(phase === "stage" || phase === "intro") || undefined}
          style={{ "--zoom-left": locationZoomLeft } as CSSProperties}>
          <img src={location} alt="" />
        </div>
      )}
      <div className={styles.scrim} aria-hidden="true" />

      <header className={styles.top}>
        <div className={styles.titles}>
          <p className={styles.eyebrow}>{phase === "dialogue" || phase === "end" ? scene ?? "Conversation" : "Prototype · conversation"}</p>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.toggles}>
          <button type="button" className={styles.pill} aria-pressed={autoPlay} onClick={() => { setAutoPlay(!autoPlay); if (autoPlay) stopSpeech(); }}>
            Read lines aloud
          </button>
          <button type="button" className={styles.pill} aria-pressed={showTranslations} onClick={() => setShowTranslations(!showTranslations)}>
            Show translations
          </button>
          <button type="button" className={`${styles.pill} ${styles.autoplay}`} aria-pressed={autoplaying} onClick={toggleAutoplay}>
            {autoplaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />} {autoplaying ? "Stop autoplay" : "Autoplay"}
          </button>
        </div>
      </header>

      {!masks && (phase === "dialogue" || phase === "end") && (
        <div className={styles.cast} aria-hidden="true">
          {onStage.map((speaker) => {
            const portrait = portraits[speaker.toLowerCase()];
            return portrait && (
              <img key={speaker} className={styles.character} src={portrait} alt="" data-side={side(speaker)}
                data-speaking={turns[line]?.speaker === speaker || undefined} />
            );
          })}
        </div>
      )}

      {phase === "stage" && <p className={styles.hint}>Click anywhere or press Space to begin</p>}

      {phase === "intro" && (
        <div className={styles.intro} aria-live="polite">
          {intro.slice(0, step + 1).map((content, index) => (
            <p key={index} className={styles.introBox} data-current={index === step || undefined}><InlineText content={content} /></p>
          ))}
        </div>
      )}

      {(phase === "dialogue" || phase === "end") && (
        <ol className={styles.lines} aria-live="polite">
          {turns.slice(0, phase === "end" ? turns.length : line + 1).map((turn, index) => {
            const current = index === line;
            const translated = showTranslations || revealed.has(index);
            const portrait = portraits[turn.speaker.toLowerCase()];
            return (
              <li key={index} className={styles.line} data-side={side(turn.speaker)} data-current={current || undefined}>
                {(masks || !portrait) && (
                  <span className={styles.avatar} aria-hidden="true">{masks && portrait ? <img src={portrait} alt="" /> : turn.speaker.slice(0, 1)}</span>
                )}
                <div className={styles.bubble}>
                  <div className={styles.bubbleHead}>
                    <span className={styles.speaker}>{turn.speaker}</span>
                    <SpeechButton url={lineUrl(index)} owner={owner} label={`Play line ${index + 1}, ${turn.speaker}`} />
                    {turn.translation && !showTranslations && (
                      <button type="button" className={styles.translate} aria-pressed={translated} aria-label={`Translate line ${index + 1}`} onClick={() => toggleLine(index)}>
                        <Languages aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className={styles.text}>{spans ? <MarkedText text={turn.text} spans={spans[index] ?? []} /> : turn.text}</p>
                  {turn.translation && translated && <p className={styles.translation}>{turn.translation}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <footer className={styles.bar}>
        <button type="button" className={styles.icon} aria-label="Back" disabled={step < 0} onClick={() => go(step - 1)}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <button type="button" className={styles.primary} onClick={primary.action}>{primary.label} {primary.icon}</button>
        <span className={styles.count}>
          {phase === "intro" ? `Intro ${step + 1} / ${intro.length}` : phase === "dialogue" ? `Line ${line + 1} / ${turns.length}` : phase === "end" ? "The end" : ""}
        </span>
      </footer>
    </div>
  );
}
