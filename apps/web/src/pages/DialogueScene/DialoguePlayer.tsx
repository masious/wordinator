import { Popover } from "@mantine/core";
import type { InlineContent, readDialogueTurns, VocabularyWord } from "@wordinator/contracts/lesson-document";
import { ArrowRight, ChevronDown, Ellipsis, Gauge, Languages, Maximize2, Minimize2, MessagesSquare, Pause, Play, Repeat1, RotateCcw, SkipBack, SkipForward, Image as ImageIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { pauseSpeech, playSpeech, resumeSpeech, setSpeechRate, stopSpeech, useSpeechElapsed, useSpeechPlayback, useSpeechResolver, useStopSpeechOnUnmount } from "../../molecules/Speech";
import { InlineText } from "../../organisms/LessonDocument/LessonDocument";
import { MarkedText } from "../TempHovercard/LessonText";
import { HovercardDemoContext, HoverWord, useHovercardDemo, type HovercardDemo } from "../TempHovercard/WordHovercard";
import type { WordSpan } from "../TempHovercard/wordMatch";
import styles from "./DialoguePlayer.module.css";

type DialogueTurn = ReturnType<typeof readDialogueTurns>[number];

export type DialoguePlayerProps = {
  blockId: string;
  title: string;
  // The section's heading right before the dialogue.
  scene: string | null;
  // The blocks before a lesson's first dialogue, shown in a card under the player.
  intro: InlineContent[];
  turns: readonly DialogueTurn[];
  // The scene behind the page, blurred, and the cover of a line without its own scene.
  backdrop: string;
  background: string;
  portraits: Readonly<Record<string, string>>;
  lineScenes?: readonly { scene: string | null; mask: string | null }[];
  spans?: readonly (readonly WordSpan[])[];
  // The new words the dialogue introduces, as chips under the player.
  words: readonly VocabularyWord[];
  // The heading of the lesson's next section, suggested once the dialogue has played out.
  upNext: string | null;
  initialLine?: number;
  onLineChange?: (index: number) => void;
  onContinue?: () => void;
  onExit?: () => void;
  onShowInLesson?: () => void;
};

// New words are marked strongly in yellow, a tinted box with an underline, so they stand out on the dark player; the open card
// carries the same tone along its top.
const toneStyle = {
  "--hc-tone": "var(--color-vivid-yellow)", "--hc-on-tone": "var(--color-vivid-text-on-yellow)",
  "--hc-tint": "color-mix(in srgb, var(--color-vivid-yellow) 28%, transparent)", "--hc-tint-strong": "color-mix(in srgb, var(--color-vivid-yellow) 48%, transparent)",
} as CSSProperties;
// The app theme gives popovers a raised surface as inline styles, so the speed menu's dark surface goes in the same way.
const speedMenuSurface = { background: "color-mix(in srgb, white 14%, black)", border: 0 };
const SPEEDS = [0.75, 1, 1.25] as const;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// Lets the browser animate a change of layout (View Transitions): it snapshots the page, applies the change synchronously, and
// morphs elements sharing a view-transition-name between their old and new places.
function transition(update: () => void) {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
  document.startViewTransition(() => flushSync(update));
}

// The dialogue page on a phone, laid out like a music player's now-playing screen (docs/courses.md#dialogue-scene-pages): the
// line's scene is the cover over the dialogue's location, blurred and still, with the lines sliding under it like synced lyrics.
// A button in the top bar swaps the cover for the conversation box, which otherwise sits under the player like a lyrics card.
export function DialoguePlayer({ blockId, title, scene, intro, turns, backdrop, background, portraits, lineScenes, spans, words, upNext, initialLine, onLineChange, onContinue, onExit, onShowInLesson }: DialoguePlayerProps) {
  const { t } = useTranslation();
  const resolve = useSpeechResolver();
  const owner = `dialogue-player:${blockId}`;
  const last = turns.length - 1;
  const [line, setLine] = useState(() => Math.max(0, Math.min(last, initialLine ?? 0)));
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [loop, setLoop] = useState(false);
  const [translations, setTranslations] = useState(true);
  const [view, setView] = useState<"cover" | "conversation">("cover");
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  // After the last line has played: every segment full and the clock at the end, until play starts again from the first line.
  const [finished, setFinished] = useState(false);
  const clips = useMemo(() => turns.map((_, index) => resolve(`turn:${blockId}:${index}`)), [blockId, resolve, turns]);
  // Until a clip's length is known from its file, a line is guessed at a pause plus a beat per word.
  const [durations, setDurations] = useState(() => turns.map((turn) => 0.8 + turn.text.split(" ").length * 0.42));
  const turn = turns[line]!;
  const portrait = (speaker: string) => portraits[speaker.toLowerCase()];
  // Without its own scene, a line's cover is the location with the cast over it: speakers take sides in the order they first speak,
  // each side showing the latest of its speakers so far, and the one speaking is lit and named.
  const speakers = useMemo(() => [...new Set(turns.map((entry) => entry.speaker))], [turns]);
  const side = (speaker: string) => (speakers.indexOf(speaker) % 2 === 0 ? "start" : "end");
  const cast = (["start", "end"] as const).flatMap((at) => turns.slice(0, line + 1).reverse().find((entry) => side(entry.speaker) === at)?.speaker ?? []);
  useEffect(() => { onLineChange?.(line); }, [line, onLineChange]);

  // Playback is one clip at a time, so a line can repeat and the player can move on by itself: when a clip finishes, the next line
  // (or the same one, repeating) starts. `auto` says the player is meant to carry on; pausing (also by opening a word card) clears
  // it, so a paused clip that something else stops does not count as finished. A line without a clip stops the player there.
  useStopSpeechOnUnmount(owner);
  const playback = useSpeechPlayback(owner);
  const fraction = useSpeechElapsed(owner);
  const auto = useRef(false);
  const playing = playback !== null && playback.status !== "paused" && playback.status !== "error";
  const paused = playback?.status === "paused";
  const play = (index: number) => {
    const url = clips[index];
    setFinished(false);
    auto.current = Boolean(url);
    if (url) playSpeech(owner, [url]); else stopSpeech();
  };
  const pause = () => { auto.current = false; pauseSpeech(); };
  useEffect(() => {
    if (playback || !auto.current) return;
    if (loop) play(line);
    else if (line < last) { setLine(line + 1); play(line + 1); }
    else { auto.current = false; setFinished(true); }
  }, [playback]);
  useEffect(() => { setSpeechRate(speed); }, [speed]);
  useEffect(() => () => setSpeechRate(1), []);
  // The real lengths, read from the clips' metadata, size the scrubber's segments and the clock.
  useEffect(() => {
    const probes = clips.map((url, index) => {
      if (!url) return null;
      const probe = new Audio();
      probe.preload = "metadata";
      probe.onloadedmetadata = () => setDurations((current) => current.map((length, at) => (at === index && Number.isFinite(probe.duration) ? probe.duration : length)));
      probe.src = url;
      return probe;
    });
    return () => probes.forEach((probe) => { if (probe) { probe.onloadedmetadata = null; probe.removeAttribute("src"); } });
  }, [clips]);
  const progress = finished ? 1 : playback ? fraction : 0;
  const elapsed = progress * durations[line]!;
  const starts = durations.map((_, index) => durations.slice(0, index).reduce((sum, length) => sum + length, 0));
  const total = starts[last]! + durations[last]!;

  const go = (index: number) => {
    const target = Math.max(0, Math.min(last, index));
    setLine(target);
    if (playing) play(target); else { auto.current = false; setFinished(false); stopSpeech(); }
  };
  // Like a music player: back restarts a line that has been playing a moment, and only then goes to the line before.
  const back = () => (elapsed > 1.5 ? go(line) : go(line - 1));
  const togglePlay = () => {
    if (playing) pause();
    else if (paused) { auto.current = true; resumeSpeech(); }
    else if (finished) { setLine(0); play(0); }
    else play(line);
  };
  const again = () => { setLine(0); play(0); };
  // A tap opens a word's card (there is no hover on a phone) and pauses playback, so the line holds while it is read.
  const lesson = useHovercardDemo();
  const demo = useMemo<HovercardDemo>(() => ({ ...lesson, toneStyle, subtle: false, clickOnly: true, onOpen: () => { lesson.onOpen?.(); auto.current = false; pauseSpeech(); } }), [lesson]);

  const keys = useRef({ togglePlay, go, line });
  keys.current = { togglePlay, go, line };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenu(false); transition(() => setExpanded(false)); }
      if (event.target instanceof Element && event.target.closest("button, a, input, [role=button]")) return;
      if (event.key === " ") { event.preventDefault(); keys.current.togglePlay(); }
      if (event.key === "ArrowRight") keys.current.go(keys.current.line + 1);
      if (event.key === "ArrowLeft") keys.current.go(keys.current.line - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Swiping the cover sideways steps a line, like swiping between tracks.
  const swipe = useRef<number | null>(null);
  const onPointerDown = (event: PointerEvent) => { swipe.current = event.clientX; };
  const onPointerUp = (event: PointerEvent) => {
    if (swipe.current === null) return;
    const distance = event.clientX - swipe.current;
    swipe.current = null;
    if (Math.abs(distance) > 40) go(distance < 0 ? line + 1 : line - 1);
  };

  const fill = (index: number) => ({ transform: `scaleX(${index < line ? 1 : index === line ? progress : 0})` });
  const lineSpans = (index: number) => spans?.[index] ?? [];
  const speedName = (rate: number) => (rate === 1 ? t("courses.conversationScene.player.normal") : `${rate}×`);
  const transport = (
    <div className={styles.transport}>
      {/* The speed opens a small menu above it: slower, normal, or faster. */}
      <Popover opened={speedOpen} onChange={setSpeedOpen} position="top" offset={6} withArrow arrowSize={10} classNames={{ dropdown: styles.speedMenu }}
        styles={{ dropdown: speedMenuSurface, arrow: speedMenuSurface }}>
        <Popover.Target>
          <button type="button" className={styles.icon} data-on={speed !== 1 || undefined} aria-haspopup="menu" aria-expanded={speedOpen}
            aria-label={t("courses.conversationScene.player.speedIs", { speed: speedName(speed) })} onClick={() => setSpeedOpen(!speedOpen)}>
            {speed === 1 ? <Gauge /> : <span className={styles.speed}>{speed}×</span>}
          </button>
        </Popover.Target>
        <Popover.Dropdown>
          <div role="menu" aria-label={t("courses.conversationScene.player.speed")}>
            {SPEEDS.map((rate) => (
              <button key={rate} type="button" role="menuitemradio" aria-checked={speed === rate} className={styles.speedOption}
                onClick={() => { setSpeed(rate); setSpeedOpen(false); }}>
                {speedName(rate)}
              </button>
            ))}
          </div>
        </Popover.Dropdown>
      </Popover>
      <button type="button" className={styles.icon} aria-label={t("courses.conversationScene.player.previousLine")} onClick={back}><SkipBack className={styles.filled} /></button>
      <button type="button" className={styles.play} aria-label={playing ? t("courses.conversationScene.player.pause") : t("courses.conversationScene.player.play")}
        disabled={!playing && !paused && !clips[finished ? 0 : line]} onClick={togglePlay}>
        {playing ? <Pause className={styles.filled} /> : <Play className={styles.filled} />}
      </button>
      <button type="button" className={styles.icon} aria-label={t("courses.conversationScene.nextLine")} disabled={line === last} onClick={() => go(line + 1)}><SkipForward className={styles.filled} /></button>
      <button type="button" className={styles.icon} data-on={loop || undefined} aria-pressed={loop} aria-label={t("courses.conversationScene.player.repeatLine")} onClick={() => setLoop(!loop)}><Repeat1 /></button>
    </div>
  );
  // The conversation box: under the player, or in the cover's place. Whichever is showing (or the full screen view) carries the
  // view-transition-name, so the browser moves the one box between its places.
  const conversation = (place: "player" | "below") => (
    <section className={styles.lyrics} data-place={place} style={{ viewTransitionName: expanded ? "none" : "conversation" }}>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{t("courses.conversationScene.title")}</h2>
        <button type="button" className={styles.chip} aria-label={t("courses.conversationScene.player.openFullScreen")} onClick={() => transition(() => setExpanded(true))}><Maximize2 /></button>
      </header>
      <Transcript turns={turns} spans={lineSpans} portrait={portrait} line={line} translations={translations} onPick={go} className={styles.lyricsLines} />
    </section>
  );

  // Once the last line has played out, the next part of the lesson is suggested, like a player's up-next track.
  const upNextCard = (
    <section className={styles.upNext}>
      <p className={styles.eyebrow}>{t("courses.conversationScene.player.upNext")}</p>
      {upNext && <p className={styles.upNextTitle}>{upNext}</p>}
      <div className={styles.upNextActions}>
        {onContinue && <button type="button" className={styles.continue} onClick={onContinue}>{t("courses.conversationScene.continueLesson")} <ArrowRight /></button>}
        <button type="button" className={styles.again} onClick={again}><RotateCcw /> {t("courses.conversationScene.player.playAgain")}</button>
      </div>
    </section>
  );

  return (
    <HovercardDemoContext.Provider value={demo}>
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true">{backdrop && <img src={backdrop} alt="" />}</div>
      <div className={styles.column}>
        <section className={styles.player} aria-label={t("courses.conversationScene.player.label")} data-view={view}>
          <header className={styles.top}>
            {onExit ? <button type="button" className={styles.icon} aria-label={t("courses.conversationScene.backToLesson")} onClick={onExit}><ChevronDown /></button> : <span />}
            <div className={styles.titles}>
              <p className={styles.eyebrow}>{t("courses.conversationScene.player.eyebrow", { title })}</p>
              <h1 className={styles.scene}>{scene ?? t("courses.conversationScene.title")}</h1>
            </div>
            <div className={styles.topEnd}>
              <button type="button" className={styles.icon} aria-pressed={view === "conversation"}
                aria-label={view === "cover" ? t("courses.conversationScene.player.showConversation") : t("courses.conversationScene.player.showPicture")}
                onClick={() => transition(() => setView(view === "cover" ? "conversation" : "cover"))}>
                {view === "cover" ? <MessagesSquare /> : <ImageIcon />}
              </button>
              <button type="button" className={styles.icon} aria-label={t("courses.conversationScene.player.more")} onClick={() => setMenu(true)}><Ellipsis /></button>
            </div>
          </header>

          {view === "cover" ? <>
            <div className={styles.cover} data-cast={(!lineScenes?.[line]?.scene && Boolean(background)) || undefined} style={{ viewTransitionName: "cover" }} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipe.current = null; }}>
              {turns.map((entry, index) => {
                const art = lineScenes?.[index];
                const picture = art?.scene ?? background;
                return (
                  <div key={index} className={styles.art} data-active={index === line || undefined}>
                    {picture ? <img src={picture} alt="" draggable={false} /> : <Speaker className={styles.coverSpeaker} name={entry.speaker} portrait={portrait(entry.speaker)} />}
                    {art?.scene && art.mask && <img className={styles.mask} src={art.mask} alt="" draggable={false} />}
                  </div>
                );
              })}
              {!lineScenes?.[line]?.scene && background && (
                <div className={styles.cast} aria-hidden="true">
                  {cast.map((speaker) => (
                    <div key={speaker} className={styles.castMember} data-side={side(speaker)} data-speaking={speaker === turn.speaker || undefined}>
                      <Speaker className={styles.castPortrait} name={speaker} portrait={portrait(speaker)} />
                      <span className={styles.castName}>{speaker}</span>
                    </div>
                  ))}
                </div>
              )}
              <span className={styles.lineBadge}>{line + 1} / {turns.length}</span>
            </div>
            <Strip turns={turns} spans={lineSpans} portrait={portrait} line={line} finished={finished} translations={translations} onPick={go} upNext={upNextCard} />
          </> : <>
            {conversation("player")}
            {finished && upNextCard}
          </>}

          {/* One segment per line, as long as the line: tapping a segment jumps to its line. */}
          <div className={styles.scrubber}>
            <div className={styles.segments}>
              {turns.map((entry, index) => (
                <button key={index} type="button" className={styles.segment} style={{ flexGrow: durations[index] }}
                  aria-label={t("courses.conversationScene.player.segment", { number: index + 1, speaker: entry.speaker })} aria-current={index === line || undefined} onClick={() => go(index)}>
                  <span style={fill(index)} />
                </button>
              ))}
            </div>
            <div className={styles.times}><span>{clock(starts[line]! + elapsed)}</span><span>-{clock(total - starts[line]! - elapsed)}</span></div>
          </div>

          {transport}
        </section>

        {view === "cover" && conversation("below")}

        {intro.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("courses.conversationScene.player.intro")}</h2>
            {intro.map((content, index) => <p key={index} className={styles.introText}><InlineText content={content} /></p>)}
          </section>
        )}

        {words.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("courses.conversationScene.player.newWords")}</h2>
            <ul className={styles.words}>{words.map((word) => <li key={word.id}><HoverWord word={word}>{word.term}</HoverWord></li>)}</ul>
          </section>
        )}
      </div>

      {expanded && (
        <div className={styles.full} role="dialog" aria-label={t("courses.conversationScene.title")} style={{ viewTransitionName: "conversation" }}>
          <header className={styles.fullHead}>
            <div className={styles.titles}>
              <p className={styles.scene}>{scene ?? title}</p>
              <p className={styles.eyebrow}>{t("courses.conversationScene.player.position", { speaker: turn.speaker, number: line + 1, total: turns.length })}</p>
            </div>
            <button type="button" className={styles.chip} aria-label={t("courses.conversationScene.player.closeFullScreen")} onClick={() => transition(() => setExpanded(false))}><Minimize2 /></button>
          </header>
          <Transcript turns={turns} spans={lineSpans} portrait={portrait} line={line} translations={translations} onPick={go} className={styles.fullLines} />
          <div className={styles.fullBar}>
            <div className={styles.segments}>
              {turns.map((_, index) => (
                <span key={index} className={styles.segment} style={{ flexGrow: durations[index] }}><span style={fill(index)} /></span>
              ))}
            </div>
            {transport}
          </div>
        </div>
      )}

      {menu && (
        <div className={styles.sheetLayer} onClick={() => setMenu(false)}>
          <div className={styles.sheet} role="dialog" aria-label={t("courses.conversationScene.player.more")} onClick={(event) => event.stopPropagation()}>
            <span className={styles.grabber} aria-hidden="true" />
            <ul className={styles.menu}>
              <SheetItem icon={<Languages />} label={translations ? t("courses.conversationScene.player.hideTranslations") : t("courses.conversationScene.showTranslations")} onClick={() => setTranslations(!translations)} />
              <SheetItem icon={<Repeat1 />} label={loop ? t("courses.conversationScene.player.stopRepeating") : t("courses.conversationScene.player.repeatLine")} onClick={() => setLoop(!loop)} />
              {onShowInLesson && <SheetItem icon={<ArrowRight />} label={t("courses.conversationScene.player.showInLesson")} onClick={onShowInLesson} />}
            </ul>
          </div>
        </div>
      )}
    </div>
    </HovercardDemoContext.Provider>
  );
}

