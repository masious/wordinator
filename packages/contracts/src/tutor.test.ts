import { describe, expect, it } from "vitest";
import {
  aiPracticeAnswerRequestSchema, aiPracticeAnswerResponseSchema, aiPracticeContentSchema, applyVerdict, lessonAiPracticesResponseSchema, componentAttemptText, gradeTutorAnswer, messageSpanTexts, parseTargetSpans, saveAiPracticeArgsSchema,
  toPublicPart, tutorComponentAnswerSchema, tutorComponentPayloadSchemas, tutorComponentView, tutorMessageRequestSchema, tutorProfileSchema,
  tutorRespondRequestSchema, tutorSpeechRequestSchema, tutorStoredPartSchema, tutorStreamEventSchema, updateTutorProfileRequestSchema,
  type TutorComponent, type TutorComponentAnswer, type TutorStoredPart,
} from "./tutor";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const component = <K extends TutorComponent["kind"]>(kind: K, payload: unknown) =>
  ({ kind, payload: tutorComponentPayloadSchemas[kind].parse(payload) }) as Extract<TutorComponent, { kind: K }>;
const grade = (value: TutorComponent, answer: TutorComponentAnswer) => {
  const outcome = gradeTutorAnswer(value, answer, tutorComponentView(value, { random: () => 0 }));
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
};

describe("target-language spans", () => {
  it("parses marks into offsets of the unmarked text", () => {
    const parsed = parseTargetSpans("Say [[Goedemorgen!]] or [[ hoi ]].");
    expect(parsed.text).toBe("Say Goedemorgen! or  hoi .");
    expect(parsed.spans.map((span) => parsed.text.slice(span.start, span.end))).toEqual(["Goedemorgen!", "hoi"]);
  });

  it("keeps unclosed, empty, and nested marks as text", () => {
    expect(parseTargetSpans("a [[b")).toEqual({ text: "a [[b", spans: [] });
    expect(parseTargetSpans("[[]] x")).toEqual({ text: " x", spans: [] });
    const nested = parseTargetSpans("[[a [[b]] c");
    expect(nested.text).toBe("[[a b c");
    expect(nested.text.slice(nested.spans[0]!.start, nested.spans[0]!.end)).toBe("b");
  });

  it("numbers spans across a message's text parts", () => {
    const parts: TutorStoredPart[] = [
      { type: "text", ...parseTargetSpans("[[een]] en [[twee]]") },
      { type: "tool_call", toolCallId: id(1), name: "get_lesson", arguments: {} },
      { type: "text", ...parseTargetSpans("[[drie]]") },
    ];
    expect(messageSpanTexts(parts)).toEqual(["een", "twee", "drie"]);
  });
});

