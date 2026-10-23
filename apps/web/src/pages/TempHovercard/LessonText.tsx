import {
  isSafeLessonHref, readDialogueTurns, type InlineContent, type LessonBlock, type LessonBlockOf, type LessonDocument, type ListItemBlock, type StyledText,
} from "@wordinator/contracts/lesson-document";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Callout } from "../../molecules/Callout";
import { SpeechButton, useSpeechResolver, useSpeechUrl } from "../../molecules/Speech";
import docStyles from "../../organisms/LessonDocument/LessonDocument.module.css";
import type { LessonMarks } from "./lessonWords";
import type { WordSpan } from "./wordMatch";
import { HoverWord, useHovercardDemo } from "./WordHovercard";
import styles from "./TempHovercard.module.css";

// Prototype: a lesson's text with its new words marked, each opening its hovercard. A slimmed copy of the lesson renderer
// (LessonDocument): practices show as a placeholder, New words blocks are left out, and words a block introduces but does not show
// are listed under it.
const join = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(" ") || undefined;

// Plain text with its spans marked.
export function MarkedText({ text, spans, offset = 0 }: { text: string; spans: readonly WordSpan[]; offset?: number }) {
  const { words } = useHovercardDemo();
  const nodes: ReactNode[] = [];
  let at = 0;
  for (const span of spans) {
    const start = Math.max(span.start - offset, at); const end = Math.min(span.end - offset, text.length);
    const word = words.get(span.wordId);
    if (end <= start || !word) continue;
    if (start > at) nodes.push(text.slice(at, start));
    nodes.push(<HoverWord key={`${span.wordId}:${start}`} word={word}><span data-word={span.wordId}>{text.slice(start, end)}</span></HoverWord>);
    at = end;
  }
  if (at < text.length) nodes.push(text.slice(at));
  return <>{nodes}</>;
}

function MarkedStyled({ item, spans, offset }: { item: StyledText; spans: readonly WordSpan[]; offset: number }) {
  let node: ReactNode = <MarkedText text={item.text} spans={spans} offset={offset} />;
  if (item.styles.bold) node = <strong>{node}</strong>;
  if (item.styles.italic) node = <em>{node}</em>;
  const color = item.styles.textColor && item.styles.textColor !== "default" ? docStyles[`text-${item.styles.textColor}`] : undefined;
  return color ? <span className={color}>{node}</span> : <>{node}</>;
}

// Inline content with the spans of its plain text (`inlineText`) marked, piece by piece.
function MarkedInline({ content, spans }: { content: InlineContent; spans: readonly WordSpan[] }) {
  let offset = 0;
  return <>{content.map((item, index) => {
    const pieces = item.type === "text" ? [item] : item.content;
    const nodes = pieces.map((piece, part) => {
      const node = <MarkedStyled key={part} item={piece} spans={spans} offset={offset} />;
      offset += piece.text.length;
      return node;
    });
    return item.type === "link" && isSafeLessonHref(item.href)
      ? <a key={index} className={docStyles.link} href={item.href} target="_blank" rel="noopener noreferrer nofollow">{nodes}</a>
      : <Fragment key={index}>{nodes}</Fragment>;
  })}</>;
}

type Marked = { marks: LessonMarks };
const spansOf = (marks: LessonMarks, id: string, text = 0) => marks.spans.get(id)?.[text] ?? [];

// The words a block introduces but does not show, as marked chips under it.
function Unshown({ marks, id }: Marked & { id: string }) {
  const missing = marks.missing.get(id);
  if (!missing?.length) return null;
  return (
    <p className={styles.unshown}>
      <span>Also new here</span>
      {missing.map((word) => <HoverWord key={word.id} word={word}>{word.term}</HoverWord>)}
    </p>
  );
}

const headingTags = { 1: "h3", 2: "h4", 3: "h5" } as const;

function Items({ items, marks }: Marked & { items: ListItemBlock[] }) {
  const groups: ListItemBlock[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last[0]!.type === item.type) last.push(item); else groups.push([item]);
  }
  return <>{groups.map((group) => {
    const children = group.map((item) => (
      <li key={item.id}>
        <MarkedInline content={item.content} spans={spansOf(marks, item.id)} />
        {item.children.length > 0 && <Items items={item.children} marks={marks} />}
        <Unshown marks={marks} id={item.id} />
      </li>
    ));
    return group[0]!.type === "numberedListItem"
      ? <ol key={group[0]!.id} className={docStyles.list}>{children}</ol>
      : <ul key={group[0]!.id} className={docStyles.list}>{children}</ul>;
  })}</>;
}