type LinesProps = {
  turns: readonly DialogueTurn[];
  spans: (index: number) => readonly WordSpan[];
  portrait: (speaker: string) => string | undefined;
  line: number;
  translations: boolean;
  onPick: (index: number) => void;
};

// A speaker's portrait, or their initial when the dialogue has none for them.
function Speaker({ name, portrait, className }: { name: string; portrait: string | undefined; className: string | undefined }) {
  return portrait ? <img className={className} src={portrait} alt="" /> : <span className={className} aria-hidden="true">{name.slice(0, 1)}</span>;
}

// The lines under the cover, like synced lyrics: every line is drawn the same, its speaker, its text with the new words marked, and
// its translation, and only fades with its distance from the current line. The column slides slowly so the current line sits a
// little below the top, the line before it showing above; once the conversation has played out it slides on to the up-next
// suggestion. Tapping another line goes there.
function Strip({ turns, spans, portrait, line, finished, translations, onPick, upNext }: LinesProps & { finished: boolean; upNext: ReactNode }) {
  const viewRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [offset, setOffset] = useState(0);
  const focus = finished ? turns.length : line;
  useLayoutEffect(() => {
    const view = viewRef.current;
    const list = listRef.current;
    if (!view || !list) return;
    const place = () => {
      const item = list.children[focus] as HTMLElement | undefined;
      if (item) setOffset(view.clientHeight * 0.28 - item.offsetTop);
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    observer.observe(view);
    observer.observe(list);
    return () => observer.disconnect();
  }, [focus, translations]);
  return (
    <div ref={viewRef} className={styles.strip}>
      <ol ref={listRef} className={styles.stripList} style={{ transform: `translateY(${offset}px)` }}>
        {turns.map((entry, index) => {
          const distance = Math.abs(index - focus);
          return (
            <li key={index} className={styles.stripLine} aria-current={index === line || undefined}
              style={{ opacity: distance === 0 ? 1 : distance === 1 ? 0.45 : distance === 2 ? 0.22 : 0.1 }}
              onClick={(event) => { if (index !== line && !(event.target instanceof Element && event.target.closest("[role=button]"))) onPick(index); }}>
              <div className={styles.stripHead}>
                <Speaker className={styles.avatar} name={entry.speaker} portrait={portrait(entry.speaker)} />
                <span className={styles.speaker}>{entry.speaker}</span>
              </div>
              <p className={styles.stripText}><MarkedText text={entry.text} spans={spans(index)} /></p>
              {translations && entry.translation && <p className={styles.stripTranslation}>{entry.translation}</p>}
            </li>
          );
        })}
        {finished && <li className={styles.stripLine}>{upNext}</li>}
      </ol>
    </div>
  );
}

function SheetItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick?: () => void }) {
  return <li><button type="button" className={styles.menuItem} onClick={onClick}>{icon}{label}</button></li>;
}

