import {
  inlineText, isSafeLessonHref, readDialogueTurns, readVocabularyBlock, type InlineContent, type LessonBlock, type LessonBlockOf, type LessonColor,
  type LessonDocument as LessonDocumentData, type ListItemBlock, type StyledText, type VocabularyWord,
} from "@wordinator/contracts/lesson-document";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Callout } from "../../molecules/Callout";
import { PlainText } from "../../molecules/PlainText";
import styles from "./LessonDocument.module.css";

// Wordinator's own lesson renderer. Every piece of authored text becomes a React text node, so nothing is parsed as HTML;
// links render only for http and https, and colours map to design tokens through fixed class names.
export type PracticeRenderer = (block: LessonBlockOf<"practice">) => ReactNode;

const join = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(" ") || undefined;
const textColor = (color: LessonColor | undefined) => color && color !== "default" ? styles[`text-${color}`] : undefined;
const surfaceColor = (color: LessonColor | undefined) => color && color !== "default" ? styles[`surface-${color}`] : undefined;

function Styled({ item }: { item: StyledText }) {
  let node: ReactNode = item.text;
  if (item.styles.bold) node = <strong>{node}</strong>;
  if (item.styles.italic) node = <em>{node}</em>;
  const className = join(textColor(item.styles.textColor), surfaceColor(item.styles.backgroundColor));
  return className ? <span className={className}>{node}</span> : <>{node}</>;
}

export function InlineText({ content }: { content: InlineContent }) {
  return <>{content.map((item, index) => {
    if (item.type === "text") return <Styled key={index} item={item} />;
    const parts = item.content.map((part, partIndex) => <Styled key={partIndex} item={part} />);
    // The contracts already reject other schemes; the renderer checks again so a stored document can never produce one.
    return isSafeLessonHref(item.href)
      ? <a key={index} className={styles.link} href={item.href} target="_blank" rel="noopener noreferrer nofollow">{parts}</a>
      : <Fragment key={index}>{parts}</Fragment>;
  })}</>;
}

const blockColors = (props: { textColor: LessonColor; backgroundColor: LessonColor }) =>
  join(textColor(props.textColor), surfaceColor(props.backgroundColor), props.backgroundColor !== "default" && styles.tinted);

// The player passes `details` to reveal the translation and note step by step; the reader shows them directly.
export function ExampleBlock({ block, details }: { block: LessonBlockOf<"example">; details?: ReactNode }) {
  const { translation, note } = block.props;
  return <figure className={styles.example}>
    <blockquote className={styles.sentence}><InlineText content={block.content} /></blockquote>
    {details ?? <>
      {translation && <figcaption className={styles.translation}>{translation}</figcaption>}
      {note && <p className={styles.note}>{note}</p>}
    </>}
  </figure>;
}

export function DialogueBlock({ block, upTo }: { block: LessonBlockOf<"dialogue">; upTo?: number }) {
  const turns = readDialogueTurns(block);
  return <ol className={styles.dialogue}>
    {turns.slice(0, upTo === undefined ? turns.length : upTo + 1).map((turn, index) => <li key={index} className={index === upTo ? styles.newest : undefined}>
      <span className={styles.speaker}>{turn.speaker}</span><span className={styles.line}>{turn.text}</span>
    </li>)}
  </ol>;
}

// New words as a compact list: the term with its forms, the meaning, then the example and note. Every field is plain text,
// and nothing is concealed. The reader shows a vocabulary block this way in place; the player shows a step's words as a panel.
export function NewWords({ words }: { words: readonly VocabularyWord[] }) {
  const { t } = useTranslation();
  return <section className={styles.words} aria-label={t("courses.words.title")}>
    <p className={styles.wordsTitle} aria-hidden="true">{t("courses.words.title")}</p>
    <ul className={styles.wordList}>{words.map((word) => <li key={word.id} className={styles.word}>
      <p className={styles.wordHead}><span className={styles.term}>{word.term}</span>{word.forms?.trim() && <span className={styles.forms}>{word.forms}</span>}</p>
      <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
      {word.example?.trim() && <p className={styles.wordExample}><PlainText>{word.example}</PlainText></p>}
      {word.note?.trim() && <p className={styles.note}><PlainText>{word.note}</PlainText></p>}
    </li>)}</ul>
  </section>;
}

