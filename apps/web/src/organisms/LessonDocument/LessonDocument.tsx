import {
  inlineText,
  isSafeLessonHref,
  readDialogueTurns,
  readVocabularyBlock,
  type InlineContent,
  type LessonBlock,
  type LessonBlockOf,
  type LessonColor,
  type LessonDocument as LessonDocumentData,
  type ListItemBlock,
  type StyledText,
  type VocabularyWord,
  walkLessonBlocks,
} from "@wordinator/contracts/lesson-document";
import { createContext, Fragment, useContext, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { Callout } from "../../molecules/Callout";
import { PlainText } from "../../molecules/PlainText";
import { pauseSpeech, playSpeech, resumeSpeech, SpeechButton, SpeechFailure, stopSpeech, useSpeechElapsed, useSpeechFailure, useSpeechPlayback, useSpeechResolver, useSpeechUrl, useStopSpeechOnUnmount } from "../../molecules/Speech";
import { WordBookmarkToggle } from "../WordBookmark/WordBookmark";
import styles from "./LessonDocument.module.css";

// Wordinator's own lesson renderer. Every piece of authored text becomes a React text node, so nothing is parsed as HTML;
// links render only for http and https, and colours map to design tokens through fixed class names.
export type PracticeRenderer = (block: LessonBlockOf<"practice">) => ReactNode;
// A practice in a group with the text of the level-3 heading right above it, which titles it (null without one).
export type PracticeGroupItem = { title: string | null; block: LessonBlockOf<"practice"> };
export type PracticeGroupRenderer = (items: PracticeGroupItem[]) => ReactNode;
// The lesson page passes `renderShare` to make examples and dialogues selectable; it renders the selected block's share action.
export type ShareableBlock = LessonBlockOf<"example"> | LessonBlockOf<"dialogue">;
export type ShareRenderer = (block: ShareableBlock) => ReactNode;
// The lesson page passes `renderAfterBlock` to place content after a block of any depth (AI practices, docs/courses.md#lesson-pages).
// It is called once for every block ID of the document, in reading order; a block the reader leaves out (a New words block, a
// trailing blank paragraph, a child of a block that shows no children) still gets its slot where it would have been.
export type AfterBlockRenderer = (blockId: string) => ReactNode;
const AfterBlockContext = createContext<AfterBlockRenderer | null>(null);

function AfterBlocks({ blocks }: { blocks: readonly LessonBlock[] }) {
  const render = useContext(AfterBlockContext);
  if (!render) return null;
  return <>{[...walkLessonBlocks(blocks)].map(({ block }) => <Fragment key={block.id}>{render(block.id)}</Fragment>)}</>;
}
function AfterBlock({ id }: { id: string }) {
  const render = useContext(AfterBlockContext);
  return render ? <>{render(id)}</> : null;
}

const join = (...names: Array<string | false | undefined>) =>
  names.filter(Boolean).join(" ") || undefined;
const textColor = (color: LessonColor | undefined) =>
  color && color !== "default" ? styles[`text-${color}`] : undefined;
const surfaceColor = (color: LessonColor | undefined) =>
  color && color !== "default" ? styles[`surface-${color}`] : undefined;

function Styled({ item }: { item: StyledText }) {
  let node: ReactNode = item.text;
  if (item.styles.bold) node = <strong>{node}</strong>;
  if (item.styles.italic) node = <em>{node}</em>;
  const className = join(
    textColor(item.styles.textColor),
    surfaceColor(item.styles.backgroundColor),
  );
  return className ? <span className={className}>{node}</span> : <>{node}</>;
}

export function InlineText({ content }: { content: InlineContent }) {
  return (
    <>
      {content.map((item, index) => {
        if (item.type === "text") return <Styled key={index} item={item} />;
        const parts = item.content.map((part, partIndex) => (
          <Styled key={partIndex} item={part} />
        ));
        // The contracts already reject other schemes; the renderer checks again so a stored document can never produce one.
        return isSafeLessonHref(item.href) ? (
          <a
            key={index}
            className={styles.link}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {parts}
          </a>
        ) : (
          <Fragment key={index}>{parts}</Fragment>
        );
      })}
    </>
  );
}

const blockColors = (props: {
  textColor: LessonColor;
  backgroundColor: LessonColor;
}) =>
  join(
    textColor(props.textColor),
    surfaceColor(props.backgroundColor),
    props.backgroundColor !== "default" && styles.tinted,
  );

// The player passes `details` to reveal the translation and note step by step; the reader shows them directly.
export function ExampleBlock({
  block,
  details,
}: {
  block: LessonBlockOf<"example">;
  details?: ReactNode;
}) {
  const { t } = useTranslation();
  const { translation, note } = block.props;
  const speech = useSpeechUrl(`example:${block.id}`);
  return (
    <figure className={styles.example}>
      <div className={styles.spoken}>
        <blockquote className={styles.sentence}>
          <InlineText content={block.content} />
        </blockquote>
        <SpeechButton url={speech} label={t("courses.speech.example")} />
      </div>
      {details ?? (
        <>
          {translation && (
            <figcaption className={styles.translation}>
              {translation}
            </figcaption>
          )}
          {note && <p className={styles.note}>{note}</p>}
        </>
      )}
    </figure>
  );
}

// The player passes `upTo` to show the turns read so far, and the dialogue plays only those. Each turn with a ready clip has its
// own speaker button; while the dialogue plays or is paused, the turn being spoken is marked.
export function DialogueBlock({
  block,
  upTo,
}: {
  block: LessonBlockOf<"dialogue">;
  upTo?: number;
}) {
  return <DialogueTurns blockId={block.id} turns={readDialogueTurns(block)} upTo={upTo} />;
}

// A dialogue's turns with their speech, resolved in the current speech scope under the lesson's turn keys. A lesson share renders
// a shared dialogue through this as well.
export function DialogueTurns({
  blockId,
  turns: source,
  upTo,
}: {
  blockId: string;
  turns: ReadonlyArray<{ speaker: string; text: string }>;
  upTo?: number;
}) {
  const { t } = useTranslation();
  const resolve = useSpeechResolver();
  const owner = `dialogue:${blockId}`;
  const playback = useSpeechPlayback(owner);
  const turns = source
    .slice(0, upTo === undefined ? undefined : upTo + 1)
    .map((turn, index) => ({ ...turn, index, speech: resolve(`turn:${blockId}:${index}`) }));
  const ready = turns.filter((turn) => turn.speech);
  const speaking = playback && playback.status !== "error" ? ready[playback.index]?.index : undefined;
  return (
    <div className={styles.dialogue}>
      {ready.length > 0 && <DialogueControls owner={owner} turns={ready.map((turn) => ({ speaker: turn.speaker, url: turn.speech! }))} />}
      <ol className={styles.turns}>
        {turns.map((turn) => (
          <li
            key={turn.index}
            className={join(turn.index === upTo && styles.newest, turn.index === speaking && styles.speaking)}
            aria-current={turn.index === speaking || undefined}
          >
            <span className={styles.speaker}>{turn.speaker}</span>
            <span className={styles.line}>{turn.text}</span>
            <SpeechButton url={turn.speech} label={t("courses.speech.turn", { number: turn.index + 1, speaker: turn.speaker })} />
          </li>
        ))}
      </ol>
    </div>
  );
}

// Plays a dialogue's ready turns in order (docs/speech.md#playback): play, pause, and resume; previous and next line; stop; and a
// progress bar with one segment per line, which is also a slider that starts the dialogue at the line pressed or keyed to.
function DialogueControls({ owner, turns }: { owner: string; turns: ReadonlyArray<{ speaker: string; url: string }> }) {
  const { t } = useTranslation();
  const playback = useSpeechPlayback(owner);
  const elapsed = useSpeechElapsed(owner);
  useStopSpeechOnUnmount(owner);
  const [failed, setFailed] = useSpeechFailure(playback?.status);
  const urls = turns.map((turn) => turn.url);
  const total = turns.length;
  const active = playback && playback.status !== "error" ? playback : null;
  const current = active ? active.index : -1;
  const paused = active?.status === "paused";
  const goTo = (index: number) => {
    setFailed(false);
    playSpeech(owner, urls, Math.min(total - 1, Math.max(0, index)));
  };
  const toggle = () => {
    setFailed(false);
    if (!active) playSpeech(owner, urls);
    else if (paused) resumeSpeech();
    else pauseSpeech();
  };
  const label = !active ? t("courses.speech.playDialogue") : paused ? t("courses.speech.resumeDialogue") : t("courses.speech.pauseDialogue");
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = { ArrowLeft: current - 1, ArrowDown: current - 1, ArrowRight: current + 1, ArrowUp: current + 1, Home: 0, End: total - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    if (target >= 0 && target !== current) goTo(target);
  };
  const onBarClick = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) goTo(Math.floor(((event.clientX - box.left) / box.width) * total));
  };
  return (
    <div className={styles.dialogueControls}>
      <button type="button" className={styles.transport} aria-label={t("courses.speech.previousLine")} disabled={!active} onClick={() => goTo(current - 1)}>
        <SkipBack aria-hidden="true" className={styles.playIcon} />
      </button>
      <span className={styles.playDialogueWrap}>
        <button type="button" className={styles.playDialogue} aria-label={label} aria-busy={active?.status === "loading" || undefined} onClick={toggle}>
          {active && !paused ? <Pause aria-hidden="true" className={styles.playIcon} /> : <Play aria-hidden="true" className={styles.playIcon} />}
        </button>
        {failed && <SpeechFailure />}
      </span>
      <button type="button" className={styles.transport} aria-label={t("courses.speech.nextLine")} disabled={!active || current >= total - 1} onClick={() => goTo(current + 1)}>
        <SkipForward aria-hidden="true" className={styles.playIcon} />
      </button>
      <button type="button" className={styles.transport} aria-label={t("courses.speech.stopDialogue")} disabled={!active} onClick={() => { setFailed(false); stopSpeech(); }}>
        <Square aria-hidden="true" className={styles.playIcon} />
      </button>
      <div
        className={styles.dialogueProgress}
        role="slider"
        tabIndex={0}
        aria-label={t("courses.speech.dialogueProgress")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current + 1}
        aria-valuetext={active ? t("courses.speech.lineOf", { number: current + 1, total, speaker: turns[current]!.speaker }) : t("courses.speech.notStarted")}
        onKeyDown={onKeyDown}
        onClick={onBarClick}
      >
        {turns.map((turn, index) => (
          <span key={index} className={styles.segment} data-current={index === current || undefined}>
            <span className={styles.segmentFill} style={{ transform: `scaleX(${index < current ? 1 : index === current ? elapsed : 0})` }} />
          </span>
        ))}
      </div>
      <span className={styles.dialogueCount} aria-hidden="true">{t("courses.speech.count", { number: current + 1, total })}</span>
    </div>
  );
}

