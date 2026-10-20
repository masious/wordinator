import { z } from "zod";
import { aiProviderSchema } from "./ai";
import { blankMatches, countBlanks, normalizeAnswer, opaqueIdSchema } from "./index";
import { practiceAttemptVerdictSchema, pronunciationScoresSchema } from "./learning";
import { wordDrillDirectionSchema, wordDrillResultSchema } from "./lessonDocument";

// The AI tutor (C14g): conversations, messages and their parts, the streamed turn's events, the answer components with their
// payloads, answers, and pure grading, and the tutor profile. docs/ai-tutor.md owns behavior and docs/data-model.md#ai-tutor the
// rows. The component payloads are shared with AI practices (C14h, docs/courses.md#ai-practices).

// ---- Limits ----

export const TUTOR_MESSAGE_TEXT_MAX = 4_000;
export const TUTOR_TITLE_MAX = 80;
export const TUTOR_GOALS_MAX = 500;
export const TUTOR_NOTES_MAX = 2_000;
// A target-language span longer than this has no speaker button and is refused by the speech route.
export const TUTOR_SPAN_MAX = 300;
export const TUTOR_CONVERSATIONS_PAGE_SIZE = 20;
export const TUTOR_MESSAGES_PAGE_SIZE = 30;
// Sentences in component payloads.
export const TUTOR_SENTENCE_MAX = 500;
export const TUTOR_SHORT_TEXT_MAX = 200;
export const TUTOR_COMPONENT_WORDS_MAX = 8;
// Say it counts as passed from this overall pronunciation score.
export const TUTOR_SAY_IT_PASS_SCORE = 60;
export const TUTOR_NOTE_MAX = 500;
// Word hints per component, and the length of a hint's cue (the native-language words of the question it explains).
export const TUTOR_HINTS_MAX = 4;
export const TUTOR_HINT_CUE_MAX = 80;

// ---- Target-language spans ----

// The model marks target-language text it wants spoken as `[[...]]`. The server parses the marks out of each stored text part
// into `spans` (offsets into the text without the marks), so the web cannot add spans. Streamed `text` deltas still carry the raw
// marks; the web runs `parseTargetSpans` over the text it has so far and replaces it with the stored message when the turn ends.
export const tutorSpanSchema = z.strictObject({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() });
export type TutorSpan = z.infer<typeof tutorSpanSchema>;

export function parseTargetSpans(raw: string): { text: string; spans: TutorSpan[] } {
  let text = "";
  const spans: TutorSpan[] = [];
  let index = 0;
  while (index < raw.length) {
    const open = raw.indexOf("[[", index);
    const close = open < 0 ? -1 : raw.indexOf("]]", open + 2);
    if (open < 0 || close < 0) { text += raw.slice(index); break; }
    const inner = raw.slice(open + 2, close);
    // A second opening mark before the close: the first one is literal text.
    const nested = inner.lastIndexOf("[[");
    if (nested >= 0) { text += raw.slice(index, open + 2 + nested); index = open + 2 + nested; continue; }
    text += raw.slice(index, open);
    const trimmed = inner.trim();
    if (trimmed) {
      const start = text.length + (inner.length - inner.trimStart().length);
      spans.push({ start, end: start + trimmed.length });
    }
    text += inner;
    index = close + 2;
  }
  return { text, spans };
}

// The text without its `[[...]]` marks. Answer and reference fields of a component are stored without marks, so grading compares
// plain text; display fields (a question, options, a source sentence, a translation, a hint) keep them for the web to emphasise.
export const stripTargetMarks = (raw: string): string => parseTargetSpans(raw).text;

// ---- Answer components ----

export const TUTOR_COMPONENT_KINDS = ["fill_in", "translate", "word_order", "article", "choice", "quick_review", "say_it", "dictation", "fix_mistake"] as const;
export const tutorComponentKindSchema = z.enum(TUTOR_COMPONENT_KINDS);
export type TutorComponentKind = z.infer<typeof tutorComponentKindSchema>;
// Deterministic kinds are graded by the server alone; open kinds compare with the reference and then ask the model for a verdict.
export const TUTOR_OPEN_KINDS: readonly TutorComponentKind[] = ["translate", "fix_mistake"];
export const TUTOR_ARTICLES = ["de", "het", "der", "die", "das"] as const;
export const tutorArticleSchema = z.enum(TUTOR_ARTICLES);
export type TutorArticle = z.infer<typeof tutorArticleSchema>;

const sentence = z.string().trim().min(1).max(TUTOR_SENTENCE_MAX);
const shortText = z.string().trim().min(1).max(TUTOR_SHORT_TEXT_MAX);
const optionalSentence = z.string().trim().max(TUTOR_SENTENCE_MAX).nullable().optional();
// A lesson word a component tests. The server checks it is in the published index of a lesson the learner can read; each graded
// answer writes a word review for it, and `record_word_review` accepts only words a component of the conversation tested.
export const tutorWordRefSchema = z.object({ lessonId: opaqueIdSchema, wordId: opaqueIdSchema });
export type TutorWordRef = z.infer<typeof tutorWordRefSchema>;
// A word hint (docs/ai-tutor.md#word-hints): a lesson word from the published index and the cue in the question it helps with,
// such as "tidy up". The server resolves the word's term, meaning, and forms when the component is created; the model never
// writes the hint's target-language text.
export const tutorHintRefSchema = z.object({ lessonId: opaqueIdSchema, wordId: opaqueIdSchema, cue: z.string().trim().min(1).max(TUTOR_HINT_CUE_MAX) });
export type TutorHintRef = z.infer<typeof tutorHintRefSchema>;
const hintsField = { hints: z.array(tutorHintRefSchema).max(TUTOR_HINTS_MAX).optional() };
// The kinds whose questions can carry hints; for the others a hint would give the answer away.
export const TUTOR_HINT_KINDS = ["fill_in", "translate", "word_order", "fix_mistake", "dictation"] as const;
export const tutorHintViewSchema = z.strictObject({
  lessonId: opaqueIdSchema, wordId: opaqueIdSchema, cue: z.string(), term: z.string(), meaning: z.string(), forms: z.string().nullable(),
});
export type TutorHintView = z.infer<typeof tutorHintViewSchema>;
const hintViews = { hints: z.array(tutorHintViewSchema).max(TUTOR_HINTS_MAX).optional() };
// The hint words the learner opened before answering, as word references; each must be one of the component's hints.
const hintsUsed = { hintsUsed: z.array(tutorWordRefSchema).max(TUTOR_HINTS_MAX).optional() };