// Document headings sit below the lesson title (an h2), so levels 1–3 render as h3–h5.
const headingTags = { 1: "h3", 2: "h4", 3: "h5" } as const;

function ListItems({ items, renderPractice }: { items: ListItemBlock[]; renderPractice?: PracticeRenderer }) {
  const groups: ListItemBlock[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last[0]!.type === item.type) last.push(item); else groups.push([item]);
  }
  return <>{groups.map((group) => {
    const first = group[0]!;
    const children = group.map((item) => <li key={item.id} className={blockColors(item.props)}>
      <InlineText content={item.content} />
      {item.children.length > 0 && <ListItems items={item.children} renderPractice={renderPractice} />}
    </li>);
    return first.type === "numberedListItem"
      ? <ol key={first.id} className={styles.list} start={first.props.start}>{children}</ol>
      : <ul key={first.id} className={styles.list}>{children}</ul>;
  })}</>;
}

function Block({ block, renderPractice }: { block: Exclude<LessonBlock, ListItemBlock>; renderPractice?: PracticeRenderer }) {
  switch (block.type) {
    case "paragraph": return <p className={join(styles.paragraph, blockColors(block.props))}><InlineText content={block.content} /></p>;
    case "heading": {
      const Tag = headingTags[block.props.level];
      return <Tag className={join(styles.heading, styles[`level${block.props.level}`], blockColors(block.props))}><InlineText content={block.content} /></Tag>;
    }
    case "divider": return <hr className={styles.divider} />;
    case "image": return block.props.url ? <figure className={styles.image}>
      <img src={block.props.url} alt={block.props.name} loading="lazy" style={block.props.previewWidth ? { width: `min(100%, ${block.props.previewWidth}px)` } : undefined} />
      {block.props.caption && <figcaption>{block.props.caption}</figcaption>}
    </figure> : null;
    case "callout": return <Callout variant={block.props.variant} icon={block.props.icon}><InlineText content={block.content} /></Callout>;
    case "example": return <ExampleBlock block={block} />;
    case "dialogue": return <DialogueBlock block={block} />;
    case "practice": return <>{renderPractice?.(block)}</>;
    case "vocabulary": return <NewWords words={readVocabularyBlock(block).words} />;
    case "column": return <div className={styles.column}><LessonBlocks blocks={block.children} renderPractice={renderPractice} /></div>;
    case "columnList": {
      const total = block.children.reduce((sum, column) => sum + column.props.width, 0);
      const template = block.children.map((column) => `minmax(0, ${column.props.width / total}fr)`).join(" ");
      return <div className={styles.columns} style={{ "--lesson-columns": template } as CSSProperties}>
        {block.children.map((column) => <Block key={column.id} block={column} renderPractice={renderPractice} />)}
      </div>;
    }
  }
}

const isListItem = (block: LessonBlock): block is ListItemBlock => block.type === "bulletListItem" || block.type === "numberedListItem";

// Renders a run of sibling blocks, grouping consecutive list items into one list. Trailing blank paragraphs, which the
// editor always keeps, are dropped.
export function LessonBlocks({ blocks, renderPractice }: { blocks: readonly LessonBlock[]; renderPractice?: PracticeRenderer }) {
  let end = blocks.length;
  while (end > 0 && blocks[end - 1]!.type === "paragraph" && !inlineText((blocks[end - 1] as LessonBlockOf<"paragraph">).content).trim()) end -= 1;
  const runs: Array<LessonBlock | ListItemBlock[]> = [];
  for (const block of blocks.slice(0, end)) {
    const last = runs.at(-1);
    if (isListItem(block) && Array.isArray(last)) last.push(block);
    else runs.push(isListItem(block) ? [block] : block);
  }
  return <>{runs.map((run) => Array.isArray(run)
    ? <ListItems key={run[0]!.id} items={run} renderPractice={renderPractice} />
    : <Block key={run.id} block={run as Exclude<LessonBlock, ListItemBlock>} renderPractice={renderPractice} />)}</>;
}

export function LessonDocument({ document, renderPractice }: { document: LessonDocumentData; renderPractice?: PracticeRenderer }) {
  return <div className={styles.document}><LessonBlocks blocks={document.blocks} renderPractice={renderPractice} /></div>;
}