describe("deterministic grading", () => {
  it("fill in: every blank must match, ignoring case and punctuation", () => {
    const fill = component("fill_in", { prompt: "Ik … in … .", answers: ["woon", "Utrecht"] });
    expect(grade(fill, { kind: "fill_in", blanks: ["woon", "utrecht!"] }).grade).toMatchObject({ correct: true, matched: true, reference: "woon · Utrecht" });
    const miss = grade(fill, { kind: "fill_in", blanks: ["woon", "Amsterdam"] }).grade;
    expect(miss.correct).toBe(false);
    expect(miss.items.map((item) => item.ok)).toEqual([true, false]);
    expect(gradeTutorAnswer(fill, { kind: "fill_in", blanks: ["woon"] })).toEqual({ ok: false, error: "ANSWER_INVALID" });
  });

  it("word order: the chunks must be the offered ones, in the right order", () => {
    const order = component("word_order", { chunks: ["Ik", "woon", "in Utrecht"] });
    expect(grade(order, { kind: "word_order", chunks: ["Ik", "woon", "in Utrecht"] }).grade.correct).toBe(true);
    expect(grade(order, { kind: "word_order", chunks: ["woon", "Ik", "in Utrecht"] }).grade).toMatchObject({ correct: false, reference: "Ik woon in Utrecht" });
    expect(gradeTutorAnswer(order, { kind: "word_order", chunks: ["Ik", "woon", "in Amsterdam"] })).toEqual({ ok: false, error: "ANSWER_INVALID" });
  });

  it("article: one pick per noun", () => {
    const article = component("article", { nouns: [{ noun: "huis", article: "het" }, { noun: "tafel", article: "de" }] });
    const result = grade(article, { kind: "article", articles: ["het", "het"] }).grade;
    expect(result.correct).toBe(false);
    expect(result.items).toEqual([{ expected: "het huis", given: "het huis", ok: true }, { expected: "de tafel", given: "het tafel", ok: false }]);
    expect(grade(article, { kind: "article", articles: ["het", "de"] }).grade.correct).toBe(true);
    expect(gradeTutorAnswer(article, { kind: "article", articles: ["het"] })).toEqual({ ok: false, error: "ANSWER_INVALID" });
  });

  it("choice: the chosen index against the correct one", () => {
    const choice = component("choice", { question: "Wat betekent huis?", options: ["house", "mouse", "horse"], correct: 0 });
    expect(grade(choice, { kind: "choice", choice: 0 }).grade).toMatchObject({ correct: true, reference: "house" });
    expect(grade(choice, { kind: "choice", choice: 2 }).grade.correct).toBe(false);
    expect(gradeTutorAnswer(choice, { kind: "choice", choice: 3 })).toEqual({ ok: false, error: "ANSWER_INVALID" });
  });

  it("dictation: word by word, extra words count against", () => {
    const dictation = component("dictation", { sentence: "Ik woon in Utrecht." });
    expect(grade(dictation, { kind: "dictation", text: "ik woon in utrecht" }).grade.correct).toBe(true);
    const miss = grade(dictation, { kind: "dictation", text: "ik wone in utrecht nu" }).grade;
    expect(miss.correct).toBe(false);
    expect(miss.items.map((item) => item.ok)).toEqual([true, false, true, true, false]);
  });

  it("quick review is self-graded and Say it passes from the threshold score", () => {
    const review = component("quick_review", { cards: [{ lessonId: id(1), wordId: id(2), direction: "produce" }, { lessonId: id(1), wordId: id(3), direction: "understand" }] });
    expect(grade(review, { kind: "quick_review", results: ["got", "again"] }).grade).toMatchObject({ correct: false, matched: null });
    expect(gradeTutorAnswer(review, { kind: "quick_review", results: ["got"] })).toEqual({ ok: false, error: "ANSWER_INVALID" });
    const say = component("say_it", { sentence: "Goedemorgen" });
    const scores = { overall: 72, accuracy: 70, fluency: 80, completeness: 100, words: [{ word: "Goedemorgen", accuracy: 70, error: "none" as const }] };
    expect(grade(say, { kind: "say_it", scores }).grade).toMatchObject({ correct: true, score: 72 });
    expect(grade(say, { kind: "say_it", scores: { ...scores, overall: 40 } }).grade.correct).toBe(false);
  });

  it("refuses an answer of another kind", () => {
    const choice = component("choice", { question: "Q?", options: ["a", "b", "c"], correct: 1 });
    expect(gradeTutorAnswer(choice, { kind: "translate", text: "a" })).toEqual({ ok: false, error: "ANSWER_INVALID" });
  });
});

