import { z } from "zod";
import {
  COURSE_BLOCK_TEXT_MAX, COURSE_BLOCKS_MAX, COURSE_HEADING_MAX, COURSE_NOTE_MAX, COURSE_PRELOADED_LESSONS, COURSE_RECAP_WORDS_MAX, COURSE_SENTENCE_MAX,
  COURSE_WORD_FORMS_MAX, COURSE_WORD_MEANING_MAX, COURSE_WORD_TERM_MAX, COURSE_WORDS_PER_BLOCK_MAX, courseLessonSummarySchema, courseSchema, dialoguePayloadSchema, editorRefSchema, opaqueIdSchema, paginationQuerySchema, practicePayloadSchema, splitPracticePayload, type PracticePayload,
  WORD_BOOKMARKS_MAX,
  type PracticeReference,
} from "./index";

// A lesson document is the subset of BlockNote's JSON (`{ id, type, props, content, children }`) that Wordinator accepts.
// The contracts never import BlockNote; the editor's output is validated here like any other client input.
export const LESSON_DOCUMENT_SCHEMA_VERSION = 2;
export const LESSON_DOCUMENT_BYTES_MAX = 256 * 1024;
export const LESSON_LIST_DEPTH_MAX = 3;
export const LESSON_COLUMNS_MIN = 2;
export const LESSON_COLUMNS_MAX = 3;
export const LESSON_LINK_MAX = 2_048;
export const LESSON_IMAGE_URL_MAX = 2_048;
export const LESSON_IMAGE_ALT_MAX = 200;
export const LESSON_IMAGE_CAPTION_MAX = 1_000;
const PRACTICE_DATA_MAX = 200_000;
const DIALOGUE_DATA_MAX = 100_000;
const VOCABULARY_DATA_MAX = LESSON_DOCUMENT_BYTES_MAX;

export const lessonColorSchema = z.enum(["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"]);
export type LessonColor = z.infer<typeof lessonColorSchema>;
export const calloutVariantSchema = z.enum(["hint", "important", "warning", "grammar", "culture", "false-friend", "pronunciation"]);
export type CalloutVariant = z.infer<typeof calloutVariantSchema>;
// `auto` uses the variant's default icon. The names are lucide icons the web maps explicitly; nothing else is rendered.
export const calloutIconSchema = z.enum([
  "auto", "lightbulb", "megaphone", "triangle-alert", "book-open", "globe", "message-circle-warning", "volume-2", "info",
  "star", "heart", "circle-check", "circle-x", "circle-help", "sparkles", "pencil", "clock", "map-pin",
]);
export type CalloutIcon = z.infer<typeof calloutIconSchema>;

export const isSafeLessonHref = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// Styles are limited to bold, italic, and palette colours; underline, strike, and code are rejected.
const textStylesSchema = z.strictObject({
  bold: z.boolean().optional(), italic: z.boolean().optional(), textColor: lessonColorSchema.optional(), backgroundColor: lessonColorSchema.optional(),
});
const styledTextSchema = z.strictObject({ type: z.literal("text"), text: z.string().max(COURSE_BLOCK_TEXT_MAX), styles: textStylesSchema });
const linkSchema = z.strictObject({
  type: z.literal("link"),
  href: z.string().max(LESSON_LINK_MAX).refine(isSafeLessonHref, "Links must use http or https."),
  content: z.array(styledTextSchema).max(COURSE_BLOCK_TEXT_MAX),
});
export const inlineContentSchema = z.array(z.discriminatedUnion("type", [styledTextSchema, linkSchema])).max(COURSE_BLOCK_TEXT_MAX);
export type InlineContent = z.infer<typeof inlineContentSchema>;
export type StyledText = z.infer<typeof styledTextSchema>;

export const inlineText = (content: InlineContent) =>
  content.map((item) => item.type === "text" ? item.text : item.content.map((part) => part.text).join("")).join("");
const limitText = (max: number) => (content: InlineContent) => inlineText(content).length <= max;
const textContent = (max: number) => inlineContentSchema.refine(limitText(max), `Text is limited to ${max} characters.`);