// Every payload may name the lesson it practises (its attempts are stored under it; without one, a word's lesson is used, and
// a component with neither stores its answer only in the conversation) and the lesson words it tests.
const componentBase = {
  lessonId: opaqueIdSchema.nullable().optional(),
  words: z.array(tutorWordRefSchema).max(TUTOR_COMPONENT_WORDS_MAX).optional(),
};

// Full payloads, as the model sends them to an `ask_*` tool and as they are stored. They include the reference answer, so the web
// receives only the component's view (see `tutorComponentView`) until it is answered.
export const fillInPayloadSchema = z.object({
  ...componentBase, ...hintsField,
  // The sentence with one `…` per blank, as in lesson practices.
  prompt: sentence.refine((value) => countBlanks(value) >= 1 && countBlanks(value) <= 5, "Use one to five … blanks."),
  answers: z.array(shortText).min(1).max(5),
  translation: optionalSentence,
}).refine((value) => countBlanks(value.prompt) === value.answers.length, { message: "Give one answer per blank.", path: ["answers"] });
export const translatePayloadSchema = z.object({ ...componentBase, ...hintsField, source: sentence, reference: sentence });
export const wordOrderPayloadSchema = z.object({ ...componentBase, ...hintsField, chunks: z.array(z.string().trim().min(1).max(60)).min(2).max(12), translation: optionalSentence });
const DUTCH_ARTICLES: readonly TutorArticle[] = ["de", "het"];
export const articlePayloadSchema = z.object({
  ...componentBase,
  nouns: z.array(z.object({ noun: z.string().trim().min(1).max(80), article: tutorArticleSchema, meaning: z.string().trim().max(TUTOR_SHORT_TEXT_MAX).nullable().optional() }))
    .min(1).max(8),
}).refine((value) => value.nouns.every((noun) => DUTCH_ARTICLES.includes(noun.article)) || value.nouns.every((noun) => !DUTCH_ARTICLES.includes(noun.article)),
  { message: "Use Dutch (de, het) or German (der, die, das) articles, not both.", path: ["nouns"] });
export const choicePayloadSchema = z.object({
  ...componentBase,
  question: sentence,
  options: z.array(shortText).min(3).max(4),
  correct: z.number().int().min(0).max(3),
}).refine((value) => value.correct < value.options.length, { message: "The correct option must be one of the options.", path: ["correct"] })
  .refine((value) => new Set(value.options.map(normalizeAnswer)).size === value.options.length, { message: "Options must differ.", path: ["options"] });
export const quickReviewPayloadSchema = z.object({
  lessonId: componentBase.lessonId,
  cards: z.array(z.object({ lessonId: opaqueIdSchema, wordId: opaqueIdSchema, direction: wordDrillDirectionSchema })).min(1).max(TUTOR_COMPONENT_WORDS_MAX),
});
export const sayItPayloadSchema = z.object({ ...componentBase, sentence: z.string().trim().min(1).max(TUTOR_SPAN_MAX), translation: optionalSentence });
export const dictationPayloadSchema = z.object({ ...componentBase, ...hintsField, sentence: z.string().trim().min(1).max(TUTOR_SPAN_MAX), translation: optionalSentence });
export const fixMistakePayloadSchema = z.object({ ...componentBase, ...hintsField, sentence, reference: sentence, hint: optionalSentence });

export const tutorComponentPayloadSchemas = {
  fill_in: fillInPayloadSchema, translate: translatePayloadSchema, word_order: wordOrderPayloadSchema, article: articlePayloadSchema,
  choice: choicePayloadSchema, quick_review: quickReviewPayloadSchema, say_it: sayItPayloadSchema, dictation: dictationPayloadSchema,
  fix_mistake: fixMistakePayloadSchema,
} as const;
export type TutorComponentPayloads = { [K in TutorComponentKind]: z.output<(typeof tutorComponentPayloadSchemas)[K]> };
export type TutorComponent = { [K in TutorComponentKind]: { kind: K; payload: TutorComponentPayloads[K] } }[TutorComponentKind];
export const tutorComponentSchema: z.ZodType<TutorComponent> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fill_in"), payload: fillInPayloadSchema }),
  z.object({ kind: z.literal("translate"), payload: translatePayloadSchema }),
  z.object({ kind: z.literal("word_order"), payload: wordOrderPayloadSchema }),
  z.object({ kind: z.literal("article"), payload: articlePayloadSchema }),
  z.object({ kind: z.literal("choice"), payload: choicePayloadSchema }),
  z.object({ kind: z.literal("quick_review"), payload: quickReviewPayloadSchema }),
  z.object({ kind: z.literal("say_it"), payload: sayItPayloadSchema }),
  z.object({ kind: z.literal("dictation"), payload: dictationPayloadSchema }),
  z.object({ kind: z.literal("fix_mistake"), payload: fixMistakePayloadSchema }),
]) as z.ZodType<TutorComponent>;