function Example({ block, marks }: Marked & { block: LessonBlockOf<"example"> }) {
  const { t } = useTranslation();
  const speech = useSpeechUrl(`example:${block.id}`);
  return (
    <figure className={docStyles.example}>
      <div className={docStyles.spoken}>
        <blockquote className={docStyles.sentence}><MarkedInline content={block.content} spans={spansOf(marks, block.id)} /></blockquote>
        <SpeechButton url={speech} label={t("courses.speech.example")} />
      </div>
      {block.props.translation && <figcaption className={docStyles.translation}>{block.props.translation}</figcaption>}
    </figure>
  );
}

function Dialogue({ block, marks, onWalkThrough }: Marked & { block: LessonBlockOf<"dialogue">; onWalkThrough?: (id: string) => void }) {
  const { t } = useTranslation();
  const resolve = useSpeechResolver();
  return (
    <div className={docStyles.dialogue}>
      {onWalkThrough && <button type="button" className={styles.walkLink} onClick={() => onWalkThrough(block.id)}>Walk through this dialogue →</button>}
      <ol className={docStyles.turns}>
        {readDialogueTurns(block).map((turn, index) => (
          <li key={index}>
            <span className={docStyles.speaker}>{turn.speaker}</span>
            <span className={docStyles.line}><MarkedText text={turn.text} spans={spansOf(marks, block.id, index)} /></span>
            <SpeechButton url={resolve(`turn:${block.id}:${index}`)} label={t("courses.speech.turn", { number: index + 1, speaker: turn.speaker })} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Block({ block, marks, onWalkThrough }: Marked & { block: Exclude<LessonBlock, ListItemBlock>; onWalkThrough?: (id: string) => void }) {
  const spans = spansOf(marks, block.id);
  switch (block.type) {
    case "paragraph":
      return <p className={docStyles.paragraph}><MarkedInline content={block.content} spans={spans} /></p>;
    case "heading": {
      const Tag = headingTags[block.props.level];
      return <Tag className={join(docStyles.heading, docStyles[`level${block.props.level}`])}><MarkedInline content={block.content} spans={spans} /></Tag>;
    }
    case "divider":
      return <hr className={docStyles.divider} />;
    case "image":
      return block.props.url ? <figure className={docStyles.image}><img src={block.props.url} alt={block.props.name} loading="lazy" /></figure> : null;
    case "callout":
      return <Callout variant={block.props.variant} icon={block.props.icon}><MarkedInline content={block.content} spans={spans} /></Callout>;
    case "example":
      return <Example block={block} marks={marks} />;
    case "dialogue":
      return <Dialogue block={block} marks={marks} onWalkThrough={onWalkThrough} />;
    case "practice":
      return <p className={styles.placeholder}>Practice (not shown in this demo)</p>;
    case "vocabulary":
      return null;
    case "column":
      return <div className={docStyles.column}><Blocks blocks={block.children} marks={marks} onWalkThrough={onWalkThrough} /></div>;
    case "columnList": {
      const total = block.children.reduce((sum, column) => sum + column.props.width, 0);
      const template = block.children.map((column) => `minmax(0, ${column.props.width / total}fr)`).join(" ");
      return <div className={docStyles.columns} style={{ "--lesson-columns": template } as CSSProperties}>
        {block.children.map((column) => <Block key={column.id} block={column} marks={marks} onWalkThrough={onWalkThrough} />)}
      </div>;
    }
  }
}

const isListItem = (block: LessonBlock): block is ListItemBlock => block.type === "bulletListItem" || block.type === "numberedListItem";

function Blocks({ blocks, marks, onWalkThrough }: Marked & { blocks: readonly LessonBlock[]; onWalkThrough?: (id: string) => void }) {
  const runs: Array<LessonBlock | ListItemBlock[]> = [];
  for (const block of blocks) {
    const last = runs.at(-1);
    if (isListItem(block) && Array.isArray(last)) last.push(block);
    else runs.push(isListItem(block) ? [block] : block);
  }
  return <>{runs.map((run) => Array.isArray(run)
    ? <Items key={run[0]!.id} items={run} marks={marks} />
    : <Fragment key={run.id}><Block block={run as Exclude<LessonBlock, ListItemBlock>} marks={marks} onWalkThrough={onWalkThrough} /><Unshown marks={marks} id={run.id} /></Fragment>)}</>;
}

export function LessonText({ document, marks, onWalkThrough }: Marked & { document: LessonDocument; onWalkThrough?: (id: string) => void }) {
  return <div className={join(docStyles.document, styles.text)}><Blocks blocks={document.blocks} marks={marks} onWalkThrough={onWalkThrough} /></div>;
}