// Alignment is never offered; BlockNote still emits its default, so only "left" is accepted.
const alignmentSchema = z.literal("left").optional();
const textBlockPropsSchema = z.strictObject({ textColor: lessonColorSchema, backgroundColor: lessonColorSchema, textAlignment: alignmentSchema });
const blockId = opaqueIdSchema;
const noContent = z.undefined().optional();
const noChildren = z.array(z.never()).max(0);
const parsesAs = (schema: z.ZodType) => (value: string) => {
  try {
    return schema.safeParse(JSON.parse(value)).success;
  } catch {
    return false;
  }
};

const paragraphSchema = z.strictObject({
  id: blockId, type: z.literal("paragraph"), props: textBlockPropsSchema, content: textContent(COURSE_BLOCK_TEXT_MAX), children: noChildren,
});
const headingSchema = z.strictObject({
  id: blockId, type: z.literal("heading"),
  props: textBlockPropsSchema.extend({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]), isToggleable: z.literal(false).optional() }),
  content: textContent(COURSE_HEADING_MAX), children: noChildren,
});
// List items are the only blocks that nest; depth is checked across the whole document.
type TextBlockProps = z.infer<typeof textBlockPropsSchema>;
export type BulletListItemBlock = { id: string; type: "bulletListItem"; props: TextBlockProps; content: InlineContent; children: ListItemBlock[] };
export type NumberedListItemBlock = {
  id: string; type: "numberedListItem"; props: TextBlockProps & { start?: number | undefined }; content: InlineContent; children: ListItemBlock[];
};
export type ListItemBlock = BulletListItemBlock | NumberedListItemBlock;
const bulletListItemSchema = z.strictObject({
  id: blockId, type: z.literal("bulletListItem"), props: textBlockPropsSchema, content: textContent(COURSE_BLOCK_TEXT_MAX),
  get children(): z.ZodArray<z.ZodType<ListItemBlock>> { return z.array(listItemSchema).max(COURSE_BLOCKS_MAX); },
});
const numberedListItemSchema = z.strictObject({
  id: blockId, type: z.literal("numberedListItem"),
  props: textBlockPropsSchema.extend({ start: z.number().int().min(0).max(10_000).optional() }), content: textContent(COURSE_BLOCK_TEXT_MAX),
  get children(): z.ZodArray<z.ZodType<ListItemBlock>> { return z.array(listItemSchema).max(COURSE_BLOCKS_MAX); },
});
const listItemSchema: z.ZodType<ListItemBlock> = z.discriminatedUnion("type", [bulletListItemSchema, numberedListItemSchema]);
const dividerSchema = z.strictObject({ id: blockId, type: z.literal("divider"), props: z.strictObject({}), content: noContent, children: noChildren });
// `name` is the image's alt text. Drafts may hold an image whose upload has not finished; publishing requires both.
const imageSchema = z.strictObject({
  id: blockId, type: z.literal("image"),
  props: z.strictObject({
    textAlignment: alignmentSchema, backgroundColor: lessonColorSchema, name: z.string().max(LESSON_IMAGE_ALT_MAX), url: z.string().max(LESSON_IMAGE_URL_MAX),
    caption: z.string().max(LESSON_IMAGE_CAPTION_MAX), showPreview: z.boolean(), previewWidth: z.number().int().positive().max(4_000).optional(),
  }),
  content: noContent, children: noChildren,
});
const calloutSchema = z.strictObject({
  id: blockId, type: z.literal("callout"), props: z.strictObject({ variant: calloutVariantSchema, icon: calloutIconSchema }),
  content: textContent(COURSE_BLOCK_TEXT_MAX), children: noChildren,
});
// The sentence is rich text; translation and note stay plain text and an empty string means none.
const exampleSchema = z.strictObject({
  id: blockId, type: z.literal("example"),
  props: z.strictObject({ translation: z.string().max(COURSE_SENTENCE_MAX), note: z.string().max(COURSE_NOTE_MAX) }),
  content: textContent(COURSE_SENTENCE_MAX), children: noChildren,
});
// BlockNote props are primitives, so structured dialogue and practice payloads travel as JSON strings checked by their schemas.
const dialogueSchema = z.strictObject({
  id: blockId, type: z.literal("dialogue"),
  props: z.strictObject({ turns: z.string().max(DIALOGUE_DATA_MAX).refine(parsesAs(dialoguePayloadSchema.shape.turns), "Invalid dialogue turns.") }),
  content: noContent, children: noChildren,
});
const practiceSchema = z.strictObject({
  id: blockId, type: z.literal("practice"),
  props: z.strictObject({ data: z.string().max(PRACTICE_DATA_MAX).refine(parsesAs(practicePayloadSchema), "Invalid practice.") }),
  content: noContent, children: noChildren,
});
// Words are plain text. Drafts may hold a word with an empty term or meaning; publishing requires both (`word-empty`).
// Optional fields are absent or empty when there is none. Word IDs are unique within the whole document.
export const vocabularyWordSchema = z.strictObject({
  id: opaqueIdSchema,
  term: z.string().max(COURSE_WORD_TERM_MAX),
  meaning: z.string().max(COURSE_WORD_MEANING_MAX),
  forms: z.string().max(COURSE_WORD_FORMS_MAX).optional(),
  example: z.string().max(COURSE_SENTENCE_MAX).optional(),
  note: z.string().max(COURSE_NOTE_MAX).optional(),
});
export type VocabularyWord = z.infer<typeof vocabularyWordSchema>;
export const vocabularyPayloadSchema = z.strictObject({
  words: z.array(vocabularyWordSchema).min(1).max(COURSE_WORDS_PER_BLOCK_MAX)
    .refine((words) => new Set(words.map((word) => word.id)).size === words.length, "Duplicate word ID."),
});
export type VocabularyPayload = z.infer<typeof vocabularyPayloadSchema>;
const vocabularySchema = z.strictObject({
  id: blockId, type: z.literal("vocabulary"),
  props: z.strictObject({ data: z.string().max(VOCABULARY_DATA_MAX).refine(parsesAs(vocabularyPayloadSchema), "Invalid vocabulary.") }),
  content: noContent, children: noChildren,
});