// New words as a compact list: the term with its forms and the meaning, with Show more opening the example and note when a
// word has them. Every field is plain text. The reader shows a vocabulary block this way in place; the player shows a step's
// words as a panel.
export function NewWords({ words }: { words: readonly VocabularyWord[] }) {
  const { t } = useTranslation();
  return (
    <section className={styles.words} aria-label={t("courses.words.title")}>
      <p className={styles.wordsTitle} aria-hidden="true">
        {t("courses.words.title")}
      </p>
      <ul className={styles.wordList}>
        {words.map((word) => (
          <NewWord word={word} key={word.id} />
        ))}
      </ul>
    </section>
  );
}

function NewWord({ word }: { word: VocabularyWord }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const example = word.example?.trim(); const note = word.note?.trim();
  const termSpeech = useSpeechUrl(`word:${word.id}`); const exampleSpeech = useSpeechUrl(`wordExample:${word.id}`);
  return (
    <li className={styles.word}>
      <p className={styles.wordHead}>
        <span className={styles.term}>{word.term}</span>
        <SpeechButton url={termSpeech} label={t("courses.speech.term", { term: word.term })} />
        {word.forms?.trim() && (
          <span className={styles.forms}>{word.forms}</span>
        )}
        <span className={styles.wordBookmark}>
          <WordBookmarkToggle wordId={word.id} term={word.term} />
        </span>
      </p>
      <p className={styles.meaning}>
        <PlainText>{word.meaning}</PlainText>
      </p>
      {(example || note) && (
        <>
          {open && (
            <div id={detailsId} className={styles.wordDetails}>
              {example && (
                <p className={styles.spoken}>
                  <span className={styles.wordExample}>
                    <PlainText>{word.example!}</PlainText>
                  </span>
                  <SpeechButton url={exampleSpeech} label={t("courses.speech.wordExample", { term: word.term })} />
                </p>
              )}
              {note && (
                <p className={styles.note}>
                  <PlainText>{word.note!}</PlainText>
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            className={styles.wordToggle}
            aria-expanded={open}
            aria-controls={open ? detailsId : undefined}
            aria-label={t(open ? "courses.words.showLessAbout" : "courses.words.showMoreAbout", { term: word.term })}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? t("courses.words.showLess") : t("courses.words.showMore")}
          </button>
        </>
      )}
    </li>
  );
}

// How the lesson page reads a document: `anchored` wraps each block in an element carrying its ID, so the page can tell which
// blocks are on screen, and `vocabulary: false` leaves New words blocks out because the page lists them beside the text.
// `renderPracticeGroup` shows two or more practices in a row, each under its level-3 title if it has one, as one component (the
// lesson page's practice stepper); without it they read one after another.
type ReaderOptions = { anchored: boolean; vocabulary: boolean; renderPracticeGroup?: PracticeGroupRenderer };
const ReaderOptionsContext = createContext<ReaderOptions>({ anchored: false, vocabulary: true });
type Selection = { selected: string | null; select: (id: string | null) => void; renderShare: ShareRenderer };
const SelectionContext = createContext<Selection | null>(null);

// Clicking a block, or pressing Enter on it, selects it and reveals its share action (docs/lesson-shares.md#where-to-share). Clicks
// on its own controls (speaker buttons, the dialogue transport, links) do not select it. Escape or a click anywhere outside the
// block clears the selection, except inside a dialog, so the share confirmation keeps it. It clears on click rather than on press:
// the share row collapses when it clears, and clearing on press would move whatever is below it before the click lands.
const INTERACTIVE = "a, button, input, textarea, select, summary, [role=slider], [contenteditable]";
function SelectableBlock({ block, children }: { block: ShareableBlock; children: ReactNode }) {
  const { t } = useTranslation();
  const selection = useContext(SelectionContext)!;
  const { select } = selection;
  const selected = selection.selected === block.id;
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    const onDocumentClick = (event: globalThis.MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && (element.current?.contains(target) || target.closest("[role=dialog], .mantine-Modal-root"))) return;
      // A click that selects another block has already moved the selection there.
      if (target?.closest(`.${styles.selectable}`) && !target.closest(INTERACTIVE)) return;
      select(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) select(null); };
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("click", onDocumentClick); document.removeEventListener("keydown", onKeyDown); };
  }, [select, selected]);
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null;
    if (target && target !== event.currentTarget && event.currentTarget.contains(target)) return;
    select(block.id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.target !== event.currentTarget) return;
    event.preventDefault();
    select(block.id);
  };
  return (
    <div
      ref={element}
      className={styles.selectable}
      data-selected={selected || undefined}
      tabIndex={0}
      role="group"
      aria-label={t(`lessonShares.select.${block.type}`)}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
      {selected && <div className={styles.selectedActions}>{selection.renderShare(block)}</div>}
    </div>
  );
}

