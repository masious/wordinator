import { z } from "zod";
import { foldEquivalentAccents, opaqueIdSchema } from "./index";
import { inlineText, readDialogueTurns, type LessonBlock, type LessonBlockOf, type LessonDocument } from "./lessonDocument";

export const LESSON_ACTIVITY_RECIPE_VERSION = 2;
export const LESSON_ACTIVITY_SCHEMA_VERSION = 2;
export const LESSON_ACTIVITY_TEXT_MAX = 4_000;
export const LESSON_ACTIVITY_ANSWER_MAX = 2_000;
// Source fingerprints are SHA-256 digests in lowercase hex, shared by descriptors, views and open requests.
export const SOURCE_FINGERPRINT_SCHEMA = z.string().regex(/^[a-f0-9]{64}$/);
export const lessonActivityTypeSchema = z.enum([
  "story_summary", "story_comprehension", "grammar_explanation", "tricky_grammar", "mixed_practice", "roleplay", "guided_grammar", "read_aloud", "speak_from_english",
]);
export type LessonActivityType = z.infer<typeof lessonActivityTypeSchema>;
export type ActivityType = LessonActivityType;
export const lessonActivityMetricSchema = z.enum(["lesson_share", "lesson_reading", "lesson_grammar", "lesson_activities"]);
export type ActivityMetric = z.infer<typeof lessonActivityMetricSchema>;
export const lessonActivityFocus = (type: LessonActivityType): "reading" | "grammar" | "speaking" =>
  type === "roleplay" || type === "read_aloud" || type === "speak_from_english" ? "speaking"
    : type === "story_summary" || type === "story_comprehension" ? "reading" : "grammar";
export const lessonActivitySourceKindSchema = z.enum(["section", "dialogue", "lesson_end"]);
export type LessonActivitySourceKind = z.infer<typeof lessonActivitySourceKindSchema>;
export const lessonActivityDescriptorSchema = z.strictObject({
  sourceId: z.string().min(1).max(200), sourceKind: lessonActivitySourceKindSchema, sourceLabel: z.string().min(1).max(200),
  returnBlockId: opaqueIdSchema.nullable(), returnHeadingId: opaqueIdSchema.nullable(), fingerprint: SOURCE_FINGERPRINT_SCHEMA,
  activityTypes: z.array(lessonActivityTypeSchema),
});
export type ActivityDescriptor = z.infer<typeof lessonActivityDescriptorSchema>;
// The viewer's own completed activities for the lesson whose source fingerprint is still current (docs/lesson-activities.md#scope-and-entry-point).
export const activityCompletionSchema = z.strictObject({ sourceId: z.string().min(1).max(200), type: lessonActivityTypeSchema });
export type ActivityCompletion = z.infer<typeof activityCompletionSchema>;
export const activityDescriptorListResponseSchema = z.strictObject({
  descriptors: z.array(lessonActivityDescriptorSchema),
  completed: z.array(activityCompletionSchema).default([]),
});

const shortText = z.string().trim().min(1).max(LESSON_ACTIVITY_TEXT_MAX);
export const choiceQuestionViewSchema = z.strictObject({ id: opaqueIdSchema, kind: z.literal("choice"), prompt: shortText, options: z.array(z.strictObject({ id: opaqueIdSchema, text: shortText })).length(3) });
const fillInQuestionViewSchema = z.strictObject({ id: opaqueIdSchema, kind: z.literal("fill_in"), prompt: shortText });
const wordOrderQuestionViewSchema = z.strictObject({ id: opaqueIdSchema, kind: z.literal("word_order"), prompt: shortText, tokens: z.array(shortText).min(2).max(30) });
const questionViewSchema = z.discriminatedUnion("kind", [choiceQuestionViewSchema, fillInQuestionViewSchema, wordOrderQuestionViewSchema]);
export const choiceQuestionPayloadSchema = z.strictObject({ id: opaqueIdSchema, kind: z.literal("choice"), prompt: shortText, options: z.array(z.strictObject({ id: opaqueIdSchema, text: shortText })).length(3), correctOptionId: opaqueIdSchema, explanation: shortText })
  .superRefine((question, context) => {
    if (!question.options.some((option) => option.id === question.correctOptionId)) context.addIssue({ code: "custom", path: ["correctOptionId"], message: "Choose one of the listed options." });
    if (new Set(question.options.map((option) => option.id)).size !== question.options.length) context.addIssue({ code: "custom", path: ["options"], message: "Option IDs must be unique." });
  });