// The lesson words a component tests: its `words`, or a quick review's cards.
export function componentWords(component: TutorComponent): TutorWordRef[] {
  if (component.kind === "quick_review") return component.payload.cards.map(({ lessonId, wordId }) => ({ lessonId, wordId }));
  return component.payload.words ?? [];
}

// ---- Views: what the web renders before an answer ----

// A quick review card with its word, resolved by the server from the published index when the component is created.
export const quickReviewCardViewSchema = z.strictObject({
  lessonId: opaqueIdSchema, wordId: opaqueIdSchema, direction: wordDrillDirectionSchema,
  term: z.string(), meaning: z.string(), forms: z.string().nullable(), example: z.string().nullable(),
});
export type QuickReviewCardView = z.infer<typeof quickReviewCardViewSchema>;
export const tutorComponentViewSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fill_in"), prompt: z.string(), blanks: z.number().int().positive(), translation: z.string().nullable(), ...hintViews }),
  z.strictObject({ kind: z.literal("translate"), source: z.string(), ...hintViews }),
  // Chunks in the shuffled order the learner starts from.
  z.strictObject({ kind: z.literal("word_order"), chunks: z.array(z.string()), translation: z.string().nullable(), ...hintViews }),
  z.strictObject({ kind: z.literal("article"), options: z.array(tutorArticleSchema), nouns: z.array(z.strictObject({ noun: z.string(), meaning: z.string().nullable() })) }),
  z.strictObject({ kind: z.literal("choice"), question: z.string(), options: z.array(z.string()) }),
  z.strictObject({ kind: z.literal("quick_review"), cards: z.array(quickReviewCardViewSchema) }),
  z.strictObject({ kind: z.literal("say_it"), sentence: z.string(), translation: z.string().nullable() }),
  // Audio only: the sentence is never part of the view.
  z.strictObject({ kind: z.literal("dictation"), translation: z.string().nullable(), ...hintViews }),
  z.strictObject({ kind: z.literal("fix_mistake"), sentence: z.string(), hint: z.string().nullable(), ...hintViews }),
]);
export type TutorComponentView = z.infer<typeof tutorComponentViewSchema>;

// Fisher–Yates with the given random source; never returns the solved order when another order exists.
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [copy[index], copy[other]] = [copy[other]!, copy[index]!];
    }
    if (copy.some((item, index) => item !== items[index])) return copy;
  }
  return [...items].reverse();
}

/**
 * The view of a component: the payload without its reference answer. A quick review needs its cards' words, which the server
 * resolves; `random` shuffles word order chunks once, when the component is created, and the view is stored with it.
 */
export function tutorComponentView(component: TutorComponent, options: { cards?: QuickReviewCardView[]; hints?: TutorHintView[]; random?: () => number } = {}): TutorComponentView {
  const random = options.random ?? Math.random;
  // Resolved hints, only for kinds that take them; none leaves the field out, so older views stay as they were.
  const hints = options.hints?.length && (TUTOR_HINT_KINDS as readonly string[]).includes(component.kind) ? { hints: options.hints } : {};
  switch (component.kind) {
    case "fill_in": return { kind: "fill_in", prompt: component.payload.prompt, blanks: component.payload.answers.length, translation: component.payload.translation ?? null, ...hints };
    case "translate": return { kind: "translate", source: component.payload.source, ...hints };
    case "word_order": return { kind: "word_order", chunks: shuffled(component.payload.chunks, random), translation: component.payload.translation ?? null, ...hints };
    case "article": {
      const dutch = component.payload.nouns.every((noun) => DUTCH_ARTICLES.includes(noun.article));
      return { kind: "article", options: dutch ? ["de", "het"] : ["der", "die", "das"], nouns: component.payload.nouns.map((noun) => ({ noun: noun.noun, meaning: noun.meaning ?? null })) };
    }
    case "choice": return { kind: "choice", question: component.payload.question, options: component.payload.options };
    case "quick_review": return { kind: "quick_review", cards: options.cards ?? [] };
    case "say_it": return { kind: "say_it", sentence: component.payload.sentence, translation: component.payload.translation ?? null };
    case "dictation": return { kind: "dictation", translation: component.payload.translation ?? null, ...hints };
    case "fix_mistake": return { kind: "fix_mistake", sentence: component.payload.sentence, hint: component.payload.hint ?? null, ...hints };
  }
}

// A component's hint references (empty for kinds without hints).
export function componentHints(component: TutorComponent): TutorHintRef[] {
  return "hints" in component.payload ? component.payload.hints ?? [] : [];
}

// The hint words an answer says the learner opened (empty for kinds without hints).
export function answerHintsUsed(answer: TutorComponentAnswer): TutorWordRef[] {
  return "hintsUsed" in answer ? answer.hintsUsed ?? [] : [];
}

// ---- Answers ----

const typedAnswer = z.string().max(1_000).refine((value) => value.trim().length > 0, { message: "Type an answer." });
export const tutorComponentAnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fill_in"), blanks: z.array(z.string().max(TUTOR_SHORT_TEXT_MAX)).min(1).max(5), ...hintsUsed }),
  z.strictObject({ kind: z.literal("translate"), text: typedAnswer, ...hintsUsed }),
  z.strictObject({ kind: z.literal("word_order"), chunks: z.array(z.string().max(60)).min(2).max(12), ...hintsUsed }),
  z.strictObject({ kind: z.literal("article"), articles: z.array(tutorArticleSchema).min(1).max(8) }),
  z.strictObject({ kind: z.literal("choice"), choice: z.number().int().min(0).max(3) }),
  z.strictObject({ kind: z.literal("quick_review"), results: z.array(wordDrillResultSchema).min(1).max(TUTOR_COMPONENT_WORDS_MAX) }),
  z.strictObject({ kind: z.literal("say_it"), scores: pronunciationScoresSchema }),
  z.strictObject({ kind: z.literal("dictation"), text: typedAnswer, ...hintsUsed }),
  z.strictObject({ kind: z.literal("fix_mistake"), text: typedAnswer, ...hintsUsed }),
]);
export type TutorComponentAnswer = z.infer<typeof tutorComponentAnswerSchema>;