const leafBlockSchema = z.discriminatedUnion("type", [
  paragraphSchema, headingSchema, bulletListItemSchema, numberedListItemSchema, dividerSchema, imageSchema, calloutSchema, exampleSchema, dialogueSchema,
  practiceSchema, vocabularySchema,
]);
// Columns sit only at the top level and never contain other columns.
const columnSchema = z.strictObject({
  id: blockId, type: z.literal("column"), props: z.strictObject({ width: z.number().positive().max(100) }), content: noContent,
  children: z.array(leafBlockSchema).min(1).max(COURSE_BLOCKS_MAX),
});
const columnListSchema = z.strictObject({
  id: blockId, type: z.literal("columnList"), props: z.strictObject({}), content: noContent,
  children: z.array(columnSchema).min(LESSON_COLUMNS_MIN).max(LESSON_COLUMNS_MAX),
});
const topBlockSchema = z.discriminatedUnion("type", [...leafBlockSchema.options, columnListSchema]);

export type LessonLeafBlock = z.infer<typeof leafBlockSchema>;
export type LessonColumnBlock = z.infer<typeof columnSchema>;
export type LessonColumnListBlock = z.infer<typeof columnListSchema>;
export type LessonTopBlock = z.infer<typeof topBlockSchema>;
export type LessonBlock = LessonTopBlock | LessonColumnBlock;
export type LessonBlockOf<T extends LessonBlock["type"]> = Extract<LessonBlock, { type: T }>;

// Visits every block depth-first in reading order: columns left to right, list children after their parent.
export function* walkLessonBlocks(blocks: readonly LessonBlock[], depth = 0): Generator<{ block: LessonBlock; depth: number }> {
  for (const block of blocks) {
    yield { block, depth };
    yield* walkLessonBlocks(block.children as LessonBlock[], depth + 1);
  }
}

const listDepth = (block: LessonBlock): number =>
  block.type === "bulletListItem" || block.type === "numberedListItem" ? 1 + Math.max(0, ...block.children.map(listDepth)) : 0;

const safeVocabularyWords = (block: LessonBlockOf<"vocabulary">) => {
  try {
    return vocabularyPayloadSchema.safeParse(JSON.parse(block.props.data)).data?.words ?? [];
  } catch {
    return [];
  }
};

