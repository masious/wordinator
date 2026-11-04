import { z } from "zod";
import { inlineText, opaqueIdSchema, practicePayloadSchema, type InlineContent } from "./index";
import {
  lessonWordMarksSchema, readDialogueTurns, readVocabularyBlock, walkLessonBlocks, wordMarkColorSchema, type DialogueWordMarks, wordMarkFieldSchema, type LessonDocument, type LessonWordMarks, type WordMark,
} from "./lessonDocument";

export { lessonWordMarksSchema, wordMarkFieldMarksSchema, wordMarkSchema, type LessonWordMarks, type WordMark } from "./lessonDocument";

// Word marks (docs/courses.md#word-marks): where a lesson's new words are used in its own text, found offline by the content
// pipeline and stored beside the lesson. Each mark points into one text field of one block by character offsets; the field's
// fingerprint ties the marks to the text they were made for, so a field whose text changed shows no marks rather than wrong ones.

// The text fields of a lesson that can carry marks. Inline content (paragraphs, headings, list items, callouts, example sentences) is
// `content`, read as its plain text (`inlineText`). Practices carry marks only in a reading passage.
export type WordMarkField =
  | "content" | "translation" | "note" | "passage"
  | `turn:${number}` | `turnTranslation:${number}`
  | `word:${string}:example` | `word:${string}:note`;

export type WordMarkText = { blockId: string; field: WordMarkField; text: string; content?: InlineContent };

// Every markable text of the document, in reading order.
export function wordMarkTexts(document: LessonDocument): WordMarkText[] {
  const texts: WordMarkText[] = [];
  const add = (blockId: string, field: WordMarkField, text: string | null | undefined, content?: InlineContent) => {
    if (text?.trim()) texts.push({ blockId, field, text, ...(content ? { content } : {}) });
  };
  for (const { block } of walkLessonBlocks(document.blocks)) {
    if ("content" in block && Array.isArray(block.content)) add(block.id, "content", inlineText(block.content), block.content);
    if (block.type === "example") { add(block.id, "translation", block.props.translation); add(block.id, "note", block.props.note); }
    if (block.type === "dialogue") readDialogueTurns(block).forEach((turn, index) => {
      add(block.id, `turn:${index}`, turn.text);
      add(block.id, `turnTranslation:${index}`, turn.translation);
    });
    if (block.type === "practice") add(block.id, "passage", practicePayloadSchema.parse(JSON.parse(block.props.data)).passage?.content);
    if (block.type === "vocabulary") for (const word of readVocabularyBlock(block).words) {
      add(block.id, `word:${word.id}:example`, word.example);
      add(block.id, `word:${word.id}:note`, word.note);
    }
  }
  return texts;
}

// The words a lesson introduces, by ID.
export const lessonWordIds = (document: LessonDocument) => new Set([...walkLessonBlocks(document.blocks)]
  .flatMap(({ block }) => block.type === "vocabulary" ? readVocabularyBlock(block).words.map((word) => word.id) : []));

// FNV-1a over UTF-16 code units, as 8 hex digits: cheap, synchronous, and the same in the browser, the Worker, and the tools.
// It detects changed text; it is not a security boundary.
export function wordMarkFingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Words as the pipeline numbers them: runs of letters and digits, joined by inner apostrophes (z'n, foto's).
export type WordMarkToken = { index: number; text: string; start: number; end: number };
const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
export const wordMarkTokens = (text: string): WordMarkToken[] =>
  [...text.matchAll(TOKEN)].map((match, index) => ({ index, text: match[0], start: match.index, end: match.index + match[0].length }));

export const wordMarkKey = (blockId: string, field: string) => `${blockId}|${field}`;

// The marks that still fit the document: fields whose text is unchanged, parts inside the text and in order, and words the lesson
// introduces. Marks in a field are returned in text order; overlapping marks keep the earlier one.
export function currentWordMarks(document: LessonDocument, stored: LessonWordMarks | null | undefined): Map<string, WordMark[]> {
  const result = new Map<string, WordMark[]>();
  if (!stored) return result;
  const texts = new Map(wordMarkTexts(document).map((entry) => [wordMarkKey(entry.blockId, entry.field), entry.text]));
  const words = lessonWordIds(document);
  for (const field of stored.fields) {
    const key = wordMarkKey(field.blockId, field.field);
    const text = texts.get(key);
    if (text === undefined || wordMarkFingerprint(text) !== field.fingerprint) continue;
    const valid = field.marks.filter((mark) => words.has(mark.wordId)
      && mark.parts.every(([start, end], index) => start < end && end <= text.length && (index === 0 || start >= mark.parts[index - 1]![1])));
    valid.sort((a, b) => a.parts[0]![0] - b.parts[0]![0]);
    const kept: WordMark[] = [];
    const taken: Array<[number, number]> = [];
    for (const mark of valid) {
      if (mark.parts.some(([start, end]) => taken.some(([from, to]) => start < to && from < end))) continue;
      kept.push(mark);
      taken.push(...mark.parts);
    }
    if (kept.length) result.set(key, kept);
  }
  return result;
}