const fillInQuestionPayloadSchema = z.strictObject({ id: opaqueIdSchema, kind: z.literal("fill_in"), prompt: shortText, referenceAnswers: z.array(shortText).min(1).max(10), explanation: shortText });
const wordOrderQuestionPayloadSchema = z.strictObject({ id: opaqueIdSchema, kind: z.literal("word_order"), prompt: shortText, tokens: z.array(shortText).min(2).max(30), expectedOrder: z.array(z.number().int().nonnegative()).min(2).max(30), explanation: shortText })
  .superRefine((question, context) => {
    if (question.expectedOrder.length !== question.tokens.length || new Set(question.expectedOrder).size !== question.tokens.length || question.expectedOrder.some((value) => value >= question.tokens.length)) context.addIssue({ code: "custom", path: ["expectedOrder"], message: "Expected order must be a permutation of the tokens." });
  });
const questionPayloadSchema = z.discriminatedUnion("kind", [choiceQuestionPayloadSchema, fillInQuestionPayloadSchema, wordOrderQuestionPayloadSchema]);
const roleplayTurnViewSchema = z.strictObject({ id: opaqueIdSchema, index: z.number().int().nonnegative(), speaker: shortText, isLearner: z.boolean(), cue: shortText.nullable(), dutchText: shortText, englishText: shortText.nullable(), voice: z.string().trim().min(1).max(100).nullable() });
const roleplayTurnPayloadSchema = roleplayTurnViewSchema.extend({ referenceText: shortText });
const activityContents = {
  story_summary: z.strictObject({ englishSummary: shortText, dutchRecap: shortText }),
  story_comprehension: z.strictObject({ questions: z.array(choiceQuestionPayloadSchema).length(4) }),
  grammar_explanation: z.strictObject({ paragraphs: z.array(shortText).min(1).max(8), examples: z.array(z.strictObject({ dutch: shortText, english: shortText })).min(1).max(12) }),
  tricky_grammar: z.strictObject({ questions: z.array(questionPayloadSchema).length(4) }),
  mixed_practice: z.strictObject({ questions: z.array(questionPayloadSchema).length(6) }),
  roleplay: z.strictObject({ dialogueId: opaqueIdSchema, cueLanguage: z.enum(["english", "dutch"]), turns: z.array(roleplayTurnPayloadSchema).min(2).max(60) }),
} as const;
const activityPayload = <T extends LessonActivityType, S extends z.ZodRawShape>(type: T, shape: S) => z.strictObject({
  type: z.literal(type), recipeVersion: z.number().int().positive(), schemaVersion: z.number().int().positive(), ...shape,
});
export const lessonActivityPayloadSchema = z.discriminatedUnion("type", [
  activityPayload("story_summary", activityContents.story_summary.shape),
  activityPayload("story_comprehension", activityContents.story_comprehension.shape),
  activityPayload("grammar_explanation", activityContents.grammar_explanation.shape),
  activityPayload("tricky_grammar", activityContents.tricky_grammar.shape),
  activityPayload("mixed_practice", activityContents.mixed_practice.shape),
  activityPayload("roleplay", activityContents.roleplay.shape),
]).superRefine((payload, context) => {
  if ("questions" in payload && new Set(payload.questions.map((question) => question.id)).size !== payload.questions.length) context.addIssue({ code: "custom", path: ["questions"], message: "Question IDs must be unique." });
});
export type LessonActivityPayload = z.infer<typeof lessonActivityPayloadSchema>;
const viewContents = {
  story_summary: activityContents.story_summary,
  story_comprehension: z.strictObject({ questions: z.array(choiceQuestionViewSchema).length(4) }),
  grammar_explanation: activityContents.grammar_explanation,
  tricky_grammar: z.strictObject({ questions: z.array(questionViewSchema).length(4) }),
  mixed_practice: z.strictObject({ questions: z.array(questionViewSchema).length(6) }),
  roleplay: z.strictObject({ dialogueId: opaqueIdSchema, cueLanguage: z.enum(["english", "dutch"]), turns: z.array(roleplayTurnViewSchema).min(2).max(60) }),
} as const;
const activityViewPayload = <T extends LessonActivityType, S extends z.ZodRawShape>(type: T, shape: S) => z.strictObject({
  type: z.literal(type), recipeVersion: z.number().int().positive(), schemaVersion: z.number().int().positive(), ...shape,
});
export const lessonActivityViewPayloadSchema = z.discriminatedUnion("type", [
  activityViewPayload("story_summary", viewContents.story_summary.shape),
  activityViewPayload("story_comprehension", viewContents.story_comprehension.shape),
  activityViewPayload("grammar_explanation", viewContents.grammar_explanation.shape),
  activityViewPayload("tricky_grammar", viewContents.tricky_grammar.shape),
  activityViewPayload("mixed_practice", viewContents.mixed_practice.shape),
  activityViewPayload("roleplay", viewContents.roleplay.shape),
]);
export type LessonActivityViewPayload = z.infer<typeof lessonActivityViewPayloadSchema>;
export const lessonActivityViewSchema = z.strictObject({
  id: opaqueIdSchema, sourceId: z.string().min(1).max(200), sourceLabel: shortText, sourceFingerprint: SOURCE_FINGERPRINT_SCHEMA, payload: lessonActivityViewPayloadSchema,
});
export type LessonActivityView = z.infer<typeof lessonActivityViewSchema>;