function Shareable({ block, children }: { block: ShareableBlock; children: ReactNode }) {
  return useContext(SelectionContext) ? <SelectableBlock block={block}>{children}</SelectableBlock> : <>{children}</>;
}

// Document headings sit below the lesson title (an h2), so levels 1–3 render as h3–h5.
const headingTags = { 1: "h3", 2: "h4", 3: "h5" } as const;

function ListItems({
  items,
  renderPractice,
}: {
  items: ListItemBlock[];
  renderPractice?: PracticeRenderer;
}) {
  const groups: ListItemBlock[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last[0]!.type === item.type) last.push(item);
    else groups.push([item]);
  }
  return (
    <>
      {groups.map((group) => {
        const first = group[0]!;
        const children = group.map((item) => (
          <li key={item.id} className={blockColors(item.props)}>
            <InlineText content={item.content} />
            {item.children.length > 0 && (
              <ListItems
                items={item.children}
                renderPractice={renderPractice}
              />
            )}
            <AfterBlock id={item.id} />
          </li>
        ));
        return first.type === "numberedListItem" ? (
          <ol key={first.id} className={styles.list} start={first.props.start}>
            {children}
          </ol>
        ) : (
          <ul key={first.id} className={styles.list}>
            {children}
          </ul>
        );
      })}
    </>
  );
}