// ---- Grades ----

// `matched` is the server's comparison (null for self-graded and scored kinds); `verdict` and `note` are the model's judgement of
// an open answer that did not match; `items` break the answer down (blanks, nouns, dictation words, review cards); `score` is Say
// it's overall pronunciation score. `reference` reveals the expected answer once the component is answered.
export const tutorGradeItemSchema = z.strictObject({ expected: z.string(), given: z.string(), ok: z.boolean() });
export const tutorGradeSchema = z.strictObject({
  correct: z.boolean(),
  matched: z.boolean().nullable(),
  verdict: practiceAttemptVerdictSchema.nullable(),
  note: z.string().max(TUTOR_NOTE_MAX).nullable(),
  reference: z.string().nullable(),
  items: z.array(tutorGradeItemSchema).max(50),
  score: z.number().min(0).max(100).nullable(),
});
export type TutorGrade = z.infer<typeof tutorGradeSchema>;

export type TutorGradeOutcome =
  | { ok: true; grade: TutorGrade; needsVerdict: boolean }
  | { ok: false; error: "ANSWER_INVALID" };

const grade = (fields: Partial<TutorGrade> & Pick<TutorGrade, "correct">): TutorGrade =>
  ({ matched: null, verdict: null, note: null, reference: null, items: [], score: null, ...fields });
const invalid = { ok: false, error: "ANSWER_INVALID" } as const;
const sameMultiset = (left: readonly string[], right: readonly string[]) => {
  const sort = (values: readonly string[]) => values.map((value) => value.trim()).sort().join("\u0000");
  return left.length === right.length && sort(left) === sort(right);
};

/**
 * Grades an answer without the model. Deterministic kinds are final. An open kind (translate, fix the mistake) that matches its
 * reference is accepted; otherwise `needsVerdict` asks the caller to take the model's verdict with `applyVerdict`. An answer that
 * does not fit the component (another kind, a wrong number of blanks or nouns, chunks that are not the view's) is `ANSWER_INVALID`.
 * `view` is the stored view, used to check word order chunks.
 */
export function gradeTutorAnswer(component: TutorComponent, answer: TutorComponentAnswer, view?: TutorComponentView): TutorGradeOutcome {
  if (component.kind !== answer.kind) return invalid;
  // Opened hints must be the component's own; they never change the grade.
  const offered = new Set(componentHints(component).map((hint) => `${hint.lessonId}:${hint.wordId}`));
  if (answerHintsUsed(answer).some((ref) => !offered.has(`${ref.lessonId}:${ref.wordId}`))) return invalid;
  switch (component.kind) {
    case "fill_in": {
      const { blanks } = answer as Extract<TutorComponentAnswer, { kind: "fill_in" }>;
      const expected = component.payload.answers;
      if (blanks.length !== expected.length) return invalid;
      const items = expected.map((entry, index) => ({ expected: entry, given: blanks[index]!, ok: blankMatches(entry, blanks[index]!) }));
      const correct = items.every((item) => item.ok);
      return { ok: true, needsVerdict: false, grade: grade({ correct, matched: correct, reference: expected.join(" · "), items }) };
    }
    case "translate":
    case "fix_mistake": {
      const { text } = answer as Extract<TutorComponentAnswer, { kind: "translate" | "fix_mistake" }>;
      const reference = component.payload.reference;
      const matched = normalizeAnswer(text) === normalizeAnswer(reference);
      return { ok: true, needsVerdict: !matched, grade: grade({ correct: matched, matched, reference }) };
    }
    case "word_order": {
      const { chunks } = answer as Extract<TutorComponentAnswer, { kind: "word_order" }>;
      const expected = component.payload.chunks;
      const offered = view?.kind === "word_order" ? view.chunks : expected;
      if (!sameMultiset(chunks, offered)) return invalid;
      const reference = expected.join(" ");
      const correct = normalizeAnswer(chunks.join(" ")) === normalizeAnswer(reference);
      return { ok: true, needsVerdict: false, grade: grade({ correct, matched: correct, reference }) };
    }
    case "article": {
      const { articles } = answer as Extract<TutorComponentAnswer, { kind: "article" }>;
      const nouns = component.payload.nouns;
      if (articles.length !== nouns.length) return invalid;
      const items = nouns.map((noun, index) => ({ expected: `${noun.article} ${noun.noun}`, given: `${articles[index]} ${noun.noun}`, ok: articles[index] === noun.article }));
      const correct = items.every((item) => item.ok);
      return { ok: true, needsVerdict: false, grade: grade({ correct, matched: correct, reference: items.map((item) => item.expected).join(", "), items }) };
    }
    case "choice": {
      const { choice } = answer as Extract<TutorComponentAnswer, { kind: "choice" }>;
      const { options, correct: right } = component.payload;
      if (choice >= options.length) return invalid;
      const correct = choice === right;
      return { ok: true, needsVerdict: false, grade: grade({ correct, matched: correct, reference: options[right]!, items: [{ expected: options[right]!, given: options[choice]!, ok: correct }] }) };
    }
    case "quick_review": {
      const { results } = answer as Extract<TutorComponentAnswer, { kind: "quick_review" }>;
      const cards = component.payload.cards;
      if (results.length !== cards.length) return invalid;
      const items = cards.map((card, index) => ({ expected: card.wordId, given: results[index]!, ok: results[index] === "got" }));
      return { ok: true, needsVerdict: false, grade: grade({ correct: items.every((item) => item.ok), items }) };
    }
    case "say_it": {
      const { scores } = answer as Extract<TutorComponentAnswer, { kind: "say_it" }>;
      const items = scores.words.map((word) => ({ expected: word.word, given: word.error, ok: word.error === "none" }));
      return { ok: true, needsVerdict: false, grade: grade({ correct: scores.overall >= TUTOR_SAY_IT_PASS_SCORE, score: scores.overall, reference: component.payload.sentence, items }) };
    }
    case "dictation": {
      const { text } = answer as Extract<TutorComponentAnswer, { kind: "dictation" }>;
      const expected = normalizeAnswer(component.payload.sentence).split(" ").filter(Boolean);
      const given = normalizeAnswer(text).split(" ").filter(Boolean);
      const items = expected.map((word, index) => ({ expected: word, given: given[index] ?? "", ok: given[index] === word }));
      for (const extra of given.slice(expected.length)) items.push({ expected: "", given: extra, ok: false });
      const correct = items.every((item) => item.ok);
      return { ok: true, needsVerdict: false, grade: grade({ correct, matched: correct, reference: component.payload.sentence, items }) };
    }
  }
}