// The conversation as lyrics: lines already heard are bright, the current one brightest, the ones to come dim. The current line stays
// centred in the card, and tapping any other line jumps there; only the current line's new words open their cards, since the other
// lines are buttons themselves. Each line is headed by its speaker's portrait, with the name and the translation beside it.
function Transcript({ turns, spans, portrait, line, translations, onPick, className }: LinesProps & { className: string | undefined }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[line] as HTMLElement | undefined;
    if (list && item) list.scrollTo?.({ top: item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2, behavior: "smooth" });
  }, [line]);
  const lyric = (entry: DialogueTurn, index: number, cards: boolean) => {
    const translated = translations && Boolean(entry.translation);
    return <>
      <span className={styles.lyricHead} data-translated={translated || undefined}>
        <Speaker className={styles.lyricPortrait} name={entry.speaker} portrait={portrait(entry.speaker)} />
        <span className={styles.lyricWho}>
          <span className={styles.lyricSpeaker}>{entry.speaker}</span>
          {translated && <span className={styles.lyricTranslation}>{entry.translation}</span>}
        </span>
      </span>
      <span className={styles.lyricText}>{cards ? <MarkedText text={entry.text} spans={spans(index)} /> : <Underlined text={entry.text} spans={spans(index)} />}</span>
    </>;
  };
  return (
    <ol ref={listRef} className={className}>
      {turns.map((entry, index) => (
        <li key={index} className={styles.lyric} data-state={index < line ? "past" : index === line ? "now" : "next"}>
          {index === line ? <div className={styles.lyricBody}>{lyric(entry, index, true)}</div>
            : <button type="button" className={styles.lyricBody} onClick={() => onPick(index)}>{lyric(entry, index, false)}</button>}
        </li>
      ))}
    </ol>
  );
}

// A line's new words marked like the cards' words, without opening anything.
function Underlined({ text, spans }: { text: string; spans: readonly WordSpan[] }) {
  const nodes: ReactNode[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start < at) continue;
    nodes.push(text.slice(at, span.start), <span key={span.start} className={styles.underlined}>{text.slice(span.start, span.end)}</span>);
    at = span.end;
  }
  nodes.push(text.slice(at));
  return <>{nodes}</>;
}