function Block({
  block,
  renderPractice,
}: {
  block: Exclude<LessonBlock, ListItemBlock>;
  renderPractice?: PracticeRenderer;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className={join(styles.paragraph, blockColors(block.props))}>
          <InlineText content={block.content} />
        </p>
      );
    case "heading": {
      const Tag = headingTags[block.props.level];
      return (
        <Tag
          className={join(
            styles.heading,
            styles[`level${block.props.level}`],
            blockColors(block.props),
          )}
        >
          <InlineText content={block.content} />
        </Tag>
      );
    }
    case "divider":
      return <hr className={styles.divider} />;
    case "image":
      return block.props.url ? (
        <figure className={styles.image}>
          <img
            src={block.props.url}
            alt={block.props.name}
            loading="lazy"
            style={
              block.props.previewWidth
                ? { width: `min(100%, ${block.props.previewWidth}px)` }
                : undefined
            }
          />
          {block.props.caption && (
            <figcaption>{block.props.caption}</figcaption>
          )}
        </figure>
      ) : null;
    case "callout":
      return (
        <Callout variant={block.props.variant} icon={block.props.icon}>
          <InlineText content={block.content} />
        </Callout>
      );
    case "example":
      return <Shareable block={block}><ExampleBlock block={block} /></Shareable>;
    case "dialogue":
      return <Shareable block={block}><DialogueBlock block={block} /></Shareable>;
    case "practice":
      return <>{renderPractice?.(block)}</>;
    case "vocabulary":
      return <NewWords words={readVocabularyBlock(block).words} />;
    case "column":
      return (
        <div className={styles.column}>
          <LessonBlocks
            blocks={block.children}
            renderPractice={renderPractice}
          />
          <AfterBlock id={block.id} />
        </div>
      );
    case "columnList": {
      const total = block.children.reduce(
        (sum, column) => sum + column.props.width,
        0,
      );
      const template = block.children
        .map((column) => `minmax(0, ${column.props.width / total}fr)`)
        .join(" ");
      return (
        <div
          className={styles.columns}
          style={{ "--lesson-columns": template } as CSSProperties}
        >
          {block.children.map((column) => (
            <Block
              key={column.id}
              block={column}
              renderPractice={renderPractice}
            />
          ))}
        </div>
      );
    }
  }
}