/** Takes the model's verdict on an open answer that did not match its reference. */
export function applyVerdict(graded: TutorGrade, verdict: z.infer<typeof practiceAttemptVerdictSchema> | null, note: string | null): TutorGrade {
  return { ...graded, verdict, note: note ? note.slice(0, TUTOR_NOTE_MAX) : null, correct: graded.matched === true || verdict === "acceptable" };
}

/**
 * The practice attempt text of an answered component: prompt, answer, and reference. Quick review and Say it write no practice
 * attempt (they write word reviews and a pronunciation attempt), so they return null.
 */
export function componentAttemptText(component: TutorComponent, answer: TutorComponentAnswer): { prompt: string; answer: string; reference: string } | null {
  switch (component.kind) {
    case "fill_in": return { prompt: component.payload.prompt, answer: answer.kind === "fill_in" ? answer.blanks.join(" · ") : "", reference: component.payload.answers.join(" · ") };
    case "translate": return { prompt: component.payload.source, answer: answer.kind === "translate" ? answer.text : "", reference: component.payload.reference };
    case "word_order": return { prompt: component.payload.translation ?? component.payload.chunks.join(" / "), answer: answer.kind === "word_order" ? answer.chunks.join(" ") : "", reference: component.payload.chunks.join(" ") };
    case "article": return {
      prompt: component.payload.nouns.map((noun) => noun.noun).join(", "),
      answer: answer.kind === "article" ? component.payload.nouns.map((noun, index) => `${answer.articles[index] ?? ""} ${noun.noun}`).join(", ") : "",
      reference: component.payload.nouns.map((noun) => `${noun.article} ${noun.noun}`).join(", "),
    };
    case "choice": return {
      prompt: component.payload.question, answer: answer.kind === "choice" ? component.payload.options[answer.choice] ?? "" : "",
      reference: component.payload.options[component.payload.correct]!,
    };
    case "dictation": return { prompt: component.payload.translation ?? "Dictation", answer: answer.kind === "dictation" ? answer.text : "", reference: component.payload.sentence };
    case "fix_mistake": return { prompt: component.payload.sentence, answer: answer.kind === "fix_mistake" ? answer.text : "", reference: component.payload.reference };
    case "quick_review":
    case "say_it": return null;
  }
}

// The review direction a graded component records for the words it tests: choosing a meaning is understanding, every other kind
// produces the target language. Quick review cards carry their own direction; Say it records no review.
export const componentReviewDirection = (kind: TutorComponentKind) => kind === "choice" ? "understand" as const : "produce" as const;

// ---- AI practices (C14h) ----

// The component kinds an AI practice can have; the payloads are the tutor's (docs/courses.md#ai-practices).
export const AI_PRACTICE_KINDS = ["fill_in", "translate", "word_order", "article", "choice", "dictation", "fix_mistake"] as const;
export const aiPracticeKindSchema = z.enum(AI_PRACTICE_KINDS);
export type AiPracticeKind = z.infer<typeof aiPracticeKindSchema>;
export type AiPracticeContent = Extract<TutorComponent, { kind: AiPracticeKind }>;
export const aiPracticeContentSchema = tutorComponentSchema.refine(
  (value): value is AiPracticeContent => (AI_PRACTICE_KINDS as readonly string[]).includes(value.kind), { message: "This kind cannot be saved as a practice." },
) as unknown as z.ZodType<AiPracticeContent>;
export const AI_PRACTICE_LESSONS_MAX = 5;
// The tutor's `save_ai_practice` arguments: the practice and the lessons it is tagged to, each after a block of the published document.
export const saveAiPracticeArgsSchema = z.object({
  practice: aiPracticeContentSchema,
  lessons: z.array(z.object({ lessonId: opaqueIdSchema, afterBlockId: opaqueIdSchema })).min(1).max(AI_PRACTICE_LESSONS_MAX),
});
export type SaveAiPracticeArgs = z.infer<typeof saveAiPracticeArgsSchema>;

// The lesson page's read of a lesson's AI practices (`GET .../lessons/:lessonId/ai-practices`), in reading order: each practice's
// view, never its reference answer. `afterBlockId` is the block of the published document the practice follows, or null when its
// anchor is no longer in the document and it is shown at the end of the lesson. `canRemove` is true for the course owner and
// active contributors while the course is not archived.
export const lessonAiPracticeSchema = z.strictObject({
  id: opaqueIdSchema, kind: aiPracticeKindSchema, afterBlockId: opaqueIdSchema.nullable(), view: tutorComponentViewSchema, createdAt: z.number().int(),
});
export type LessonAiPractice = z.infer<typeof lessonAiPracticeSchema>;
export const lessonAiPracticesResponseSchema = z.strictObject({ practices: z.array(lessonAiPracticeSchema), canRemove: z.boolean() });
export type LessonAiPracticesResponse = z.infer<typeof lessonAiPracticesResponseSchema>;
// `POST .../ai-practices/:practiceId/answer`: the answer schema of the practice's kind. The response's grade reveals the reference;
// `recorded` is false when nothing was stored (an archived course).
export const aiPracticeAnswerRequestSchema = z.strictObject({ answer: tutorComponentAnswerSchema });
export type AiPracticeAnswerRequest = z.input<typeof aiPracticeAnswerRequestSchema>;
export const aiPracticeAnswerResponseSchema = z.strictObject({ grade: tutorGradeSchema, recorded: z.boolean() });
export type AiPracticeAnswerResponse = z.infer<typeof aiPracticeAnswerResponseSchema>;

