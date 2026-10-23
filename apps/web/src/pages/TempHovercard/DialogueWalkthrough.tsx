import { readDialogueTurns, type LessonBlockOf, type VocabularyWord } from "@wordinator/contracts/lesson-document";
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { pauseSpeech, playSpeech, resumeSpeech, SpeechButton, stopSpeech, useSpeechPlayback, useSpeechResolver, useStopSpeechOnUnmount } from "../../molecules/Speech";
import { MarkedText } from "./LessonText";
import type { WordSpan } from "./wordMatch";
import { useHovercardDemo, WordCard } from "./WordHovercard";
import styles from "./TempHovercard.module.css";

// Prototype: a dialogue read one line at a time. Each line opens the cards of the new words it shows first, all at once, laid out
// over the line near their words; cards that do not fit above the line go below it. Next line moves on and plays the line, then,
// with Say words on, each opened word. Auto-read plays the rest of the dialogue line after line, opening each line's cards as it
// goes, without saying the words; pausing or stepping ends it.
export function DialogueWalkthrough({ block, spans }: { block: LessonBlockOf<"dialogue">; spans: readonly WordSpan[][] }) {
  const { t } = useTranslation();
  const { sayWords, words } = useHovercardDemo();
  const resolve = useSpeechResolver();
  const turns = useMemo(() => readDialogueTurns(block), [block]);
  const owner = `walkthrough:${block.id}`;
  const playback = useSpeechPlayback(owner);
  useStopSpeechOnUnmount(owner);
  const [current, setCurrent] = useState(-1);
  const [auto, setAuto] = useState(false);
  // The lines an auto-read queued, by queue position, so the playing clip names its line.
  const autoLines = useRef<number[]>([]);

  const lineUrl = (line: number) => resolve(`turn:${block.id}:${line}`);
  // Each word's card opens on the first line that shows it; later lines only mark it.
  const cards = useMemo(() => {
    const seen = new Set<string>();
    return spans.map((list) => list.flatMap((span) => {
      if (seen.has(span.wordId)) return [];
      seen.add(span.wordId);
      return [span.wordId];
    }));
  }, [spans]);

  useEffect(() => {
    if (auto && playback && playback.status !== "error") setCurrent(autoLines.current[playback.index] ?? current);
    // Playback that ends or is taken over by another button ends the auto-read.
    if (auto && !playback) setAuto(false);
  }, [auto, playback]);

  const step = useCallback((line: number) => {
    const next = Math.max(0, Math.min(turns.length - 1, line));
    setAuto(false); setCurrent(next);
    const url = lineUrl(next);
    const wordUrls = sayWords ? cards[next]!.flatMap((id) => resolve(`word:${id}`) ?? []) : [];
    const queue = [...(url ? [url] : []), ...wordUrls];
    if (queue.length) playSpeech(owner, queue); else stopSpeech();
  }, [turns.length, sayWords, cards, resolve, owner]);

  const startAuto = () => {
    if (auto && playback?.status === "paused") { resumeSpeech(); return; }
    if (auto) { pauseSpeech(); return; }
    const from = Math.max(0, current === turns.length - 1 ? 0 : current);
    const lines = turns.map((_, line) => line).filter((line) => line >= from && lineUrl(line));
    if (!lines.length) return;
    autoLines.current = lines;
    playSpeech(owner, lines.map((line) => lineUrl(line)!));
    setCurrent(lines[0]!); setAuto(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight" || event.key === "Enter") { event.preventDefault(); if (current < turns.length - 1) step(current + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); if (current > 0) step(current - 1); }
  };

  const playing = auto && playback?.status !== "paused";
  const last = current === turns.length - 1;
  return (
    <div className={styles.walkthrough} tabIndex={0} onKeyDown={onKeyDown} aria-label={`Dialogue walkthrough, line ${current + 1} of ${turns.length}`}>
      <ol className={styles.walkTurns}>
        {turns.slice(0, current + 1).map((turn, line) => (
          <li key={line} className={styles.walkTurn} data-current={line === current || undefined}>
            {line === current
              ? <CurrentLine speaker={turn.speaker} text={turn.text} spans={spans[line] ?? []} cardIds={cards[line] ?? []} words={words}
                  speech={<SpeechButton url={lineUrl(line)} label={t("courses.speech.turn", { number: line + 1, speaker: turn.speaker })} />} />
              : <div className={styles.walkLine}>
                  <span className={styles.walkSpeaker}>{turn.speaker}</span>
                  <span className={styles.walkText}><MarkedText text={turn.text} spans={spans[line] ?? []} /></span>
                </div>}
          </li>
        ))}
      </ol>
      {current < 0 && <p className={styles.walkIntro}>{turns.length} lines. Each line opens the cards of its new words.</p>}
      <div className={styles.walkBar}>
        <button type="button" className={styles.walkIcon} aria-label="Previous line" disabled={current <= 0} onClick={() => step(current - 1)}>
          <ArrowLeft aria-hidden="true" />
        </button>
        {last
          ? <button type="button" className={styles.walkPrimary} onClick={() => { stopSpeech(); setAuto(false); setCurrent(-1); }}>
              <RotateCcw aria-hidden="true" /> Start again
            </button>
          : <button type="button" className={styles.walkPrimary} onClick={() => step(current + 1)}>
              {current < 0 ? "Start dialogue" : "Next line"} <ArrowRight aria-hidden="true" />
            </button>}
        <button type="button" className={styles.walkAuto} aria-pressed={auto} onClick={startAuto}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {auto ? (playing ? "Pause" : "Resume") : "Auto-read"}
        </button>
        <span className={styles.walkCount}>{Math.max(0, current + 1)} / {turns.length}</span>
      </div>
    </div>
  );
}

type Placement = { id: string; row: "top" | "bottom"; left: number; caret: number };
const GAP = 8;

// Lays cards out along a row of width `width`: each as close over its word's centre as it can be without overlapping the one
// before it. Returns null when they do not fit.
function placeRow(items: Array<{ id: string; width: number; center: number }>, width: number) {
  let right = -GAP;
  const placed: Array<{ id: string; left: number; caret: number }> = [];
  for (const item of [...items].sort((a, b) => a.center - b.center)) {
    const left = Math.max(right + GAP, Math.min(width - item.width, Math.max(0, item.center - item.width / 2)));
    if (left + item.width > width + 0.5) return null;
    placed.push({ id: item.id, left, caret: Math.min(item.width - 16, Math.max(16, item.center - left)) });
    right = left + item.width;
  }
  return placed;
}

// The current line between its two card rows. Cards are measured first, then placed: as many as fit above the line in reading
// order, the rest below; when even the lower row overflows, it wraps instead.
function CurrentLine({ speaker, text, spans, cardIds, words, speech }: {
  speaker: string; text: string; spans: readonly WordSpan[]; cardIds: readonly string[]; words: ReadonlyMap<string, VocabularyWord>; speech: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ placements: Placement[]; wrap: boolean; heights: { top: number; bottom: number } } | null>(null);
  const key = cardIds.join(",");

  const measure = useCallback(() => {
    const element = root.current;
    if (!element || !cardIds.length) { setLayout(null); return; }
    const box = element.getBoundingClientRect();
    const items = cardIds.map((id) => {
      const card = element.querySelector<HTMLElement>(`[data-card="${id}"]`);
      const mark = element.querySelector<HTMLElement>(`[data-line] [data-word="${id}"]`)?.getBoundingClientRect();
      return { id, width: card?.offsetWidth ?? 0, height: card?.offsetHeight ?? 0, center: mark ? mark.left + mark.width / 2 - box.left : box.width / 2 };
    });
    const top: typeof items = []; const bottom: typeof items = [];
    for (const item of items) (placeRow([...top, item], box.width) ? top : bottom).push(item);
    const above = placeRow(top, box.width) ?? []; const below = placeRow(bottom, box.width);
    const height = (list: typeof items) => Math.max(0, ...list.map((item) => item.height));
    setLayout({
      placements: [...above.map((place) => ({ ...place, row: "top" as const })), ...(below ?? bottom.map((item) => ({ id: item.id, left: 0, caret: 24 }))).map((place) => ({ ...place, row: "bottom" as const }))],
      wrap: !below,
      heights: { top: height(top), bottom: height(bottom) },
    });
  }, [key]);

  useLayoutEffect(() => { setLayout(null); }, [key]);
  useLayoutEffect(() => { if (!layout) measure(); }, [layout, measure]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let width = element.offsetWidth;
    const observer = new ResizeObserver(() => { if (element.offsetWidth !== width) { width = element.offsetWidth; setLayout(null); } });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const card = (id: string, place?: Placement) => {
    const word = words.get(id);
    if (!word) return null;
    const style = place && !(layout?.wrap && place.row === "bottom") ? { left: place.left, "--caret": `${place.caret}px` } as CSSProperties : undefined;
    return <div key={id} data-card={id} data-row={place?.row} className={styles.lineCard} style={style}><WordCard word={word} compact /></div>;
  };
  const row = (which: "top" | "bottom") => layout?.placements.filter((place) => place.row === which) ?? [];

  return (
    <div ref={root} className={styles.current}>
      {!layout && cardIds.length > 0 && <div className={styles.measure} aria-hidden="true">{cardIds.map((id) => card(id))}</div>}
      {layout && row("top").length > 0 && (
        <div className={styles.cardRow} style={{ height: layout.heights.top }}>{row("top").map((place) => card(place.id, place))}</div>
      )}
      <div className={styles.walkLine} data-line>
        <span className={styles.walkSpeaker}>{speaker}</span>
        <span className={styles.walkText}><MarkedText text={text} spans={spans} /></span>
        {speech}
      </div>
      {layout && row("bottom").length > 0 && (
        <div className={styles.cardRow} data-wrap={layout.wrap || undefined} style={layout.wrap ? undefined : { height: layout.heights.bottom }}>
          {row("bottom").map((place) => card(place.id, place))}
        </div>
      )}
      {!cardIds.length && <p className={styles.noCards}>No new words in this line.</p>}
    </div>
  );
}