export const lessonDocumentSchema = z.strictObject({
  schemaVersion: z.literal(LESSON_DOCUMENT_SCHEMA_VERSION),
  blocks: z.array(topBlockSchema).max(COURSE_BLOCKS_MAX),
}).superRefine((document, context) => {
  const ids = new Set<string>();
  let count = 0;
  const claim = (id: string) => {
    if (ids.has(id)) context.addIssue({ code: "custom", path: ["blocks"], message: `Duplicate block or word ID ${id}.` });
    ids.add(id);
  };
  for (const { block } of walkLessonBlocks(document.blocks)) {
    count += 1;
    claim(block.id);
    // Refinements run even when a block failed its own schema, so an invalid payload is skipped here.
    if (block.type === "vocabulary") safeVocabularyWords(block).forEach((word) => claim(word.id));
    if (listDepth(block) > LESSON_LIST_DEPTH_MAX) context.addIssue({ code: "custom", path: ["blocks"], message: `Lists nest at most ${LESSON_LIST_DEPTH_MAX} levels.` });
  }
  if (count > COURSE_BLOCKS_MAX) context.addIssue({ code: "custom", path: ["blocks"], message: `A lesson holds at most ${COURSE_BLOCKS_MAX} blocks.` });
  if (new TextEncoder().encode(JSON.stringify(document)).length > LESSON_DOCUMENT_BYTES_MAX) {
    context.addIssue({ code: "custom", path: ["blocks"], message: "The lesson is too large." });
  }
});
export type LessonDocument = z.infer<typeof lessonDocumentSchema>;
export const emptyLessonDocument = (): LessonDocument => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [] });

export const readPracticeBlock = (block: LessonBlockOf<"practice">): PracticePayload => practicePayloadSchema.parse(JSON.parse(block.props.data));
export const readDialogueTurns = (block: LessonBlockOf<"dialogue">) => dialoguePayloadSchema.shape.turns.parse(JSON.parse(block.props.turns));
export function readVocabularyBlock(block: LessonBlockOf<"vocabulary">): VocabularyPayload {
  return vocabularyPayloadSchema.parse(JSON.parse(block.props.data));
}

export const collectPracticeIds = (document: LessonDocument) =>
  [...walkLessonBlocks(document.blocks)].filter(({ block }) => block.type === "practice").map(({ block }) => block.id);
export const collectImageUrls = (document: LessonDocument) =>
  [...walkLessonBlocks(document.blocks)].flatMap(({ block }) => block.type === "image" && block.props.url ? [block.props.url] : []);

// Rebuilds the document with each block passed through `map`; children are mapped before their parent.
export function mapLessonBlocks(document: LessonDocument, map: (block: LessonBlock) => LessonBlock): LessonDocument {
  const visit = (block: LessonBlock): LessonBlock => map({ ...block, children: (block.children as LessonBlock[]).map(visit) } as LessonBlock);
  return { ...document, blocks: document.blocks.map((block) => visit(block) as LessonTopBlock) };
}
// The API stores R2 keys and expands them to public URLs on read, so a media base URL change never breaks stored lessons.
export const mapImageUrls = (document: LessonDocument, map: (url: string) => string) =>
  mapLessonBlocks(document, (block) => block.type === "image" && block.props.url ? { ...block, props: { ...block.props, url: map(block.props.url) } } : block);

// Learners receive practice prompts only; authors' versions and notes travel separately, keyed by practice block ID.
export function toLearnerDocument(document: LessonDocument): { document: LessonDocument; references: Record<string, PracticeReference> } {
  const references: Record<string, PracticeReference> = {};
  const learner = mapLessonBlocks(document, (block) => {
    if (block.type !== "practice") return block;
    const { payload, reference } = splitPracticePayload(readPracticeBlock(block));
    references[block.id] = reference;
    return { ...block, props: { data: JSON.stringify(payload) } };
  });
  return { document: learner, references };
}