// ---- Message parts ----

export const tutorConfirmationActionSchema = z.enum(["complete_lesson", "reset_lesson", "save_ai_practice"]);
export type TutorConfirmationAction = z.infer<typeof tutorConfirmationActionSchema>;
const titledRef = z.strictObject({ id: opaqueIdSchema, title: z.string() });
// What a confirmation card says will happen. A reset names what it deletes (counts are the learner's rows at the time of asking).
export const tutorConfirmationSummarySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("complete_lesson"), course: titledRef, lesson: titledRef }),
  z.strictObject({
    action: z.literal("reset_lesson"), course: titledRef, lesson: titledRef,
    deletes: z.strictObject({
      position: z.boolean(), completion: z.boolean(), practiceProgress: z.number().int().nonnegative(),
      attempts: z.number().int().nonnegative(), reviews: z.number().int().nonnegative(),
    }),
  }),
  z.strictObject({
    action: z.literal("save_ai_practice"), view: tutorComponentViewSchema,
    lessons: z.array(z.strictObject({ course: titledRef, lesson: titledRef, afterBlockId: opaqueIdSchema })).min(1).max(AI_PRACTICE_LESSONS_MAX),
  }),
]);
export type TutorConfirmationSummary = z.infer<typeof tutorConfirmationSummarySchema>;
export const tutorConfirmationOutcomeSchema = z.strictObject({ ok: z.boolean(), error: z.string().nullable() });

// A tool result's detail for its step chip: a few plain values (counts, titles, IDs), never lesson content.
export const tutorToolDetailSchema = z.record(z.string(), z.union([z.string().max(TUTOR_SHORT_TEXT_MAX), z.number(), z.boolean(), z.null()]));
export type TutorToolDetail = z.infer<typeof tutorToolDetailSchema>;

const textPart = z.strictObject({ type: z.literal("text"), text: z.string(), spans: z.array(tutorSpanSchema) });
const toolCallPart = z.strictObject({ type: z.literal("tool_call"), toolCallId: opaqueIdSchema, name: z.string(), arguments: z.record(z.string(), z.unknown()) });
const errorPart = z.strictObject({ type: z.literal("error"), code: z.string(), message: z.string() });
const answeredFields = { answeredAt: z.number().int().nullable() };
const publicToolResultPart = z.strictObject({
  type: z.literal("tool_result"), toolCallId: opaqueIdSchema, name: z.string(), ok: z.boolean(), error: z.string().nullable(), detail: tutorToolDetailSchema,
});
const publicComponentPart = z.strictObject({
  type: z.literal("component"), toolCallId: opaqueIdSchema, kind: tutorComponentKindSchema, view: tutorComponentViewSchema,
  answer: tutorComponentAnswerSchema.nullable(), grade: tutorGradeSchema.nullable(), ...answeredFields,
  // A skipped component is answered without an answer or grade: nothing was recorded, and the model was told.
  skipped: z.boolean().optional(),
});
const publicConfirmationPart = z.strictObject({
  type: z.literal("confirmation"), toolCallId: opaqueIdSchema, summary: tutorConfirmationSummarySchema,
  answer: z.enum(["confirmed", "cancelled"]).nullable(), outcome: tutorConfirmationOutcomeSchema.nullable(), ...answeredFields,
});
// The parts the API returns. Tool results leave out the data the model received, components their reference payload,
// confirmations their stored arguments, and `ask_*` tool calls their arguments (see `toPublicPart`).
export const tutorPartSchema = z.discriminatedUnion("type", [textPart, toolCallPart, publicToolResultPart, publicComponentPart, publicConfirmationPart, errorPart]);
export type TutorPart = z.infer<typeof tutorPartSchema>;
// The parts as stored in `ai_messages.parts`.
export const tutorStoredPartSchema = z.discriminatedUnion("type", [
  textPart, toolCallPart, errorPart,
  publicToolResultPart.extend({ content: z.string() }),
  publicComponentPart.extend({ component: tutorComponentSchema, skipReason: z.string().max(TUTOR_MESSAGE_TEXT_MAX).optional() }),
  publicConfirmationPart.extend({ arguments: z.record(z.string(), z.unknown()) }),
]);
export type TutorStoredPart = z.infer<typeof tutorStoredPartSchema>;

export function toPublicPart(part: TutorStoredPart): TutorPart {
  switch (part.type) {
    // An `ask_*` call's arguments are the component's full payload, reference answer included.
    case "tool_call": return part.name.startsWith("ask_") ? { ...part, arguments: {} } : part;
    case "tool_result": { const { content: _content, ...rest } = part; return rest; }
    case "component": { const { component: _component, skipReason: _skipReason, ...rest } = part; return rest; }
    case "confirmation": { const { arguments: _arguments, ...rest } = part; return rest; }
    default: return part;
  }
}

// The target-language spans of a message in order across its text parts; a speech request names one by its index here.
export function messageSpanTexts(parts: readonly (TutorPart | TutorStoredPart)[]): string[] {
  return parts.flatMap((part) => part.type === "text" ? part.spans.map((span) => part.text.slice(span.start, span.end)) : []);
}

