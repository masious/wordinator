import type { InlineContent, readDialogueTurns } from "@wordinator/contracts/lesson-document";
import { ArrowLeft, ArrowRight, Languages, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { playSpeech, SpeechButton, stopSpeech, useSpeechPlayback, useSpeechResolver, useStopSpeechOnUnmount } from "../../molecules/Speech";
import { InlineText } from "../../organisms/LessonDocument/LessonDocument";
import { Button, ButtonGroup } from "../../ui";
import { MarkedText } from "../TempHovercard/LessonText";
import { HovercardDemoContext, useHovercardDemo } from "../TempHovercard/WordHovercard";
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
  // One redrawn scene per line, with the line's gesture or thought bubble, and its mask lighting the speaker; each replaces the
  // background and the speaker masks while its line is shown.
  lineScenes?: readonly { scene: string | null; mask: string | null }[];
  // The empty location behind the title and the intro, when the background has the speakers drawn in; it fades into the
  // background as the conversation begins.
  location?: string;
  // The new words of each line, marked in its bubble; each opens its card on a click.
  spans?: readonly (readonly WordSpan[])[];
  onLineChange?: (index: number) => void;
  onContinue?: () => void;
  onExit?: () => void;
};

// Prototype: a dialogue staged over its location. The page opens on the background and the lesson title; each step brings the next
// intro box, then the speakers step into the scene on either side (the latest on each side) and each line of the dialogue slides in from its speaker's side;
// a speaker without a portrait keeps an initial beside their lines. Clicking the stage, Space, Enter, or the right arrow
// moves on; the left arrow or Back goes back. Autoplay reads the dialogue from the current line (or its first, before it starts
// or after it ends) to the end, bringing each line in as it is spoken; stepping, a line's own speaker, or Autoplay again stops
// it. Development only and not translated.
export function Conversation({ blockId, title, scene, intro, turns, background, portraits, masks, lineScenes, location, spans, onLineChange, onContinue, onExit }: ConversationProps) {
  const { t } = useTranslation();
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
  const [showTranslations, setShowTranslations] = useState(true);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  // While the lines are being scrolled (on a phone), the lines after the current one stay in place, faded, so scrolling down
  // brings them back; they go once the scrolling settles.
  const [scrubbing, setScrubbing] = useState(false);
  const last = intro.length + turns.length;
  const line = step - intro.length;
  const phase = step < 0 ? "stage" : step < intro.length ? "intro" : step < last ? "dialogue" : "end";
  useEffect(() => {
    if (phase === "dialogue") onLineChange?.(line);
  }, [line, onLineChange, phase]);
  // Stepping forward slides the new line in; stepping back slides the lines left behind out to their side before they go.
  const [moved, setMoved] = useState({ step, forward: true, leaving: [] as number[] });
  if (moved.step !== step) {
    const from = Math.min(moved.step - intro.length, turns.length - 1);
    const leaving = step < moved.step && phase === "dialogue" ? turns.map((_, index) => index).filter((index) => index > line && index <= from) : [];
    setMoved({ step, forward: step > moved.step, leaving: [...new Set([...moved.leaving, ...leaving])].filter((index) => index > line) });
  }
  const gone = (index: number) => !scrubbing && setMoved((current) => ({ ...current, leaving: current.leaving.filter((at) => at !== index) }));

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

  const stepRef = useRef(step);
  stepRef.current = step;

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

  // Opening a word's card stops autoplay where it is; scrolling the lines stops it until the scrolling settles.
  const stopAutoplay = useCallback(() => {
    if (!autoSteps.current.length) return;
    autoSteps.current = [];
    stopSpeech();
  }, []);
  const demo = useHovercardDemo();
  const cardDemo = useMemo(() => ({ ...demo, onOpen: () => { demo.onOpen?.(); stopAutoplay(); } }), [demo, stopAutoplay]);

  const startAutoplay = (from: number) => {
    const lines = turns.map((_, index) => index).filter((index) => index >= from && lineUrl(index));
    if (!lines.length) return;
    autoSteps.current = lines.map((index) => intro.length + index);
    autoAt.current = -1;
    setStep(autoSteps.current[0]!);
    playSpeech(autoOwner, lines.map((index) => lineUrl(index)!));
  };
  const toggleAutoplay = () => {
    if (autoplaying) stopAutoplay(); else startAutoplay(phase === "dialogue" ? line : 0);
  };

  // Where the intro and the lines scroll (on a phone), each new box or line scrolls into view and the scene follows it again.
  const introRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLOListElement>(null);
  // Scrolling that follows a step does not pick a line, and a step picked by scrolling does not scroll.
  const quietUntil = useRef(0);
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current) { scrolled.current = false; return; }
    quietUntil.current = performance.now() + 700;
    const list = introRef.current ?? linesRef.current;
    list?.scrollTo?.({ top: list.scrollHeight, behavior: "smooth" });
  }, [step]);

  // Scrolling the lines makes the one nearest their middle (or the last, at the bottom) the current line, so the scene, the
  // bubbles, the dots and autoplay all follow one line. Autoplay pauses while scrolling and starts again from that line once the
  // scrolling settles, when the lines after it go.
  const scrub = useRef<{ timer?: number; autoplay: boolean } | null>(null);
  const settle = () => {
    const resume = scrub.current?.autoplay;
    scrub.current = null;
    setScrubbing(false);
    setMoved((current) => ({ ...current, leaving: [] }));
    quietUntil.current = performance.now() + 700;
    if (resume) startAutoplay(stepRef.current - intro.length);
  };
  const onLinesScroll = () => {
    const list = linesRef.current;
    if (!list || performance.now() < quietUntil.current) return;
    if (!scrub.current) {
      scrub.current = { autoplay: autoSteps.current.length > 0 };
      autoSteps.current = [];
      stopSpeech();
      setScrubbing(true);
    }
    window.clearTimeout(scrub.current.timer);
    scrub.current.timer = window.setTimeout(settle, 250);
    const items = [...list.querySelectorAll(":scope > li")];
    let nearest = items.length - 1;
    if (list.scrollHeight - list.scrollTop - list.clientHeight >= 8) {
      const middle = list.getBoundingClientRect().top + list.clientHeight / 2;
      let distance = Infinity;
      items.forEach((item, index) => {
        const rect = item.getBoundingClientRect();
        const away = Math.abs(rect.top + rect.height / 2 - middle);
        if (away < distance) { distance = away; nearest = index; }
      });
    }
    const target = intro.length + nearest;
    if (nearest >= 0 && target !== stepRef.current) { scrolled.current = true; setStep(target); }
  };
  useEffect(() => () => window.clearTimeout(scrub.current?.timer), []);
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
    ? { label: t("courses.conversationScene.startAgain"), icon: <RotateCcw />, action: () => { setRevealed(new Set()); go(-1); } }
    : { label: phase === "stage" ? t("courses.conversationScene.begin") : step === intro.length - 1 ? t("courses.conversationScene.startConversation") : phase === "intro" ? t("courses.conversationScene.continue") : t("courses.conversationScene.nextLine"), icon: <ArrowRight />, action: () => go(step + 1) };

  return (
    <div className={styles.stage} data-phase={phase} onClick={onStageClick}>
      {/* On a phone the whole scene sits under the header and the empty location, blurred, behind everything else. */}
      <div className={styles.backdrop} aria-hidden="true">{(location || background) && <img src={location ?? background} alt="" />}</div>
      <div className={styles.scene}>
      <div className={styles.background} aria-hidden="true" style={{ "--zoom-left": zoomLeft } as CSSProperties}>
        {background && <img src={background} alt="" />}
        {lineScenes?.map((art, index) => art.scene && (
          <div key={index} className={styles.lineScene} data-active={index === line || undefined}>
            <img src={art.scene} alt="" />
            {art.mask && <img className={styles.mask} src={art.mask} alt="" data-active />}
          </div>
        ))}
        {masks && !lineScenes && Object.entries(masks).map(([name, url]) => (
          <img key={name} className={styles.mask} src={url} alt="" data-speaker={name}
            data-active={((phase === "dialogue" || phase === "end") && turns[line]?.speaker.toLowerCase() === name) || undefined} />
        ))}
      </div>
      {location && (
        <div className={`${styles.background} ${styles.location}`} aria-hidden="true" data-active={(phase === "stage" || phase === "intro") || undefined}
          style={{ "--zoom-left": locationZoomLeft } as CSSProperties}>
          <img src={location} alt="" />
        </div>
      )}
      <div className={styles.scrim} aria-hidden="true" />
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
      </div>

      <header className={styles.top}>
        {onExit && <button type="button" className={styles.pill} onClick={onExit}>{t("courses.conversationScene.backToLesson")}</button>}
        <div className={styles.titles}>
          <p className={styles.eyebrow}>{phase === "dialogue" || phase === "end" ? scene ?? t("courses.conversationScene.title") : t("courses.conversationScene.title")}</p>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.toggles}>
          <button type="button" className={styles.pill} aria-pressed={autoPlay} onClick={() => { setAutoPlay(!autoPlay); if (autoPlay) stopSpeech(); }}>
            {t("courses.conversationScene.readAloud")}
          </button>
          <button type="button" className={styles.pill} aria-pressed={showTranslations} onClick={() => setShowTranslations(!showTranslations)}>
            {t("courses.conversationScene.showTranslations")}
          </button>
        </div>
      </header>

      {phase === "stage" && <p className={styles.hint}>{t("courses.conversationScene.beginHint")}</p>}

      {phase === "intro" && (
        <div ref={introRef} className={styles.intro} aria-live="polite">
          {intro.slice(0, step + 1).map((content, index) => (
            <p key={index} className={styles.introBox} data-current={index === step || undefined}><InlineText content={content} /></p>
          ))}
        </div>
      )}

      {(phase === "dialogue" || phase === "end") && (
        <HovercardDemoContext.Provider value={cardDemo}>
        <ol ref={linesRef} className={styles.lines} aria-live="polite" onScroll={onLinesScroll}>
          {turns.slice(0, phase === "end" ? turns.length : Math.max(line, ...moved.leaving) + 1).map((turn, index) => {
            const current = index === line;
            const leaving = index > line && phase !== "end";
            const translated = showTranslations || revealed.has(index);
            const portrait = portraits[turn.speaker.toLowerCase()];
            return (
              <li key={index} className={styles.line} data-side={side(turn.speaker)} data-current={current || undefined}
                data-enter={(current && moved.forward) || undefined} data-leaving={leaving || undefined}
                onAnimationEnd={leaving ? (event) => { if (event.target === event.currentTarget) gone(index); } : undefined}>
                {(masks || !portrait) && (
                  <span className={styles.avatar} aria-hidden="true">{masks && portrait ? <img src={portrait} alt="" /> : turn.speaker.slice(0, 1)}</span>
                )}
                <div className={styles.bubble}>
                  <div className={styles.bubbleHead}>
                    <span className={styles.speaker}>{turn.speaker}</span>
                    <SpeechButton url={lineUrl(index)} owner={owner} label={t("courses.conversationScene.playLine", { number: index + 1, speaker: turn.speaker })} />
                    {turn.translation && !showTranslations && (
                      <button type="button" className={styles.translate} aria-pressed={translated} aria-label={t("courses.conversationScene.translateLine", { number: index + 1 })} onClick={() => toggleLine(index)}>
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
        </HovercardDemoContext.Provider>
      )}

      <footer className={styles.bar}>
        {(phase === "dialogue" || phase === "end") && (
          <span className={styles.dots} role="img" aria-label={t("courses.conversationScene.linePosition", { number: Math.min(line, turns.length - 1) + 1, total: turns.length })}>
            {turns.map((_, index) => <span key={index} data-done={index <= line || undefined} data-focus={index === line || undefined} />)}
          </span>
        )}
        <ButtonGroup className={styles.controls} label={t("courses.conversationScene.controls")}>
          <Button variant="secondary" className={styles.square} aria-label={t("courses.conversationScene.back")} disabled={step < 0} onClick={() => go(step - 1)}>
            <ArrowLeft aria-hidden="true" />
          </Button>
          <Button variant="secondary" onClick={primary.action} trailingIcon={primary.icon}>{primary.label}</Button>
          <Button className={styles.square} aria-label={autoplaying ? t("courses.conversationScene.stopAutoplay") : t("courses.conversationScene.autoplay")} aria-pressed={autoplaying} onClick={toggleAutoplay}>
            {autoplaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>
        </ButtonGroup>
        {phase === "end" && onContinue && <Button onClick={onContinue}>{t("courses.conversationScene.continueLesson")} <ArrowRight aria-hidden="true" /></Button>}
        <span className={styles.count}>
          {phase === "intro" ? t("courses.conversationScene.introCount", { number: step + 1, total: intro.length }) : phase === "dialogue" ? t("courses.conversationScene.lineCount", { number: line + 1, total: turns.length }) : phase === "end" ? t("courses.conversationScene.theEnd") : ""}
        </span>
      </footer>
    </div>
  );
}