export const lessonActivityRunSchema = z.strictObject({ id: opaqueIdSchema, status: z.enum(["active", "completed"]), cursor: z.number().int().nonnegative(), cueMode: z.enum(["english", "dutch"]), startedAt: z.number().int(), updatedAt: z.number().int(), completedAt: z.number().int().nullable(), ephemeral: z.boolean().default(false) });
export type LessonActivityRun = z.infer<typeof lessonActivityRunSchema>;
export const activityOpenRequestSchema = z.strictObject({ sourceId: z.string().min(1).max(200), type: lessonActivityTypeSchema, expectedFingerprint: SOURCE_FINGERPRINT_SCHEMA });
export const activityOpenResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready"), activity: lessonActivityViewSchema, run: lessonActivityRunSchema, ephemeral: z.boolean().default(false) }),
  z.strictObject({ status: z.literal("generating"), activityId: opaqueIdSchema, retryAfterMs: z.number().int().min(250).max(10_000) }),
]);
export const activityStatusResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("generating"), retryAfterMs: z.number().int().min(250).max(10_000) }),
  z.strictObject({ status: z.literal("ready"), activity: lessonActivityViewSchema, run: lessonActivityRunSchema, ephemeral: z.boolean().default(false) }),
  z.strictObject({ status: z.literal("failed"), retryAfterMs: z.number().int().nonnegative().nullable() }),
]);
export const activityInputModeSchema = z.enum(["typed", "spoken"]);
export const activityAnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("choice"), optionId: opaqueIdSchema }),
  z.strictObject({ kind: z.literal("text"), text: z.string().max(LESSON_ACTIVITY_ANSWER_MAX) }),
  z.strictObject({ kind: z.literal("word_order"), order: z.array(z.number().int().nonnegative()).min(2).max(30) }),
]);
export const activityAnswerRequestSchema = z.strictObject({ runId: opaqueIdSchema, itemId: opaqueIdSchema, answer: activityAnswerSchema, inputMode: activityInputModeSchema, idempotencyKey: opaqueIdSchema });
export const activityAnswerResponseSchema = z.strictObject({ answerId: opaqueIdSchema, itemId: opaqueIdSchema, correct: z.boolean(), reference: shortText.nullable(), explanation: shortText.nullable(), pronunciation: z.unknown().nullable() });
export const activityRunPatchRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("set_cue_mode"), cueMode: z.enum(["english", "dutch"]) }),
  z.strictObject({ action: z.literal("continue"), expectedCursor: z.number().int().nonnegative() }),
  z.strictObject({ action: z.literal("complete") }), z.strictObject({ action: z.literal("restart") }),
]);
export const activityRunPatchResponseSchema = z.strictObject({ run: lessonActivityRunSchema });
export const activitySpeechRequestSchema = z.strictObject({ runId: opaqueIdSchema, turnId: opaqueIdSchema, chunkIndex: z.number().int().nonnegative().optional() });
export const activitySpeechResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready"), url: z.string().url() }), z.strictObject({ status: z.literal("pending"), retryAfterMs: z.number().int().min(250).max(10_000) }),
]);