// ---- Conversations and messages ----

export const tutorMessageRoleSchema = z.enum(["user", "assistant"]);
export const tutorMessageStatusSchema = z.enum(["complete", "awaiting_user", "error"]);
export type TutorMessageStatus = z.infer<typeof tutorMessageStatusSchema>;
export const tutorMessageSchema = z.strictObject({
  id: opaqueIdSchema, conversationId: opaqueIdSchema, role: tutorMessageRoleSchema, status: tutorMessageStatusSchema,
  parts: z.array(tutorPartSchema), provider: aiProviderSchema.nullable(), model: z.string().nullable(), createdAt: z.number().int(),
});
export type TutorMessage = z.infer<typeof tutorMessageSchema>;
// Newest first; `nextCursor` reads older messages.
export const tutorMessagePageSchema = z.strictObject({ items: z.array(tutorMessageSchema), nextCursor: z.string().nullable() });
export type TutorMessagePage = z.infer<typeof tutorMessagePageSchema>;

// An empty title is a conversation without a user message yet. `provider` is the learner's choice of model for the
// conversation's turns (one of the enabled providers); `null` follows the superuser's order.
// Who set a conversation's title (docs/ai-tutor.md#conversation-titles): `auto` is the first user message, `tutor` a title the
// tutor chose, and `user` one the learner typed, which the tutor never replaces.
export const TUTOR_TITLE_SOURCES = ["auto", "tutor", "user"] as const;
export const tutorTitleSourceSchema = z.enum(TUTOR_TITLE_SOURCES);
export type TutorTitleSource = z.infer<typeof tutorTitleSourceSchema>;
export const tutorConversationSchema = z.strictObject({
  id: opaqueIdSchema, title: z.string().max(TUTOR_TITLE_MAX), titleSource: tutorTitleSourceSchema, archivedAt: z.number().int().nullable(),
  provider: aiProviderSchema.nullable(), createdAt: z.number().int(), updatedAt: z.number().int(),
  // Tokens in and out of every model request made for the conversation (docs/ai-tutor.md#usage-box).
  tokens: z.number().int().nonnegative(),
});
export type TutorConversation = z.infer<typeof tutorConversationSchema>;
export const tutorConversationResponseSchema = z.strictObject({ conversation: tutorConversationSchema });
export const tutorConversationPageSchema = z.strictObject({ items: z.array(tutorConversationSchema), nextCursor: z.string().nullable() });
export type TutorConversationPage = z.infer<typeof tutorConversationPageSchema>;
export const tutorConversationsQuerySchema = z.object({
  archived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  cursor: z.string().min(1).max(500).optional(),
});
export const tutorMessagesQuerySchema = z.object({ cursor: z.string().min(1).max(500).optional() });
// A title the learner types: one line, trimmed, 1–80 characters.
export const tutorTitleInputSchema = z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().min(1).max(TUTOR_TITLE_MAX));
// Changes the conversation's model, its title, or both; at least one is required.
export const updateTutorConversationRequestSchema = z.strictObject({ provider: aiProviderSchema.nullable().optional(), title: tutorTitleInputSchema.optional() })
  .refine((value) => value.provider !== undefined || value.title !== undefined, { message: "Change the model or the title." });
export type UpdateTutorConversationRequest = z.input<typeof updateTutorConversationRequestSchema>;

// The learner's own tutor usage (docs/ai-tutor.md#usage-box): today's (UTC) tokens and turns across every conversation, and,
// with `conversationId`, that conversation's tokens over its whole life. Counts only; never another account's.
export const tutorUsageQuerySchema = z.object({ conversationId: opaqueIdSchema.optional() });
export const tutorTokenCountSchema = z.strictObject({ tokensIn: z.number().int().nonnegative(), tokensOut: z.number().int().nonnegative() });
export type TutorTokenCount = z.infer<typeof tutorTokenCountSchema>;
export const tutorUsageResponseSchema = z.strictObject({
  today: tutorTokenCountSchema.extend({ turns: z.number().int().nonnegative(), turnCap: z.number().int().nonnegative(), resetsAt: z.number().int() }),
  conversation: tutorTokenCountSchema.nullable(),
});
export type TutorUsage = z.infer<typeof tutorUsageResponseSchema>;

// The models a learner can choose for a conversation: the enabled providers that the API can reach, in the superuser's order
// (the first one is the default).
export const tutorModelOptionSchema = z.strictObject({ provider: aiProviderSchema, model: z.string() });
export type TutorModelOption = z.infer<typeof tutorModelOptionSchema>;
export const tutorModelsResponseSchema = z.strictObject({ items: z.array(tutorModelOptionSchema) });

// The title of a conversation: its first user message on one line, cut to 80 characters.
export const conversationTitle = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, TUTOR_TITLE_MAX).trim();

// ---- Requests ----

// A user message is plain text; line breaks are kept and the ends are trimmed.
export const tutorMessageRequestSchema = z.strictObject({ text: z.string().trim().min(1).max(TUTOR_MESSAGE_TEXT_MAX) });
export type TutorMessageRequest = z.input<typeof tutorMessageRequestSchema>;
// Answers a component or a confirmation card, once. `{ type: "component", skip: true }` declines a waiting component: it counts
// as its one answer, records nothing, and the turn resumes with the model told the learner skipped it.
export const tutorRespondRequestSchema = z.union([
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("component"), answer: tutorComponentAnswerSchema }),
    z.strictObject({ type: z.literal("confirmation"), confirmed: z.boolean() }),
  ]),
  z.strictObject({ type: z.literal("component"), skip: z.literal(true) }),
]);
export type TutorRespondRequest = z.input<typeof tutorRespondRequestSchema>;
// Answers every open question of one message's practice set together (docs/ai-tutor.md#practice-sets): each one's answer or a
// skip, once per tool call ID. They are graded and stored together and the turn resumes once, with every grade.
export const TUTOR_SET_ANSWERS_MAX = 10;
export const tutorSetAnswerSchema = z.union([
  z.strictObject({ toolCallId: opaqueIdSchema, answer: tutorComponentAnswerSchema }),
  z.strictObject({ toolCallId: opaqueIdSchema, skip: z.literal(true) }),
]);
export type TutorSetAnswer = z.input<typeof tutorSetAnswerSchema>;
export const tutorSetAnswersRequestSchema = z.strictObject({ answers: z.array(tutorSetAnswerSchema).min(1).max(TUTOR_SET_ANSWERS_MAX) })
  .refine((value) => new Set(value.answers.map((entry) => entry.toolCallId)).size === value.answers.length, { message: "Answer each question once." });
