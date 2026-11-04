import { Popover } from "@mantine/core";
import {
  isSafeLessonHref, readVocabularyBlock, walkLessonBlocks, type InlineContent, type LessonDocument, type StyledText, type VocabularyWord,
} from "@wordinator/contracts/lesson-document";
import { currentWordMarks, wordMarkKey, type LessonWordMarks, type WordMark } from "@wordinator/contracts/word-marks";
import { createContext, Fragment, useContext, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton, useSpeechUrl } from "../../molecules/Speech";
import docStyles from "../LessonDocument/LessonDocument.module.css";
import { WordBookmarkToggle } from "../WordBookmark/WordBookmark";
import styles from "./WordMarks.module.css";

// Word marks (docs/courses.md#word-marks): a lesson's new words, tinted wherever the lesson's text uses them. A click, tap, or Enter
// opens the word's card. The provider holds the lesson's words and the marks that still fit its document; outside a provider, or
// for a field without marks, text renders exactly as it would without this organism.
type WordMarksValue = {
  words: ReadonlyMap<string, VocabularyWord>;
  // The vocabulary block each word belongs to, to reach the marks of its example and note.
  blocks: ReadonlyMap<string, string>;
  marks: ReadonlyMap<string, WordMark[]>;
};
const WordMarksContext = createContext<WordMarksValue | null>(null);

export function WordMarksProvider({ document, marks: stored, children }: { document: LessonDocument | null; marks: LessonWordMarks | null | undefined; children: ReactNode }) {
  const value = useMemo<WordMarksValue | null>(() => {
    if (!document) return null;
    const words = new Map<string, VocabularyWord>(); const blocks = new Map<string, string>();
    for (const { block } of walkLessonBlocks(document.blocks)) {
      if (block.type !== "vocabulary") continue;
      for (const word of readVocabularyBlock(block).words) { words.set(word.id, word); blocks.set(word.id, block.id); }
    }
    const marks = currentWordMarks(document, stored);
    return marks.size ? { words, blocks, marks } : null;
  }, [document, stored]);
  return <WordMarksContext.Provider value={value}>{children}</WordMarksContext.Provider>;
}

// One piece of a mark: the part's range in its field's text and the mark it belongs to.
type Range = { start: number; end: number; mark: WordMark };

// The ranges of one field in text order, or null when it has none (or none for a known word).
function useRanges(blockId: string | undefined, field: string): { ranges: Range[]; words: ReadonlyMap<string, VocabularyWord> } | null {
  const value = useContext(WordMarksContext);
  return useMemo(() => {
    const marks = value && blockId ? value.marks.get(wordMarkKey(blockId, field)) : undefined;
    if (!value || !marks) return null;
    const ranges = marks.filter((mark) => value.words.has(mark.wordId))
      .flatMap((mark) => mark.parts.map(([start, end]) => ({ start, end, mark })))
      .sort((a, b) => a.start - b.start);
    return ranges.length ? { ranges, words: value.words } : null;
  }, [value, blockId, field]);
}

const ARTICLE = /^(de|het|der|die|das)\s+(.+)$/i;

// The card: the article as a pill, the term with its speaker and bookmark, IPA and forms, the meaning, the example, and the note.
export function WordCard({ word }: { word: VocabularyWord }) {
  const { t } = useTranslation();
  const termSpeech = useSpeechUrl(`word:${word.id}`);
  const exampleSpeech = useSpeechUrl(`wordExample:${word.id}`);
  const [, article, rest] = ARTICLE.exec(word.term.trim()) ?? [null, null, word.term];
  const example = word.example?.trim(); const note = word.note?.trim(); const forms = word.forms?.trim();
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <p className={styles.cardTerm}>
          {article && <span className={styles.article}>{article.toLowerCase()}</span>}
          <span>{rest}</span>
        </p>
        <SpeechButton url={termSpeech} label={t("courses.speech.term", { term: word.term })} />
        <WordBookmarkToggle wordId={word.id} term={word.term} />
      </div>
      {(word.ipa || forms) && (
        <p className={styles.cardForms}>
          {word.ipa && <span>/{word.ipa}/</span>}
          {forms && <span>{forms}</span>}
        </p>
      )}
      <p className={styles.cardMeaning}><PlainText>{word.meaning}</PlainText></p>
      {example && (
        <p className={styles.cardExample}>
          <span><PlainText>{example}</PlainText></span>
          <SpeechButton url={exampleSpeech} label={t("courses.speech.wordExample", { term: word.term })} />
        </p>
      )}
      {note && <p className={styles.cardNote}><PlainText>{note}</PlainText></p>}
    </div>
  );
}