const isListItem = (block: LessonBlock): block is ListItemBlock =>
  block.type === "bulletListItem" || block.type === "numberedListItem";

// A practice group: two or more practices in a row, each optionally under a non-empty level-3 heading that titles it. Dividers,
// blank paragraphs, and New words blocks the page leaves out may sit between them. `blocks` is every block the group takes in.
type PracticeGroup = { items: PracticeGroupItem[]; blocks: LessonBlock[] };
const isGap = (block: LessonBlock, vocabulary: boolean) => block.type === "divider" || (!vocabulary && block.type === "vocabulary")
  || (block.type === "paragraph" && !inlineText(block.content).trim());
const titleOf = (block: LessonBlock | undefined) => block?.type === "heading" && block.props.level === 3 ? inlineText(block.content).replace(/\s+/g, " ").trim() || null : null;
function practiceGroupAt(blocks: readonly LessonBlock[], start: number, vocabulary: boolean): { group: PracticeGroup; next: number } | null {
  const items: PracticeGroupItem[] = []; const taken: LessonBlock[] = [];
  let index = start;
  for (;;) {
    let at = index; const between: LessonBlock[] = [];
    if (items.length) while (at < blocks.length && isGap(blocks[at]!, vocabulary)) between.push(blocks[at++]!);
    const title = titleOf(blocks[at]);
    const heading = title !== null ? blocks[at++]! : null;
    if (heading) while (at < blocks.length && isGap(blocks[at]!, vocabulary)) between.push(blocks[at++]!);
    const block = blocks[at];
    if (block?.type !== "practice") break;
    items.push({ title, block }); taken.push(...between, ...(heading ? [heading] : []), block);
    index = at + 1;
  }
  return items.length >= 2 ? { group: { items, blocks: taken }, next: index } : null;
}