export type TutorSetAnswersRequest = z.input<typeof tutorSetAnswersRequestSchema>;
export const tutorSkipSetRequestSchema = z.strictObject({ reason: z.string().trim().min(1).max(TUTOR_MESSAGE_TEXT_MAX) });
// On-demand audio of a stored assistant message: a target-language span by index, or the sentence of a Say it or Dictation component.
export const tutorSpeechRequestSchema = z.union([
  z.strictObject({ spanIndex: z.number().int().nonnegative().max(1_000) }),
  z.strictObject({ toolCallId: opaqueIdSchema }),
]);
export type TutorSpeechRequest = z.input<typeof tutorSpeechRequestSchema>;
export const tutorSpeechResponseSchema = z.strictObject({ url: z.string() });
// `202`: another request is synthesizing the clip; retry after a second, at most five times.
export const tutorSpeechPendingSchema = z.strictObject({ status: z.literal("pending") });

// ---- Streamed turn ----

// `POST .../messages` and `POST .../tool-calls/:toolCallId/respond` answer with `text/event-stream`. Each event's name is its
// `type` and its data is the JSON object. Order: `user_message` (a new message only) or `answered` (a respond only), `start`, then
// `text` deltas, `tool_call` and `tool_result` steps, at most one `component` or `confirmation` (the turn then waits), an
// `error` when the turn failed, and always `done` with the stored assistant message last. A new text part begins after each step.
export const tutorStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("user_message"), message: tutorMessageSchema }),
  z.strictObject({ type: z.literal("answered"), messageId: opaqueIdSchema, part: z.union([publicComponentPart, publicConfirmationPart]) }),
  z.strictObject({ type: z.literal("start"), messageId: opaqueIdSchema }),
  z.strictObject({ type: z.literal("text"), delta: z.string() }),
  z.strictObject({ type: z.literal("tool_call"), part: toolCallPart }),
  z.strictObject({ type: z.literal("tool_result"), part: publicToolResultPart }),
  z.strictObject({ type: z.literal("component"), part: publicComponentPart }),
  z.strictObject({ type: z.literal("confirmation"), part: publicConfirmationPart }),
  z.strictObject({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.strictObject({ type: z.literal("done"), message: tutorMessageSchema }),
]);
export type TutorStreamEvent = z.infer<typeof tutorStreamEventSchema>;

// Error codes of the tutor routes, besides the provider layer's (`AI_DAILY_LIMIT`, `SPEECH_DAILY_LIMIT`, `AI_UNAVAILABLE`,
// `AI_REQUEST_FAILED`) and the common ones.
export const TUTOR_ERROR_CODES = [
  "CONVERSATION_NOT_FOUND", "CONVERSATION_ARCHIVED", "TURN_IN_PROGRESS", "TOOL_CALL_NOT_FOUND", "TOOL_CALL_ANSWERED", "ANSWER_INVALID",
  "MESSAGE_NOT_FOUND", "SPAN_NOT_FOUND", "SPAN_TOO_LONG", "SPEECH_UNAVAILABLE", "SPEECH_FAILED", "TURN_LIMIT",
] as const;

// ---- Tutor profile ----

export const TUTOR_NATIVE_LANGUAGES = ["en", "nl", "de", "fr", "es", "it", "pt", "pl", "tr", "ru", "uk", "ar", "fa", "zh", "ja", "hi"] as const;
export const tutorNativeLanguageSchema = z.enum(TUTOR_NATIVE_LANGUAGES);
// How much of its own text the tutor writes in the library language: none (the native language), mostly, or mixed.
export const tutorReplyLanguageSchema = z.enum(["native", "target", "mixed"]);
export const tutorProfileSchema = z.strictObject({
  nativeLanguage: tutorNativeLanguageSchema, replyLanguage: tutorReplyLanguageSchema,
  goals: z.string().max(TUTOR_GOALS_MAX).nullable(), notes: z.string().max(TUTOR_NOTES_MAX).nullable(),
  // Null until the profile is first saved; a missing profile reads as the defaults.
  updatedAt: z.number().int().nullable(),
});
export type TutorProfile = z.infer<typeof tutorProfileSchema>;
export const DEFAULT_TUTOR_PROFILE: TutorProfile = { nativeLanguage: "en", replyLanguage: "native", goals: null, notes: null, updatedAt: null };
// The learner edits these; tutor notes are written by the tutor and only cleared by the learner. Empty goals mean none.
export const updateTutorProfileRequestSchema = z.strictObject({
  nativeLanguage: tutorNativeLanguageSchema, replyLanguage: tutorReplyLanguageSchema,
  goals: z.string().trim().max(TUTOR_GOALS_MAX).nullable().transform((value) => value || null),
});
export type UpdateTutorProfileRequest = z.input<typeof updateTutorProfileRequestSchema>;
export const tutorProfileResponseSchema = z.strictObject({ profile: tutorProfileSchema });