describe("open kinds", () => {
  it("accept a match at once and ask for a verdict otherwise", () => {
    const translate = component("translate", { source: "I live in Utrecht.", reference: "Ik woon in Utrecht." });
    expect(grade(translate, { kind: "translate", text: "ik woon in utrecht" })).toMatchObject({ needsVerdict: false, grade: { correct: true, matched: true } });
    const open = grade(translate, { kind: "translate", text: "Ik leef in Utrecht" });
    expect(open).toMatchObject({ needsVerdict: true, grade: { correct: false, matched: false, verdict: null } });
    expect(applyVerdict(open.grade, "acceptable", "Natural too.")).toMatchObject({ correct: true, verdict: "acceptable", note: "Natural too." });
    expect(applyVerdict(open.grade, "error", null).correct).toBe(false);
    expect(applyVerdict(open.grade, null, null)).toMatchObject({ correct: false, verdict: null });
  });

  it("fix the mistake compares with the corrected reference", () => {
    const fix = component("fix_mistake", { sentence: "Ik woont in Utrecht.", reference: "Ik woon in Utrecht." });
    expect(grade(fix, { kind: "fix_mistake", text: "Ik woon in Utrecht" }).grade.correct).toBe(true);
    expect(componentAttemptText(fix, { kind: "fix_mistake", text: "x" })).toEqual({ prompt: "Ik woont in Utrecht.", answer: "x", reference: "Ik woon in Utrecht." });
  });
});

describe("payloads and views", () => {
  it("validate blanks, options, and articles", () => {
    expect(tutorComponentPayloadSchemas.fill_in.safeParse({ prompt: "Ik … in …", answers: ["woon"] }).success).toBe(false);
    expect(tutorComponentPayloadSchemas.fill_in.safeParse({ prompt: "No blanks", answers: ["x"] }).success).toBe(false);
    expect(tutorComponentPayloadSchemas.choice.safeParse({ question: "Q", options: ["a", "A", "b"], correct: 0 }).success).toBe(false);
    expect(tutorComponentPayloadSchemas.choice.safeParse({ question: "Q", options: ["a", "b", "c"], correct: 3 }).success).toBe(false);
    expect(tutorComponentPayloadSchemas.article.safeParse({ nouns: [{ noun: "Haus", article: "das" }, { noun: "huis", article: "het" }] }).success).toBe(false);
    expect(tutorComponentPayloadSchemas.translate.safeParse({ source: "x", reference: "y", words: [{ lessonId: "nope", wordId: id(1) }] }).success).toBe(false);
  });

  it("leave reference answers out of the view", () => {
    const dictation = component("dictation", { sentence: "Geheim", translation: "Secret" });
    expect(tutorComponentView(dictation)).toEqual({ kind: "dictation", translation: "Secret" });
    const fill = component("fill_in", { prompt: "Ik … hier.", answers: ["woon"] });
    expect(JSON.stringify(tutorComponentView(fill))).not.toContain("woon");
    const order = component("word_order", { chunks: ["a", "b", "c"] });
    const view = tutorComponentView(order, { random: () => 0 });
    expect(view.kind === "word_order" && view.chunks).not.toEqual(["a", "b", "c"]);
    expect(tutorComponentView(component("article", { nouns: [{ noun: "Haus", article: "das" }] }))).toMatchObject({ options: ["der", "die", "das"] });
  });

  it("strip stored data from public parts", () => {
    const fill = component("fill_in", { prompt: "Ik … hier.", answers: ["woon"] });
    const stored = tutorStoredPartSchema.parse({ type: "component", toolCallId: id(1), kind: "fill_in", view: tutorComponentView(fill), component: fill, answer: null, grade: null, answeredAt: null });
    expect(toPublicPart(stored)).not.toHaveProperty("component");
    const result = tutorStoredPartSchema.parse({ type: "tool_result", toolCallId: id(2), name: "get_lesson", ok: true, error: null, detail: { lessonTitle: "One" }, content: "{\"secret\":1}" });
    expect(toPublicPart(result)).not.toHaveProperty("content");
  });

  it("AI practices take every kind but quick review and Say it", () => {
    expect(aiPracticeContentSchema.safeParse({ kind: "choice", payload: { question: "Q", options: ["a", "b", "c"], correct: 0 } }).success).toBe(true);
    expect(aiPracticeContentSchema.safeParse({ kind: "say_it", payload: { sentence: "Hoi" } }).success).toBe(false);
    expect(saveAiPracticeArgsSchema.safeParse({ practice: { kind: "translate", payload: { source: "a", reference: "b" } }, lessons: [] }).success).toBe(false);
  });

  it("shape the lesson page's AI practice read and answer", () => {
    const practice = { id: id(1), kind: "dictation", focus: "listening", afterBlockId: null, view: { kind: "dictation", translation: null }, createdAt: 1 };
    expect(lessonAiPracticesResponseSchema.safeParse({ practices: [practice], canRemove: false }).success).toBe(true);
    expect(lessonAiPracticesResponseSchema.safeParse({ practices: [{ ...practice, view: { kind: "dictation", translation: null, sentence: "Hoi" } }], canRemove: false }).success).toBe(false);
    expect(lessonAiPracticesResponseSchema.safeParse({ practices: [{ ...practice, kind: "say_it" }], canRemove: false }).success).toBe(false);
    expect(aiPracticeAnswerRequestSchema.safeParse({ answer: { kind: "choice", choice: 1 } }).success).toBe(true);
    expect(aiPracticeAnswerRequestSchema.safeParse({ answer: { kind: "choice", choice: 1 }, matched: true }).success).toBe(false);
    const graded = { correct: true, matched: true, verdict: null, note: null, reference: "a", items: [], score: null };
    expect(aiPracticeAnswerResponseSchema.parse({ grade: graded, recorded: false })).toEqual({ grade: graded, recorded: false });
  });
});