// Renders a run of sibling blocks, grouping consecutive list items into one list. Trailing blank paragraphs, which the
// editor always keeps, are dropped.
export function LessonBlocks({
  blocks,
  renderPractice,
}: {
  blocks: readonly LessonBlock[];
  renderPractice?: PracticeRenderer;
}) {
  const { anchored, vocabulary, renderPracticeGroup } = useContext(ReaderOptionsContext);
  let end = blocks.length;
  while (
    end > 0 &&
    blocks[end - 1]!.type === "paragraph" &&
    !inlineText((blocks[end - 1] as LessonBlockOf<"paragraph">).content).trim()
  )
    end -= 1;
  // A block left out of the reading keeps only its after-block slot.
  const runs: Array<LessonBlock | ListItemBlock[] | { hidden: LessonBlock } | { group: PracticeGroup }> = [];
  const shown = blocks.slice(0, end);
  for (let index = 0; index < shown.length; index += 1) {
    const block = shown[index]!;
    const grouped = renderPracticeGroup && (block.type === "practice" || titleOf(block) !== null) ? practiceGroupAt(shown, index, vocabulary) : null;
    if (grouped) { runs.push({ group: grouped.group }); index = grouped.next - 1; continue; }
    if (!vocabulary && block.type === "vocabulary") { runs.push({ hidden: block }); continue; }
    const last = runs.at(-1);
    if (isListItem(block) && Array.isArray(last)) last.push(block);
    else runs.push(isListItem(block) ? [block] : block);
  }
  return (
    <>
      {runs.map((run) => {
        if ("hidden" in run) return <AfterBlocks key={run.hidden.id} blocks={[run.hidden]} />;
        if ("group" in run) {
          // The group's first practice anchors it; every other block it takes in gets an empty anchor at its top, so the page still
          // finds each block (a hidden practice's steps are reached with the group).
          const [first, ...others] = [run.group.items[0]!.block, ...run.group.blocks.filter((block) => block.id !== run.group.items[0]!.block.id)];
          const content = renderPracticeGroup!(run.group.items);
          return <Fragment key={first!.id}>
            {anchored ? <div className={styles.anchor} data-block-id={first!.id}>
              {others.map((block) => <span key={block.id} className={styles.groupAnchor} data-block-id={block.id} />)}
              {content}
            </div> : content}
            <AfterBlocks blocks={run.group.blocks} />
          </Fragment>;
        }
        const id = Array.isArray(run) ? run[0]!.id : run.id;
        // List items and columns place their own slots; any other block shows no children, so its slot covers them too.
        const after = Array.isArray(run) ? null : run.type === "columnList" ? <AfterBlock id={run.id} /> : <AfterBlocks blocks={[run]} />;
        const content = Array.isArray(run) ? (
          <ListItems
            key={run[0]!.id}
            items={run}
            renderPractice={renderPractice}
          />
        ) : (
          <Block
            key={run.id}
            block={run as Exclude<LessonBlock, ListItemBlock>}
            renderPractice={renderPractice}
          />
        );
        // The slot sits outside the anchor element, so what it shows never counts as the block's own height.
        return anchored ? (
          <Fragment key={id}>
            <div className={styles.anchor} data-block-id={id}>
              {content}
            </div>
            {after}
          </Fragment>
        ) : (
          <Fragment key={id}>{content}{after}</Fragment>
        );
      })}
      {end < blocks.length && <AfterBlocks blocks={blocks.slice(end)} />}
    </>
  );
}

export function LessonDocument({
  document,
  renderPractice,
  renderShare,
  renderAfterBlock,
  anchored = false,
  vocabulary = true,
  renderPracticeGroup,
}: {
  document: LessonDocumentData;
  renderPractice?: PracticeRenderer;
  renderPracticeGroup?: PracticeGroupRenderer;
  renderShare?: ShareRenderer;
  renderAfterBlock?: AfterBlockRenderer;
  anchored?: boolean;
  vocabulary?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const blocks = (
    <div className={styles.document}>
      <LessonBlocks blocks={document.blocks} renderPractice={renderPractice} />
    </div>
  );
  return (
    <ReaderOptionsContext.Provider value={{ anchored, vocabulary, renderPracticeGroup }}>
      <AfterBlockContext.Provider value={renderAfterBlock ?? null}>
        {renderShare ? (
          <SelectionContext.Provider value={{ selected, select: setSelected, renderShare }}>{blocks}</SelectionContext.Provider>
        ) : (
          blocks
        )}
      </AfterBlockContext.Provider>
    </ReaderOptionsContext.Provider>
  );
}