export const lessonPublishProblemKindSchema = z.enum(["image-missing", "image-alt-missing", "example-empty", "word-empty"]);
// `wordId` names the word of a `word-empty` problem.
export type LessonPublishProblem = { blockId: string; wordId?: string; problem: z.infer<typeof lessonPublishProblemKindSchema> };
// Drafts may hold unfinished work; publishing requires none of these.
export function findPublishProblems(document: LessonDocument): LessonPublishProblem[] {
  return [...walkLessonBlocks(document.blocks)].flatMap(({ block }): LessonPublishProblem[] => {
    if (block.type === "image" && !block.props.url) return [{ blockId: block.id, problem: "image-missing" }];
    if (block.type === "image" && !block.props.name.trim()) return [{ blockId: block.id, problem: "image-alt-missing" }];
    if (block.type === "example" && !inlineText(block.content).trim()) return [{ blockId: block.id, problem: "example-empty" }];
    if (block.type === "vocabulary") {
      return readVocabularyBlock(block).words
        .filter((word) => !word.term.trim() || !word.meaning.trim())
        .map((word) => ({ blockId: block.id, wordId: word.id, problem: "word-empty" }));
    }
    return [];
  });
}

// The words of a document in reading order, trimmed, with absent optional fields as null. `position` numbers the words
// across the whole lesson; the API's course word index and the lesson recap both read this.
export type LessonWord = {
  blockId: string; position: number; id: string; term: string; meaning: string; forms: string | null; example: string | null; note: string | null;
};
export function collectLessonWords(document: LessonDocument): LessonWord[] {
  const optional = (value: string | undefined) => value?.trim() || null;
  return [...walkLessonBlocks(document.blocks)]
    .flatMap(({ block }) => block.type === "vocabulary" ? readVocabularyBlock(block).words.map((word) => ({ blockId: block.id, word })) : [])
    .map(({ blockId, word }, position) => ({
      blockId, position, id: word.id, term: word.term.trim(), meaning: word.meaning.trim(),
      forms: optional(word.forms), example: optional(word.example), note: optional(word.note),
    }));
}

// Player steps. A heading is not a step; it labels the steps that follow. Consecutive prose (paragraphs, lists, images,
// dividers) under one heading is one step, trimmed of leading and trailing dividers and blank paragraphs. Columns without interactive blocks are one step; otherwise they are read column by column.
// Every step carries the new words it introduces (see `flattenToSteps`); a heading section holding only words is a `words` step.
type StepBase = { heading: string | null; words: VocabularyWord[] };
export type LessonStep = StepBase & (
  | { kind: "content"; blocks: LessonLeafBlock[] }
  | { kind: "callout"; block: LessonBlockOf<"callout"> }
  | { kind: "example"; block: LessonBlockOf<"example"> }
  | { kind: "columns"; block: LessonColumnListBlock }
  | { kind: "dialogueTurn"; block: LessonBlockOf<"dialogue">; turnIndex: number }
  | { kind: "practiceItem"; block: LessonBlockOf<"practice">; itemIndex: number }
  | { kind: "words"; blocks: LessonBlockOf<"vocabulary">[] }
);
type StepShape = LessonStep extends infer S ? S extends LessonStep ? Omit<S, keyof StepBase> : never : never;

const isInteractive = (block: LessonLeafBlock) => block.type === "dialogue" || block.type === "practice";
// Dividers and blank paragraphs only space prose out. They never make a step and never open or close one.
const isFiller = (block: LessonLeafBlock) => block.type === "divider" || (block.type === "paragraph" && !inlineText(block.content).trim());