describe("requests and events", () => {
  it("validate messages, answers, speech, and the profile", () => {
    expect(tutorMessageRequestSchema.safeParse({ text: "  " }).success).toBe(false);
    expect(tutorMessageRequestSchema.safeParse({ text: "x".repeat(4_001) }).success).toBe(false);
    expect(tutorMessageRequestSchema.parse({ text: " Hoi\nwereld " }).text).toBe("Hoi\nwereld");
    expect(tutorRespondRequestSchema.safeParse({ type: "confirmation", confirmed: true }).success).toBe(true);
    expect(tutorRespondRequestSchema.safeParse({ type: "component", answer: { kind: "choice", choice: 1, extra: true } }).success).toBe(false);
    expect(tutorRespondRequestSchema.parse({ type: "component", skip: true })).toEqual({ type: "component", skip: true });
    expect(tutorRespondRequestSchema.safeParse({ type: "component", skip: false }).success).toBe(false);
    expect(tutorRespondRequestSchema.safeParse({ type: "confirmation", skip: true }).success).toBe(false);
    expect(tutorRespondRequestSchema.safeParse({ type: "component", skip: true, answer: { kind: "choice", choice: 1 } }).success).toBe(false);
    expect(tutorComponentAnswerSchema.safeParse({ kind: "translate", text: " " }).success).toBe(false);
    expect(tutorSpeechRequestSchema.safeParse({ spanIndex: 0 }).success).toBe(true);
    expect(tutorSpeechRequestSchema.safeParse({ text: "Hallo" }).success).toBe(false);
    expect(updateTutorProfileRequestSchema.parse({ nativeLanguage: "fa", replyLanguage: "mixed", goals: "  " }).goals).toBeNull();
    expect(updateTutorProfileRequestSchema.safeParse({ nativeLanguage: "en", replyLanguage: "native", goals: null, notes: "mine" }).success).toBe(false);
    expect(tutorProfileSchema.safeParse({ nativeLanguage: "en", replyLanguage: "native", goals: "x".repeat(501), notes: null, updatedAt: null }).success).toBe(false);
  });

  it("describe every stream event", () => {
    expect(tutorStreamEventSchema.safeParse({ type: "text", delta: "Hoi" }).success).toBe(true);
    expect(tutorStreamEventSchema.safeParse({ type: "start", messageId: id(1) }).success).toBe(true);
    expect(tutorStreamEventSchema.safeParse({ type: "error", code: "AI_UNAVAILABLE", message: "x" }).success).toBe(true);
    expect(tutorStreamEventSchema.safeParse({ type: "unknown" }).success).toBe(false);
  });
});