export function toLessonActivityView(activity: Omit<LessonActivityView, "payload"> & { payload: LessonActivityPayload }): LessonActivityView {
  const { payload, ...rest } = activity;
  const stripQuestion = (question: z.infer<typeof questionPayloadSchema>): z.infer<typeof questionViewSchema> => {
    if (question.kind === "choice") return { id: question.id, kind: question.kind, prompt: question.prompt, options: question.options };
    if (question.kind === "fill_in") return { id: question.id, kind: question.kind, prompt: question.prompt };
    return { id: question.id, kind: question.kind, prompt: question.prompt, tokens: question.tokens };
  };
  const clean = payload.type === "story_comprehension" ? { ...payload, questions: payload.questions.map(stripQuestion) }
      : payload.type === "tricky_grammar" || payload.type === "mixed_practice" ? { ...payload, questions: payload.questions.map(stripQuestion) }
        : payload.type === "roleplay" ? { ...payload, turns: payload.turns.map(({ referenceText: _, ...turn }) => turn) } : payload;
  return lessonActivityViewSchema.parse({ ...rest, payload: clean });
}

export function gradeLessonActivityAnswer(payload: LessonActivityPayload, itemId: string, answer: z.infer<typeof activityAnswerSchema>) {
  const items = payload.type === "story_comprehension" || payload.type === "tricky_grammar" || payload.type === "mixed_practice" ? payload.questions
    : payload.type === "roleplay" ? payload.turns.filter((turn) => turn.isLearner) : [];
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  if ("isLearner" in item) return { correct: answer.kind === "text" && sameLessonSentence(answer.text, item.referenceText), reference: item.referenceText, explanation: null };
  if (item.kind === "choice") return { correct: answer.kind === "choice" && answer.optionId === item.correctOptionId, reference: item.options.find((option) => option.id === item.correctOptionId)?.text ?? null, explanation: item.explanation };
  if (item.kind === "fill_in") return { correct: answer.kind === "text" && item.referenceAnswers.some((reference) => sameLessonSentence(answer.text, reference)), reference: item.referenceAnswers[0] ?? null, explanation: item.explanation };
  return { correct: answer.kind === "word_order" && answer.order.length === item.expectedOrder.length && answer.order.every((value, index) => value === item.expectedOrder[index]), reference: item.expectedOrder.map((index) => item.tokens[index] ?? "").join(" "), explanation: item.explanation };
}
// Sentence comparison for role-play reproduction and fill-in answers (plan 04): NFKC, case, the project's accent equivalence
// (foldEquivalentAccents, the rule answer matching uses), and spacing. Punctuation, quotes, dashes and symbols count as spaces,
// except an apostrophe inside a word, which is kept and typographic forms are read as straight: "z'n" = "z’n", but "z'n" != "zn".
// Articles are not dropped (word-card matching does that; this rule does not), so "de man" and "man" differ.
const edgeApostrophe = /(?<![\p{L}\p{N}\p{M}])['’‘ʼ]|['’‘ʼ](?![\p{L}\p{N}\p{M}])/gu;
export const normalizeLessonSentence = (value: string) => foldEquivalentAccents(value.normalize("NFKC")).toLowerCase()
  .replace(edgeApostrophe, " ").replace(/['’‘ʼ]/gu, "'").replace(/[^\p{L}\p{N}\p{M}'\s]+/gu, " ").replace(/\s+/gu, " ").trim();
// A blank answer never matches, even against a reference that normalizes to nothing.
const sameLessonSentence = (given: string, reference: string) => {
  const normalized = normalizeLessonSentence(given);
  return normalized.length > 0 && normalized === normalizeLessonSentence(reference);
};

export type LessonActivitySourceInput = { document: LessonDocument; title?: string; includeLessonEnd?: boolean };
export async function fingerprintLessonActivitySource(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const activitySourceBlock = (block: LessonBlock): unknown => {
  if (block.type === "heading" || block.type === "paragraph" || block.type === "bulletListItem" || block.type === "numberedListItem") return { id: block.id, type: block.type, content: block.content };
  if (block.type === "callout") return { id: block.id, type: block.type, variant: block.props.variant, content: block.content };
  if (block.type === "example") return { id: block.id, type: block.type, content: block.content, translation: block.props.translation };
  if (block.type === "dialogue") return { id: block.id, type: block.type, turns: readDialogueTurns(block) };
  if (block.type === "columnList") return { id: block.id, type: block.type, children: block.children.map((column) => ({ id: column.id, children: column.children.map(activitySourceBlock) })) };
  return { id: block.id, type: block.type };
};
export async function resolveLessonActivitySources({ document, title = "Lesson", includeLessonEnd = true }: LessonActivitySourceInput): Promise<ActivityDescriptor[]> {
  const flattened: { block: LessonBlock; depth: number }[] = [];
  const visit = (blocks: readonly LessonBlock[], depth = 0) => blocks.forEach((block) => {
    flattened.push({ block, depth });
    if (block.type === "columnList") block.children.forEach((column) => visit(column.children as LessonBlock[], depth + 1));
    else if (block.type === "bulletListItem" || block.type === "numberedListItem") visit(block.children as LessonBlock[], depth + 1);
  });
  visit(document.blocks);
  const headingText = (block: LessonBlock) => block.type === "heading" ? inlineText(block.content).trim() : "";
  const starts = flattened.flatMap(({ block, depth }, index) => block.type === "heading" ? [{ index, block, depth, level: block.props.level, label: headingText(block) }] : []);
  const sections: { id: string; label: string; headingId: string | null; start: number; end: number; topLevel: number; grammar: boolean }[] = [];
  // Headings in columns do not become section boundaries; level 3 headings become independent only inside a grammar section.
  let root: { id: string; label: string; headingId: string | null; start: number; end: number; topLevel: number; grammar: boolean } | null = null;
  for (const heading of starts) {
    if (heading.depth > 0) continue;
    if (heading.level <= 2) {
      if (root) { root.end = heading.index; sections.push(root); }
      root = { id: heading.block.id, label: heading.label, headingId: heading.block.id, start: heading.index + 1, end: flattened.length, topLevel: heading.level, grammar: false };
    }
  }
  if (root) sections.push(root);
  for (const section of sections) {
    const next = sections.find((candidate) => candidate.start > section.start && (candidate.topLevel <= section.topLevel));
    if (next) section.end = Math.min(section.end, next.start - 1);
  }
  const descriptors: ActivityDescriptor[] = [];
  const add = async (sourceId: string, sourceKind: LessonActivitySourceKind, label: string, blockId: string | null, headingId: string | null, content: unknown, activityTypes: LessonActivityType[]) => {
    if (!activityTypes.length) return;
    descriptors.push({ sourceId, sourceKind, sourceLabel: label, returnBlockId: blockId, returnHeadingId: headingId, fingerprint: await fingerprintLessonActivitySource(content), activityTypes });
  };
  const isDialogue = (block: LessonBlock): block is LessonBlockOf<"dialogue"> => block.type === "dialogue";
  // A dialogue is eligible for role-play only when Sofia and at least one partner both have original turns.
  const isRoleplayEligible = (turns: ReturnType<typeof readDialogueTurns>) => turns.some((turn) => turn.speaker.trim().toLocaleLowerCase() === "sofia") && turns.some((turn) => turn.speaker.trim().toLocaleLowerCase() !== "sofia");
  const firstHeadingIndex = starts.find(({ depth }) => depth === 0)?.index ?? flattened.length;
  const introBlocks = flattened.slice(0, firstHeadingIndex).map(({ block }) => block).filter((block) => block.type !== "divider");
  if (introBlocks.length) {
    const dialogues = introBlocks.filter(isDialogue);
    const types: LessonActivityType[] = dialogues.length ? ["story_summary", "story_comprehension"] : [];
    await add("intro", "section", "Introduction", introBlocks[0]!.id, null, introBlocks.map(activitySourceBlock), types);
    for (const dialogue of dialogues) {
      const turns = readDialogueTurns(dialogue);
      if (isRoleplayEligible(turns)) await add(dialogue.id, "dialogue", "Dialogue · Introduction", dialogue.id, null, turns, ["roleplay"]);
    }
  }
  const activitySections: typeof sections = [];
  for (const section of sections) {
    const sectionBlocks = flattened.slice(section.start, section.end).map(({ block }) => block);
    section.grammar = /grammar/i.test(section.label) || sectionBlocks.some((block) => block.type === "callout" && block.props.variant === "grammar");
    const grammarHeadings = section.grammar ? starts.filter((heading) => heading.depth === 0 && heading.level === 3 && heading.index >= section.start && heading.index < section.end) : [];
    if (!grammarHeadings.length) { activitySections.push(section); continue; }
    let start = section.start;
    let id = section.id;
    let label = section.label;
    let headingId = section.headingId;
    for (const heading of grammarHeadings) {
      if (heading.index > start) activitySections.push({ ...section, id, label, headingId, start, end: heading.index, topLevel: 3 });
      start = heading.index + 1;
      id = heading.block.id;
      label = heading.label;
      headingId = heading.block.id;
    }
    activitySections.push({ ...section, id, label, headingId, start, end: section.end, topLevel: 3 });
  }
  for (const section of activitySections) {
    const contents = flattened.slice(section.start, section.end).map(({ block }) => block);
    if (!contents.some((block) => block.type !== "divider")) continue;
    const dialogues = contents.filter(isDialogue);
    const hasGrammar = section.grammar;
    const hasSummary = /summary|recap|wrap[- ]?up|lesson end/i.test(section.label);
    const types: LessonActivityType[] = dialogues.length ? ["story_summary", "story_comprehension"] : [];
    if (hasGrammar) types.push("grammar_explanation", "tricky_grammar");
    if (hasSummary) types.push("mixed_practice");
    const safeTypes = [...new Set(types)];
    await add(section.id, "section", section.label || title, contents[0]?.id ?? section.headingId, section.headingId, contents.map(activitySourceBlock), safeTypes);
    for (const dialogue of dialogues) {
      const turns = readDialogueTurns(dialogue);
      if (!isRoleplayEligible(turns)) continue;
      await add(dialogue.id, "dialogue", `Dialogue · ${section.label}`, dialogue.id, section.headingId, turns, ["roleplay"]);
    }
  }
  if (includeLessonEnd) await add("lesson_end", "lesson_end", `${title} · End`, null, null, document.blocks.map(activitySourceBlock), ["mixed_practice"]);
  return descriptors;
}

export const verifyLessonActivitySource = (descriptors: readonly ActivityDescriptor[], sourceId: string, type: LessonActivityType, fingerprint: string) => {
  const descriptor = descriptors.find((item) => item.sourceId === sourceId && item.activityTypes.includes(type));
  return descriptor?.fingerprint === fingerprint ? descriptor : null;
}