// A vocabulary block is never a step. Its words join the steps built from the block directly before it in the same heading
// section: the prose step it ends, an example or callout, or every turn or item of a dialogue or practice. Words with no step
// before them in their section join the next block's steps; a section with no other step shows them as a `words` step keyed
// by its first vocabulary block. A columns step read as one carries the words inside it, which the player shows in place.
// A dialogue's words then move to the turns that use them (`spreadDialogueWords`).
export function flattenToSteps(document: LessonDocument): LessonStep[] {
  const steps: LessonStep[] = [];
  let heading: string | null = null;
  let prose: LessonLeafBlock[] = [];
  // The steps the next vocabulary block joins, and words still waiting for the section's first step.
  let previous: LessonStep[] = [];
  let pending: { blocks: LessonBlockOf<"vocabulary">[]; words: VocabularyWord[] } = { blocks: [], words: [] };
  const push = (shapes: StepShape[]) => {
    const added = shapes.map((shape) => ({ ...shape, heading, words: [...pending.words] }) as LessonStep);
    steps.push(...added);
    previous = added;
    pending = { blocks: [], words: [] };
  };
  const flush = () => {
    const first = prose.findIndex((block) => !isFiller(block));
    const last = prose.length - [...prose].reverse().findIndex((block) => !isFiller(block));
    if (first >= 0) push([{ kind: "content", blocks: prose.slice(first, last) }]);
    prose = [];
  };
  const endSection = () => {
    flush();
    if (pending.blocks.length) push([{ kind: "words", blocks: pending.blocks }]);
    previous = [];
  };
  const visit = (block: LessonLeafBlock) => {
    switch (block.type) {
      case "heading":
        endSection();
        heading = inlineText(block.content).trim() || heading;
        return;
      case "paragraph": case "bulletListItem": case "numberedListItem": case "image": case "divider":
        prose.push(block);
        return;
      case "callout": case "example":
        flush();
        push([block.type === "callout" ? { kind: "callout", block } : { kind: "example", block }]);
        return;
      case "dialogue":
        flush();
        push(readDialogueTurns(block).map((_, turnIndex) => ({ kind: "dialogueTurn", block, turnIndex })));
        return;
      case "practice":
        flush();
        push(readPracticeBlock(block).items.map((_, itemIndex) => ({ kind: "practiceItem", block, itemIndex })));
        return;
      case "vocabulary": {
        flush();
        const { words } = readVocabularyBlock(block);
        if (previous.length) previous.forEach((step) => step.words.push(...words));
        else pending = { blocks: [...pending.blocks, block], words: [...pending.words, ...words] };
        return;
      }
    }
  };
  for (const block of document.blocks) {
    if (block.type !== "columnList") {
      visit(block);
      continue;
    }
    const leaves = block.children.flatMap((column) => column.children);
    if (leaves.some(isInteractive)) {
      leaves.forEach(visit);
    } else {
      flush();
      push([{ kind: "columns", block }]);
      const inside = leaves.flatMap((leaf) => leaf.type === "vocabulary" ? readVocabularyBlock(leaf).words : []);
      previous.forEach((step) => step.words.push(...inside));
    }
  }
  endSection();
  spreadDialogueWords(steps);
  return steps;
}

// Words attached to a dialogue move to the first turn that uses them, so each line shows only its own new words. Words no
// turn uses stay on the last turn, so the whole list has appeared by the end of the dialogue.
function spreadDialogueWords(steps: LessonStep[]) {
  for (let start = 0; start < steps.length;) {
    const first = steps[start]!;
    let end = start + 1;
    if (first.kind === "dialogueTurn") while (steps[end]?.kind === "dialogueTurn" && (steps[end] as typeof first).block === first.block) end += 1;
    if (first.kind !== "dialogueTurn" || !first.words.length) {
      start = end;
      continue;
    }
    const words = first.words;
    const turns = readDialogueTurns(first.block).map((turn) => sentenceTokens(turn.text));
    const placed: VocabularyWord[][] = turns.map(() => []);
    for (const word of words) {
      const found = turns.findIndex((sentences) => usesWord(sentences, word));
      placed[found >= 0 ? found : turns.length - 1]!.push(word);
    }
    for (let index = start; index < end; index += 1) steps[index]!.words = placed[index - start]!;
    start = end;
  }
}