// The lookup `flattenToSteps` uses to place a dialogue's words: the word IDs currently marked in turn `turnIndex` of a dialogue block.
export function dialogueWordMarks(document: LessonDocument, stored: LessonWordMarks | null | undefined): DialogueWordMarks | undefined {
  if (!stored) return undefined;
  const marks = currentWordMarks(document, stored);
  return (blockId, turnIndex) => {
    const found = marks.get(wordMarkKey(blockId, `turn:${turnIndex}`));
    return found ? new Set(found.map((mark) => mark.wordId)) : undefined;
  };
}

// The pipeline's authored form: token indices instead of offsets. Adjacent tokens join into one part (Waar kom je vandaan,
// ov-chipkaart); a gap starts a new part (sta … op).
export const authoredWordMarkSchema = z.strictObject({
  blockId: opaqueIdSchema, field: wordMarkFieldSchema, word: opaqueIdSchema,
  tokens: z.array(z.number().int().nonnegative()).min(1).max(12),
  color: wordMarkColorSchema.nullable().optional(),
});
export type AuthoredWordMark = z.infer<typeof authoredWordMarkSchema>;
export const authoredWordMarksSchema = z.strictObject({ marks: z.array(authoredWordMarkSchema) });

// Turns authored marks into stored ones against the document, collecting every problem instead of stopping at the first.
export function resolveWordMarks(document: LessonDocument, authored: readonly AuthoredWordMark[]): { marks: LessonWordMarks; problems: string[] } {
  const problems: string[] = [];
  const texts = new Map(wordMarkTexts(document).map((entry) => [wordMarkKey(entry.blockId, entry.field), entry.text]));
  const words = lessonWordIds(document);
  const fields = new Map<string, { blockId: string; field: string; marks: WordMark[] }>();
  authored.forEach((mark, at) => {
    const key = wordMarkKey(mark.blockId, mark.field);
    const text = texts.get(key);
    if (text === undefined) { problems.push(`mark ${at}: no text at ${key}`); return; }
    if (!words.has(mark.word)) { problems.push(`mark ${at}: ${mark.word} is not a new word of this lesson`); return; }
    const tokens = wordMarkTokens(text);
    const indices = [...new Set(mark.tokens)].sort((a, b) => a - b);
    if (indices.some((index) => index >= tokens.length)) { problems.push(`mark ${at}: token out of range at ${key}`); return; }
    const parts: Array<[number, number]> = [];
    let previous = -2;
    for (const index of indices) {
      const token = tokens[index]!;
      if (index === previous + 1 && parts.length) parts[parts.length - 1]![1] = token.end; else parts.push([token.start, token.end]);
      previous = index;
    }
    const entry = fields.get(key) ?? { blockId: mark.blockId, field: mark.field, marks: [] };
    entry.marks.push({ wordId: mark.word, parts, color: mark.color ?? null });
    fields.set(key, entry);
  });
  const stored: LessonWordMarks = { version: 1, fields: [...fields.entries()].map(([key, entry]) => ({
    blockId: entry.blockId, field: entry.field, fingerprint: wordMarkFingerprint(texts.get(key)!),
    marks: entry.marks.sort((a, b) => a.parts[0]![0] - b.parts[0]![0]),
  })) };
  for (const field of stored.fields) {
    const marks = field.marks;
    for (let index = 1; index < marks.length; index += 1) {
      const earlier = marks.slice(0, index).flatMap((mark) => mark.parts);
      if (marks[index]!.parts.some(([start, end]) => earlier.some(([from, to]) => start < to && from < end))) problems.push(`overlapping marks at ${wordMarkKey(field.blockId, field.field)}`);
    }
  }
  return { marks: lessonWordMarksSchema.parse(stored), problems };
}