// A marked stretch of text. Only a click, tap, or Enter (or Space) opens the card; Escape or a click elsewhere closes it.
function MarkedWord({ word, color, children }: { word: VocabularyWord; color: WordMark["color"]; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setOpened((value) => !value);
  };
  return (
    <Popover opened={opened} onChange={setOpened} position="top" offset={8} withArrow arrowSize={12} arrowOffset={16}
      middlewares={{ flip: true, shift: { padding: 12 } }} returnFocus={false} classNames={{ dropdown: styles.dropdown, arrow: styles.arrow }}>
      <Popover.Target>
        <span role="button" tabIndex={0} className={styles.mark} data-word-mark={word.id} data-tone={color ?? undefined} data-open={opened || undefined}
          aria-haspopup="dialog" aria-expanded={opened} onClick={() => setOpened((value) => !value)} onKeyDown={onKeyDown}>
          {children}
        </span>
      </Popover.Target>
      <Popover.Dropdown><WordCard word={word} /></Popover.Dropdown>
    </Popover>
  );
}

// The text of [offset, offset + text.length) of a field, with the ranges that fall in it wrapped. A range crossing the piece's edge
// is wrapped for the part inside it; the next piece wraps the rest, and both open the same card.
function wrapRanges(text: string, offset: number, found: { ranges: Range[]; words: ReadonlyMap<string, VocabularyWord> }, linkify: boolean): ReactNode {
  const plain = (value: string) => linkify ? <PlainText>{value}</PlainText> : value;
  const nodes: ReactNode[] = [];
  let at = 0;
  for (const { start: from, end: to, mark } of found.ranges) {
    const start = Math.max(from - offset, at); const end = Math.min(to - offset, text.length);
    const word = found.words.get(mark.wordId);
    if (end <= start || !word) continue;
    if (start > at) nodes.push(<Fragment key={`t${at}`}>{plain(text.slice(at, start))}</Fragment>);
    nodes.push(<MarkedWord key={`${mark.wordId}:${start}`} word={word} color={mark.color}>{text.slice(start, end)}</MarkedWord>);
    at = end;
  }
  if (!nodes.length) return plain(text);
  if (at < text.length) nodes.push(<Fragment key={`t${at}`}>{plain(text.slice(at))}</Fragment>);
  return <>{nodes}</>;
}

// Plain text of one field (`turn:0`, `translation`, `note`, `passage`) with its marks. Pass `linkify` for text that is otherwise
// shown through PlainText.
export function MarkedText({ blockId, field, text, linkify = false }: { blockId: string; field: string; text: string; linkify?: boolean }) {
  const found = useRanges(blockId, field);
  return <>{found ? wrapRanges(text, 0, found, linkify) : linkify ? <PlainText>{text}</PlainText> : text}</>;
}

// A vocabulary word's own example or note, by word ID, with its marks.
export function MarkedWordField({ wordId, field, text }: { wordId: string; field: "example" | "note"; text: string }) {
  const blockId = useContext(WordMarksContext)?.blocks.get(wordId);
  return <MarkedText blockId={blockId ?? ""} field={`word:${wordId}:${field}`} text={text} linkify />;
}

function MarkedStyled({ item, found, offset }: { item: StyledText; found: NonNullable<ReturnType<typeof useRanges>>; offset: number }) {
  let node: ReactNode = wrapRanges(item.text, offset, found, false);
  if (item.styles.bold) node = <strong>{node}</strong>;
  if (item.styles.italic) node = <em>{node}</em>;
  const color = item.styles.textColor && item.styles.textColor !== "default" ? docStyles[`text-${item.styles.textColor}`] : undefined;
  const surface = item.styles.backgroundColor && item.styles.backgroundColor !== "default" ? docStyles[`surface-${item.styles.backgroundColor}`] : undefined;
  const className = [color, surface].filter(Boolean).join(" ");
  return className ? <span className={className}>{node}</span> : <>{node}</>;
}

// Inline content with the marks of its plain text (`inlineText`) wrapped piece by piece, keeping bold, italic, colour, and links.
// A field without marks renders `children`, the caller's usual rendering.
export function MarkedInline({ blockId, field = "content", content, children }: { blockId: string; field?: string; content: InlineContent; children?: ReactNode }) {
  const found = useRanges(blockId, field);
  if (!found) return <>{children}</>;
  let offset = 0;
  return <>{content.map((item, index) => {
    const pieces = item.type === "text" ? [item] : item.content;
    const nodes = pieces.map((piece, part) => {
      const node = <MarkedStyled key={part} item={piece} found={found} offset={offset} />;
      offset += piece.text.length;
      return node;
    });
    return item.type === "link" && isSafeLessonHref(item.href)
      ? <a key={index} className={docStyles.link} href={item.href} target="_blank" rel="noopener noreferrer nofollow">{nodes}</a>
      : <Fragment key={index}>{nodes}</Fragment>;
  })}</>;
}