// Articles and reflexive pronouns in a term are not needed to recognise the word in a line.
const skippedTokens = new Set(["de", "het", "een", "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "zich", "sich"]);
const tokens = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []);
const sentenceTokens = (text: string) => text.split(/[.!?;:]+/).map(tokens).filter((sentence) => sentence.length);

// Inflected forms share a stem: at least four letters in common with no more than three letters after it on either side
// (check · checkt, stapt · stappen). Shorter words must match exactly.
function sameWord(a: string, b: string) {
  if (a === b) return true;
  let common = 0;
  while (common < a.length && a[common] === b[common]) common += 1;
  return common >= 4 && a.length - common <= 3 && b.length - common <= 3;
}

// A word is used when one sentence of the line holds the tokens of its term or of one of its forms, in order. Order keeps a
// separable verb's particle after its verb ("stappen we in"), so a preposition before it ("in Amsterdam stappen we over") does not count.
function usesWord(sentences: string[][], word: VocabularyWord) {
  const candidates = [word.term, ...(word.forms ?? "").split(/[·,;/]/)]
    .map((text) => tokens(text).filter((token) => !skippedTokens.has(token)))
    .filter((candidate) => candidate.length);
  return candidates.some((candidate) => sentences.some((sentence) => {
    let at = 0;
    for (const token of sentence) if (at < candidate.length && sameWord(token, candidate[at]!)) at += 1;
    return at === candidate.length;
  }));
}

// A step's key survives edits that do not touch its own block: the block ID, plus the line or item number inside it.
export function lessonStepKey(step: LessonStep): string {
  switch (step.kind) {
    case "content": case "words": return step.blocks[0]!.id;
    case "dialogueTurn": return `${step.block.id}:${step.turnIndex}`;
    case "practiceItem": return `${step.block.id}:${step.itemIndex}`;
    default: return step.block.id;
  }
}
export const lessonStepKeySchema = z.string().max(64).regex(/^[0-9a-f-]{36}(:\d{1,4})?$/i);
export const lessonPositionRequestSchema = z.strictObject({ stepKey: lessonStepKeySchema });
export type LessonPositionRequest = z.infer<typeof lessonPositionRequestSchema>;

// Resolves a saved position against the current steps; a step that no longer exists falls back to its old index.
export function resolveStepIndex(steps: readonly LessonStep[], stepKey: string, fallbackIndex: number) {
  const found = steps.findIndex((step) => lessonStepKey(step) === stepKey);
  return found >= 0 ? found : Math.max(0, Math.min(fallbackIndex, steps.length - 1));
}

// Upgrades v1 per-row blocks into a document. Migration 0015 performs the same mapping in SQL; tests keep them in step.
export type LegacyLessonBlock = { id: string; kind: string; payload: unknown };
const plain = (text: string): InlineContent => text ? [{ type: "text", text, styles: {} }] : [];
const defaultTextProps = { textColor: "default", backgroundColor: "default", textAlignment: "left" } as const;
export function upgradeLegacyBlocks(blocks: readonly LegacyLessonBlock[]): LessonDocument {
  const upgraded = blocks.map((block): LessonTopBlock => {
    const payload = block.payload as Record<string, unknown>;
    switch (block.kind) {
      case "heading":
        return { id: block.id, type: "heading", props: { ...defaultTextProps, level: 2, isToggleable: false }, content: plain(String(payload.title)), children: [] };
      case "text":
        return { id: block.id, type: "paragraph", props: defaultTextProps, content: plain(String(payload.content)), children: [] };
      case "example":
        return {
          id: block.id, type: "example", props: { translation: (payload.translation as string | null) ?? "", note: (payload.note as string | null) ?? "" },
          content: plain(String(payload.sentence)), children: [],
        };
      case "dialogue":
        return { id: block.id, type: "dialogue", props: { turns: JSON.stringify(payload.turns) }, children: [] };
      case "practice":
        return { id: block.id, type: "practice", props: { data: JSON.stringify(payload) }, children: [] };
      default:
        throw new Error(`Unknown legacy block kind ${block.kind}.`);
    }
  });
  return lessonDocumentSchema.parse({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: upgraded });
}

// Reads a stored document of any known schema version, or returns null when it is unreadable.
export function parseStoredLessonDocument(raw: unknown): LessonDocument | null {
  const parsed = lessonDocumentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const draftVersionSchema = z.number().int().positive();
export const saveLessonDraftRequestSchema = z.strictObject({ document: lessonDocumentSchema, draftVersion: draftVersionSchema });
export type SaveLessonDraftRequest = z.input<typeof saveLessonDraftRequestSchema>;
export const publishLessonRequestSchema = z.strictObject({ draftVersion: draftVersionSchema });
export type PublishLessonRequest = z.input<typeof publishLessonRequestSchema>;
export const lessonImageUploadResponseSchema = z.object({
  key: z.string(), url: z.url(), width: z.number().int().positive(), height: z.number().int().positive(),
});
export type LessonImageUploadResponse = z.infer<typeof lessonImageUploadResponseSchema>;

// The lesson as one reader sees it. Learners receive the published document with practice prompts only; the owner and
// active contributors also receive the full draft, including authors' versions and item notes, and its version.
export const lessonDraftSchema = z.object({ document: lessonDocumentSchema, version: draftVersionSchema });
export type LessonDraft = z.infer<typeof lessonDraftSchema>;
export const courseLessonSchema = courseLessonSummarySchema.extend({
  document: lessonDocumentSchema.nullable(),
  answerCounts: z.record(z.string(), z.number().int().nonnegative()),
  draft: lessonDraftSchema.nullable(),
});
export type CourseLesson = z.infer<typeof courseLessonSchema>;
export const lessonResponseSchema = z.object({ lesson: courseLessonSchema });
export const courseDetailResponseSchema = z.object({
  course: courseSchema, outline: z.array(courseLessonSummarySchema), lessons: z.array(courseLessonSchema).max(COURSE_PRELOADED_LESSONS),
});
export type CourseDetailResponse = z.infer<typeof courseDetailResponseSchema>;
export const lessonDraftSavedResponseSchema = z.object({
  draftVersion: draftVersionSchema, changed: z.boolean(), updatedBy: editorRefSchema, updatedAt: z.number().int(),
});
export type LessonDraftSavedResponse = z.infer<typeof lessonDraftSavedResponseSchema>;
// A stale save is refused with the current draft so the editor can merge or reload without another request.
export const lessonDraftConflictSchema = z.object({
  error: z.object({ code: z.literal("VERSION_CONFLICT"), message: z.string() }), draft: lessonDraftSchema,
});
export const lessonPublishProblemSchema = z.object({ blockId: z.string(), wordId: z.string().optional(), problem: lessonPublishProblemKindSchema });
export const lessonNotReadySchema = z.object({
  error: z.object({ code: z.literal("LESSON_NOT_READY"), message: z.string() }), problems: z.array(lessonPublishProblemSchema),
});

// The course word recap: the words of the currently published lessons the viewer has finished, in lesson order and then
// document order, with repeated terms (trimmed, case-insensitive) kept at their first occurrence.
export const courseWordSchema = z.object({
  id: opaqueIdSchema, lessonId: opaqueIdSchema, term: z.string(), meaning: z.string(),
  forms: z.string().nullable(), example: z.string().nullable(), note: z.string().nullable(),
});
export type CourseWord = z.infer<typeof courseWordSchema>;
export const courseWordsResponseSchema = z.object({ words: z.array(courseWordSchema).max(COURSE_RECAP_WORDS_MAX) });
export type CourseWordsResponse = z.infer<typeof courseWordsResponseSchema>;

// Word bookmarks (C9b): a member's keys to words of published lessons. Keys mark bookmark toggles on every surface; the list
// carries the indexed word with its course and lesson, newest bookmark first, and leaves out words no longer published.
export const wordBookmarkKeySchema = z.object({ lessonId: opaqueIdSchema, wordId: opaqueIdSchema });
export type WordBookmarkKey = z.infer<typeof wordBookmarkKeySchema>;
export const wordBookmarkKeysResponseSchema = z.object({ keys: z.array(wordBookmarkKeySchema).max(WORD_BOOKMARKS_MAX) });
export type WordBookmarkKeysResponse = z.infer<typeof wordBookmarkKeysResponseSchema>;
export const wordBookmarkSchema = z.object({
  word: courseWordSchema, course: z.object({ id: opaqueIdSchema, title: z.string() }), lesson: z.object({ id: opaqueIdSchema, title: z.string() }),
  bookmarkedAt: z.number().int(),
});
export type WordBookmark = z.infer<typeof wordBookmarkSchema>;
export const wordBookmarkPageSchema = z.object({ items: z.array(wordBookmarkSchema), nextCursor: z.string().nullable() });
export type WordBookmarkPage = z.infer<typeof wordBookmarkPageSchema>;
export const wordBookmarksQuerySchema = paginationQuerySchema;
