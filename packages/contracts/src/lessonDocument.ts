import { z } from "zod";
import {
  COURSE_BLOCK_TEXT_MAX, COURSE_BLOCKS_MAX, COURSE_HEADING_MAX, COURSE_NOTE_MAX, COURSE_PRELOADED_LESSONS, COURSE_SENTENCE_MAX, courseLessonSummarySchema,
  courseSchema, dialoguePayloadSchema, editorRefSchema, opaqueIdSchema, practicePayloadSchema, splitPracticePayload, type PracticePayload,
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

const leafBlockSchema = z.discriminatedUnion("type", [
  paragraphSchema, headingSchema, bulletListItemSchema, numberedListItemSchema, dividerSchema, imageSchema, calloutSchema, exampleSchema, dialogueSchema,
  practiceSchema,
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

export const lessonDocumentSchema = z.strictObject({
  schemaVersion: z.literal(LESSON_DOCUMENT_SCHEMA_VERSION),
  blocks: z.array(topBlockSchema).max(COURSE_BLOCKS_MAX),
}).superRefine((document, context) => {
  const ids = new Set<string>();
  let count = 0;
  for (const { block } of walkLessonBlocks(document.blocks)) {
    count += 1;
    if (ids.has(block.id)) context.addIssue({ code: "custom", path: ["blocks"], message: `Duplicate block ID ${block.id}.` });
    ids.add(block.id);
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

export type LessonPublishProblem = { blockId: string; problem: "image-missing" | "image-alt-missing" | "example-empty" };
// Drafts may hold unfinished work; publishing requires none of these.
export function findPublishProblems(document: LessonDocument): LessonPublishProblem[] {
  return [...walkLessonBlocks(document.blocks)].flatMap(({ block }): LessonPublishProblem[] => {
    if (block.type === "image" && !block.props.url) return [{ blockId: block.id, problem: "image-missing" }];
    if (block.type === "image" && !block.props.name.trim()) return [{ blockId: block.id, problem: "image-alt-missing" }];
    if (block.type === "example" && !inlineText(block.content).trim()) return [{ blockId: block.id, problem: "example-empty" }];
    return [];
  });
}

// Player steps. A heading is not a step; it labels the steps that follow. Consecutive prose (paragraphs, lists, images,
// dividers) under one heading is one step. Columns without interactive blocks are one step; otherwise they are read column by column.
export type LessonStep =
  | { kind: "content"; heading: string | null; blocks: LessonLeafBlock[] }
  | { kind: "callout"; heading: string | null; block: LessonBlockOf<"callout"> }
  | { kind: "example"; heading: string | null; block: LessonBlockOf<"example"> }
  | { kind: "columns"; heading: string | null; block: LessonColumnListBlock }
  | { kind: "dialogueTurn"; heading: string | null; block: LessonBlockOf<"dialogue">; turnIndex: number }
  | { kind: "practiceItem"; heading: string | null; block: LessonBlockOf<"practice">; itemIndex: number };

const isInteractive = (block: LessonLeafBlock) => block.type === "dialogue" || block.type === "practice";
const isBlankParagraph = (block: LessonLeafBlock) => block.type === "paragraph" && !inlineText(block.content).trim();

export function flattenToSteps(document: LessonDocument): LessonStep[] {
  const steps: LessonStep[] = [];
  let heading: string | null = null;
  let prose: LessonLeafBlock[] = [];
  const flush = () => {
    if (prose.some((block) => !isBlankParagraph(block))) steps.push({ kind: "content", heading, blocks: prose });
    prose = [];
  };
  const visit = (block: LessonLeafBlock) => {
    switch (block.type) {
      case "heading":
        flush();
        heading = inlineText(block.content).trim() || heading;
        return;
      case "paragraph": case "bulletListItem": case "numberedListItem": case "image": case "divider":
        prose.push(block);
        return;
      case "callout": case "example":
        flush();
        steps.push(block.type === "callout" ? { kind: "callout", heading, block } : { kind: "example", heading, block });
        return;
      case "dialogue":
        flush();
        readDialogueTurns(block).forEach((_, turnIndex) => steps.push({ kind: "dialogueTurn", heading, block, turnIndex }));
        return;
      case "practice":
        flush();
        readPracticeBlock(block).items.forEach((_, itemIndex) => steps.push({ kind: "practiceItem", heading, block, itemIndex }));
        return;
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
      steps.push({ kind: "columns", heading, block });
    }
  }
  flush();
  return steps;
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
export const lessonPublishProblemSchema = z.object({ blockId: z.string(), problem: z.enum(["image-missing", "image-alt-missing", "example-empty"]) });
export const lessonNotReadySchema = z.object({
  error: z.object({ code: z.literal("LESSON_NOT_READY"), message: z.string() }), problems: z.array(lessonPublishProblemSchema),
});

