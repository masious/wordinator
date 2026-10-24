import { describe, expect, it } from "vitest";
import { emptyLessonDocument, type LessonBlock, type LessonDocument } from "./lessonDocument";
import { activitySpeechRequestSchema, LESSON_ACTIVITY_RECIPE_VERSION, activityRunPatchResponseSchema, LESSON_ACTIVITY_SCHEMA_VERSION, gradeLessonActivityAnswer, lessonActivityFocus, lessonActivityMetricSchema, lessonActivityPayloadSchema, lessonActivityTypeSchema, lessonActivityViewSchema, normalizeLessonSentence, readerLines, resolveLessonActivitySources, dialogueLines, dialogueSpeakers, toLessonActivityView, verifyLessonActivitySource } from "./lessonActivities";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const props = { textColor: "default" as const, backgroundColor: "default" as const };
const fingerprint = "0123456789abcdef".repeat(4);
const heading = (id: number, text: string, level: 1 | 2 | 3): LessonBlock => ({ id: uid(id), type: "heading", props: { ...props, level }, content: [{ type: "text", text, styles: {} }], children: [] });
const para = (id: number, text: string): LessonBlock => ({ id: uid(id), type: "paragraph", props, content: [{ type: "text", text, styles: {} }], children: [] });
// Dialogue turns are stored as a bare JSON array of { speaker, text } (see lessonDocument.ts readDialogueTurns).
const dialogue = (id: number, turns: { speaker: string; text: string }[]): LessonBlock => ({ id: uid(id), type: "dialogue", props: { turns: JSON.stringify(turns) }, content: undefined, children: [] });
const sofiaAndMira = [{ speaker: "Sofia", text: "Hallo." }, { speaker: "Mira", text: "Goedemorgen." }];
const metrics = ["lesson_activities"];
const choice = (n: number) => ({ id: uid(n), kind: "choice", prompt: "Kies.", options: [1, 2, 3].map((x) => ({ id: uid(n * 10 + x), text: `Optie ${x}` })), correctOptionId: uid(n * 10 + 1), explanation: "Omdat." });
const step = (n: number, blocks: LessonBlock[] = [para(n * 100, "Uitleg.")]) => ({ blocks, question: choice(n) });
const guidedPayload = { type: "guided_grammar", recipeVersion: 2, schemaVersion: 2, metrics, steps: [step(10), step(20)], followUps: ["tricky_grammar", "mixed_practice"] };
const readAloudLine = (n: number, speaker = "Sofia", text = "Goedemorgen.") => ({ id: uid(n), index: n, speaker, dutchText: text, referenceText: text });
const readAloudPayload = { type: "read_aloud", recipeVersion: 2, schemaVersion: 2, metrics, lines: [readAloudLine(50)] };
const words = (id: number, ...ids: number[]): LessonBlock => ({ id: uid(id), type: "vocabulary", props: { data: JSON.stringify({ words: ids.map((n) => ({ id: uid(n), term: `woord${n}`, meaning: "word" })) }) }, content: undefined, children: [] } as unknown as LessonBlock);
const viewOf = (payload: unknown) => toLessonActivityView({ id: uid(10), sourceId: uid(11), sourceLabel: "Lesson", sourceFingerprint: fingerprint, payload: lessonActivityPayloadSchema.parse(payload) });

describe("lesson activity contracts", () => {
  it("strips private answer references from activity views and grades from payload", () => {
    const payload = lessonActivityPayloadSchema.parse({
      type: "tricky_grammar", recipeVersion: 2, schemaVersion: 2, metrics,
      questions: [
        { id: uid(1), kind: "choice", prompt: "Choose.", options: [{ id: uid(2), text: "A" }, { id: uid(3), text: "B" }, { id: uid(4), text: "C" }], correctOptionId: uid(3), explanation: "B is used here." },
        ...[5, 6, 7].map((n) => ({ id: uid(n), kind: "fill_in", prompt: "Ik … hier.", referenceAnswers: ["woon"], explanation: "Present tense." })),
      ],
    });
    const view = toLessonActivityView({ id: uid(10), sourceId: uid(11), sourceLabel: "Grammar", sourceFingerprint: fingerprint, payload });
    expect(lessonActivityViewSchema.parse(view).payload.type).toBe("tricky_grammar");
    expect(JSON.stringify(view)).not.toContain("correctOptionId");
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "choice", optionId: uid(3) })?.correct).toBe(true);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "choice", optionId: uid(2) })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(999), { kind: "choice", optionId: uid(3) })).toBeNull();
  });

  it("normalizes bounded text and grades fill and ordering from stored references", () => {
    expect(normalizeLessonSentence("  IK\twoon  ")).toBe("ik woon");
    const fill = { type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, metrics, questions: [
      { id: uid(1), kind: "fill_in", prompt: "Ik … hier.", referenceAnswers: ["woon"], explanation: "Present tense." },
      ...[2, 3, 4].map((n) => ({ id: uid(n), kind: "choice", prompt: "Pick", options: [1, 2, 3].map((x) => ({ id: uid(n * 10 + x), text: `Option ${x}` })), correctOptionId: uid(n * 10 + 1), explanation: "Because." })),
    ] } as const;
    const payload = lessonActivityPayloadSchema.parse(fill);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "text", text: " WOON " })?.correct).toBe(true);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "text", text: "ga" })?.correct).toBe(false);
  });

  it("grades word order by the sentence it builds and rejects a non-permutation", () => {
    const wordOrder = { id: uid(1), kind: "word_order", prompt: "Order the words.", tokens: ["hier", "woon", "ik"], expectedOrder: [2, 1, 0], explanation: "Verb second." };
    const fillIn = (n: number) => ({ id: uid(n), kind: "fill_in", prompt: "Ik … hier.", referenceAnswers: ["woon"], explanation: "Present tense." });
    const payload = lessonActivityPayloadSchema.parse({ type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, metrics, questions: [wordOrder, fillIn(2), fillIn(3), fillIn(4)] });
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "word_order", order: [2, 1, 0] })).toMatchObject({ correct: true, reference: "ik woon hier" });
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "word_order", order: [0, 1, 2] })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "word_order", order: [2, 1] })?.correct).toBe(false);
    // A repeated word may come from either of its chips; every chip is still used once.
    const repeated = lessonActivityPayloadSchema.parse({ type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, metrics,
      questions: [{ ...wordOrder, tokens: ["uur", "tot", "elf", "uur", "negen", "van"], expectedOrder: [5, 4, 0, 1, 2, 3] }, fillIn(2), fillIn(3), fillIn(4)] });
    expect(gradeLessonActivityAnswer(repeated, uid(1), { kind: "word_order", order: [5, 4, 3, 1, 2, 0] })).toMatchObject({ correct: true, reference: "van negen uur tot elf uur" });
    expect(gradeLessonActivityAnswer(repeated, uid(1), { kind: "word_order", order: [5, 4, 0, 1, 2, 0] })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "text", text: "ik woon hier" })?.correct).toBe(false);
    expect(lessonActivityPayloadSchema.safeParse({ type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, metrics, questions: [{ ...wordOrder, expectedOrder: [0, 0, 1] }, fillIn(2), fillIn(3), fillIn(4)] }).success).toBe(false);
  });

  it("compares sentences by punctuation, accent equivalence and spacing, but not by dropping articles", () => {
    const reply = (referenceText: string) => lessonActivityPayloadSchema.parse({ ...readAloudPayload, lines: [readAloudLine(41, "Sofia", "Hallo"), { ...readAloudLine(42, "Dirk"), dutchText: referenceText, referenceText }] });
    const grade = (referenceText: string, text: string) => gradeLessonActivityAnswer(reply(referenceText), uid(42), { kind: "text", text })?.correct;

    // Punctuation-only differences match: commas, full stops, curly quotes, dashes and exclamation marks.
    expect(grade("Goedemorgen, Dirk.", "Goedemorgen Dirk")).toBe(true);
    expect(grade("Goedemorgen Dirk", "Goedemorgen, Dirk.")).toBe(true);
    expect(grade("Goedemorgen, Dirk.", "  goedemorgen   dirk!  ")).toBe(true);
    expect(grade("Ik heet Dirk.", "“Ik heet Dirk” — ")).toBe(true);
    expect(grade("Dag-dag!", "dag dag")).toBe(true);
    expect(grade("Dag.", "")).toBe(false);
    expect(grade("Dag.", "...")).toBe(false);

    // Apostrophes inside a word are kept and typographic apostrophes read as straight ones.
    expect(grade("Hoe gaat het met z'n zus?", "hoe gaat het met z’n zus")).toBe(true);
    expect(grade("Hoe gaat het met z'n zus?", "hoe gaat het met zn zus")).toBe(false);
    expect(normalizeLessonSentence("Hé, ‘z’n’ — dag!")).toBe("he z'n dag");

    // Accent equivalence is the project's rule: e and i with any combining mark match the plain letter, other letters do not.
    expect(grade("Ik woon in één stad.", "ik woon in een stad")).toBe(true);
    expect(grade("Het café is open.", "Het cafe is open")).toBe(true);
    expect(grade("Ik ben Ïs.", "ik ben is")).toBe(true);
    expect(grade("Über alles.", "Uber alles")).toBe(false);
    expect(grade("Het mooi huis.", "Het móói huis")).toBe(false);

    // Articles are not dropped: a learner who leaves out "de" has not reproduced the line.
    expect(grade("de man is blij.", "man is blij")).toBe(false);
    expect(grade("Man is blij.", "de man is blij")).toBe(false);

    // A different word is a different sentence.
    expect(grade("Goedemorgen, Dirk.", "Goedemiddag Dirk")).toBe(false);
  });

  it("applies the same sentence rule to fill-in answers", () => {
    const fill = lessonActivityPayloadSchema.parse({ type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, metrics, questions: [
      { id: uid(1), kind: "fill_in", prompt: "Ik … hier.", referenceAnswers: ["woon"], explanation: "Present tense." },
      ...[2, 3, 4].map((n) => ({ id: uid(n), kind: "choice", prompt: "Pick", options: [1, 2, 3].map((x) => ({ id: uid(n * 10 + x), text: `Option ${x}` })), correctOptionId: uid(n * 10 + 1), explanation: "Because." })),
    ] });
    expect(gradeLessonActivityAnswer(fill, uid(1), { kind: "text", text: "Woon." })?.correct).toBe(true);
    expect(gradeLessonActivityAnswer(fill, uid(1), { kind: "text", text: "de woon" })?.correct).toBe(false);
  });

  it("resolves prefix sections, grammar subsections, dialogue sections and lesson end deterministically, with no dialogue sources", async () => {
    const doc = {
      ...emptyLessonDocument(), blocks: [
        para(1, "Introductory content"), dialogue(4, sofiaAndMira), heading(2, "Story", 1), para(3, "Story text"),
        dialogue(5, [{ speaker: " Sofia ", text: "Dag." }, { speaker: "Jan", text: "Hoi." }]), words(12, 13, 14),
        heading(6, "Grammar", 1), { id: uid(7), type: "callout", props: { variant: "grammar", icon: "auto" }, content: [{ type: "text", text: "Word order" }], children: [] },
        heading(8, "Inversion", 3), para(9, "A rule"), heading(10, "Summary", 2), para(11, "End"),
      ],
    } as unknown as LessonDocument;
    const first = await resolveLessonActivitySources({ document: doc, title: "Lesson" });
    const again = await resolveLessonActivitySources({ document: doc, title: "Lesson" });
    expect(first).toEqual(again);
    expect(first.find((source) => source.sourceId === "intro")?.activityTypes).toEqual(["read_aloud"]);
    expect(first.find((source) => source.sourceId === uid(2))?.activityTypes).toEqual(["read_aloud"]);
    expect(first.every((source) => source.sourceKind !== ("dialogue" as string))).toBe(true);
    expect(first.find((source) => source.sourceId === uid(8))?.activityTypes).toContain("tricky_grammar");
    expect(first.find((source) => source.sourceId === "lesson_end")?.activityTypes).toContain("mixed_practice");
    const story = first.find((source) => source.sourceId === uid(2))!;
    expect(verifyLessonActivitySource(first, story.sourceId, "read_aloud", story.fingerprint)).toEqual(story);
    expect(verifyLessonActivitySource(first, story.sourceId, "read_aloud", "0".repeat(64))).toBeNull();
  });

  it("offers read aloud on any dialogue, Sofia or not, and nothing for a section of words alone", async () => {
    const doc = { ...emptyLessonDocument(), blocks: [
      heading(1, "Story", 1), dialogue(2, [{ speaker: "Anna", text: "Hi" }, { speaker: "Mira", text: "Hello" }]),
      heading(3, "Words", 1), words(4, 5),
    ] } as unknown as LessonDocument;
    const sources = await resolveLessonActivitySources({ document: doc, includeLessonEnd: false });
    expect(sources.find((source) => source.sourceId === uid(1))?.activityTypes).toEqual(["read_aloud"]);
    // A words-only section has no dialogue, so it offers neither.
    expect(sources.find((source) => source.sourceId === uid(3))).toBeUndefined();
  });

  it("keeps a level 3 heading inside a non-grammar section as part of that section", async () => {
    const doc = { ...emptyLessonDocument(), blocks: [heading(1, "Story", 1), para(2, "Story text"), heading(3, "Details", 3), para(4, "More"), dialogue(5, sofiaAndMira), words(6, 7)] } as unknown as LessonDocument;
    const sources = await resolveLessonActivitySources({ document: doc, includeLessonEnd: false });
    expect(sources.map((source) => source.sourceId)).not.toContain(uid(3));
    expect(sources.some((source) => source.sourceLabel === "Details")).toBe(false);
    expect(sources.find((source) => source.sourceId === uid(1))?.activityTypes).toEqual(["read_aloud"]);
  });

  it("has four activity types, rejects every retired one, and maps focus", () => {
    expect(lessonActivityTypeSchema.options).toHaveLength(4);
    for (const retired of ["quick_grammar", "grammar_explanation", "story_comprehension", "story_summary", "speak_from_english", "roleplay", "review_words"]) expect(lessonActivityTypeSchema.safeParse(retired).success).toBe(false);
    expect(lessonActivityTypeSchema.safeParse("guided_grammar").success).toBe(true);
    expect(lessonActivityPayloadSchema.safeParse({ type: "quick_grammar", recipeVersion: 2, schemaVersion: 2 }).success).toBe(false);
    expect(lessonActivityFocus("read_aloud")).toBe("speaking");
    expect(lessonActivityFocus("tricky_grammar")).toBe("grammar");
    expect(lessonActivityFocus("guided_grammar")).toBe("grammar");
  });

  it("accepts the four activity metric keys and rejects an unknown key", () => {
    for (const key of ["lesson_share", "lesson_reading", "lesson_grammar", "lesson_activities"]) expect(lessonActivityMetricSchema.safeParse(key).success).toBe(true);
    expect(lessonActivityMetricSchema.safeParse("lesson_unknown").success).toBe(false);
  });

  it("sets the v2 recipe and schema versions", () => {
    expect(LESSON_ACTIVITY_RECIPE_VERSION).toBe(2);
    expect(LESSON_ACTIVITY_SCHEMA_VERSION).toBe(2);
  });

  it("does not let a heading nested inside a column start a section", async () => {
    const columnList = { id: uid(3), type: "columnList", props: {}, content: undefined, children: [
      { id: uid(4), type: "column", props: { width: 50 }, content: undefined, children: [heading(5, "Side note", 2), para(6, "Aside")] },
      { id: uid(7), type: "column", props: { width: 50 }, content: undefined, children: [para(8, "Other")] },
    ] };
    const doc = { ...emptyLessonDocument(), blocks: [heading(1, "Story", 1), para(2, "Story text"), columnList, dialogue(9, sofiaAndMira)] } as unknown as LessonDocument;
    const sources = await resolveLessonActivitySources({ document: doc, includeLessonEnd: false });
    expect(sources.map((source) => source.sourceId)).not.toContain(uid(5));
    expect(sources.find((source) => source.sourceId === uid(1))?.activityTypes).toEqual(["read_aloud"]);
  });

  it("validates guided grammar steps and follow-ups, and omits the answer from its view", () => {
    expect(lessonActivityPayloadSchema.safeParse(guidedPayload).success).toBe(true);
    expect(lessonActivityPayloadSchema.safeParse({ ...guidedPayload, steps: [step(10)] }).success).toBe(false);
    expect(lessonActivityPayloadSchema.safeParse({ ...guidedPayload, steps: [{ ...step(10), blocks: [] }, step(20)] }).success).toBe(false);
    expect(lessonActivityPayloadSchema.safeParse({ ...guidedPayload, steps: [{ ...step(10), blocks: Array.from({ length: 5 }, (_, n) => para(300 + n, "Regel.")) }, step(20)] }).success).toBe(false);
    expect(lessonActivityPayloadSchema.safeParse({ ...guidedPayload, followUps: ["tricky_grammar", "mixed_practice", "mixed_practice"] }).success).toBe(false);
    expect(lessonActivityPayloadSchema.safeParse({ ...guidedPayload, followUps: ["quick_grammar"] }).success).toBe(false);
    // Grammar explanation is retired, so it is no follow-up either.
    expect(lessonActivityPayloadSchema.safeParse({ ...guidedPayload, followUps: ["grammar_explanation"] }).success).toBe(false);
    expect(lessonActivityPayloadSchema.safeParse({ ...guidedPayload, steps: [step(10), step(10)] }).success).toBe(false);
    const view = viewOf(guidedPayload);
    expect(lessonActivityViewSchema.parse(view).payload.type).toBe("guided_grammar");
    expect(JSON.stringify(view)).not.toContain("correctOptionId");
    expect(JSON.stringify(view)).not.toContain("explanation");
    expect(view.payload.type === "guided_grammar" && view.payload.followUps).toEqual(["tricky_grammar", "mixed_practice"]);
  });

  it("validates read-aloud lines and strips reference text from the view", () => {
    expect(lessonActivityPayloadSchema.safeParse(readAloudPayload).success).toBe(true);
    expect(lessonActivityPayloadSchema.safeParse({ ...readAloudPayload, lines: Array.from({ length: 61 }, (_, n) => readAloudLine(100 + n)) }).success).toBe(false);
    const view = viewOf(readAloudPayload);
    expect(lessonActivityViewSchema.parse(view).payload).toMatchObject({ type: "read_aloud", lines: [{ dutchText: "Goedemorgen." }] });
    expect(JSON.stringify(view)).not.toContain("referenceText");
  });

  it("requires a speaker on every read-aloud line", () => {
    expect(lessonActivityPayloadSchema.safeParse({ ...readAloudPayload, lines: [{ ...readAloudLine(50), speaker: null }] }).success).toBe(false);
  });

  it("requires one to three metrics on every payload", () => {
    for (const payload of [guidedPayload, readAloudPayload]) {
      expect(lessonActivityPayloadSchema.safeParse(payload).success).toBe(true);
      expect(lessonActivityPayloadSchema.safeParse({ ...payload, metrics: [] }).success).toBe(false);
      expect(lessonActivityPayloadSchema.safeParse({ ...payload, metrics: ["lesson_share", "lesson_reading", "lesson_grammar", "lesson_activities"] }).success).toBe(false);
    }
  });

  it("gives grammar sections exactly guided grammar and tricky grammar", async () => {
    const doc = { ...emptyLessonDocument(), blocks: [heading(1, "Grammar", 1), para(2, "Rule"), { id: uid(3), type: "callout", props: { variant: "grammar", icon: "auto" }, content: [{ type: "text", text: "Tip" }], children: [] }] } as unknown as LessonDocument;
    const sources = await resolveLessonActivitySources({ document: doc, includeLessonEnd: false });
    expect(sources.find((source) => source.sourceId === uid(1))?.activityTypes).toEqual(["guided_grammar", "tricky_grammar"]);
  });

  it("lists a dialogue section's lines from its dialogues only, in document order, with trimmed speakers", () => {
    const story = [heading(1, "Story", 1), para(2, "Ik woon in Amsterdam."), dialogue(3, sofiaAndMira), para(4, "Dat is leuk!"),
      dialogue(5, [{ speaker: " Jan ", text: "Hoi." }])];
    expect(dialogueLines(story)).toEqual([
      { blockId: uid(3), sourceIndex: 0, speaker: "Sofia", text: "Hallo." },
      { blockId: uid(3), sourceIndex: 1, speaker: "Mira", text: "Goedemorgen." },
      { blockId: uid(5), sourceIndex: 0, speaker: "Jan", text: "Hoi." },
    ]);
    expect(dialogueSpeakers(dialogueLines(story))).toEqual(["Sofia", "Mira", "Jan"]);
  });

  it("caps dialogue lines at 60", () => {
    const turns = (from: number) => Array.from({ length: 35 }, (_, n) => ({ speaker: n % 2 ? "Mira" : "Sofia", text: `Zin ${from + n}.` }));
    const blocks = [dialogue(200, turns(0)), dialogue(201, turns(35))];
    const lines = dialogueLines(blocks);
    expect(lines).toHaveLength(60);
    expect(lines[59]).toMatchObject({ text: "Zin 59." });
  });

  it("reads every line without a reader and only the reader's lines with one", () => {
    const lines = [readAloudLine(1, "Sofia"), readAloudLine(2, "Mira"), readAloudLine(3, "Sofia")];
    expect(readerLines(lines, null).map((line) => line.id)).toEqual([uid(1), uid(2), uid(3)]);
    expect(readerLines(lines, "Sofia").map((line) => line.id)).toEqual([uid(1), uid(3)]);
    expect(readerLines(lines, "Jan")).toEqual([]);
  });

  it("points a section's practice ID at its first practice block and leaves the lesson-end source without one", async () => {
    const practice = (id: number): LessonBlock => ({ id: uid(id), type: "practice", props: { data: "{}" }, content: undefined, children: [] });
    const doc = { ...emptyLessonDocument(), blocks: [heading(1, "Story", 1), para(2, "Text"), practice(3), dialogue(4, sofiaAndMira), practice(5)] } as unknown as LessonDocument;
    const sources = await resolveLessonActivitySources({ document: doc });
    expect(sources.find((source) => source.sourceId === uid(1))?.practiceBlockId).toBe(uid(3));
    expect(sources.find((source) => source.sourceKind === "lesson_end")?.practiceBlockId).toBeNull();
  });

  it("grades guided grammar steps as choice answers against the correct option", () => {
    const payload = lessonActivityPayloadSchema.parse(guidedPayload);
    expect(gradeLessonActivityAnswer(payload, uid(10), { kind: "choice", optionId: uid(101) })).toMatchObject({ correct: true, explanation: "Omdat." });
    expect(gradeLessonActivityAnswer(payload, uid(10), { kind: "choice", optionId: uid(102) })).toMatchObject({ correct: false, reference: "Optie 1" });
    expect(gradeLessonActivityAnswer(payload, uid(20), { kind: "text", text: "Optie 1" })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(999), { kind: "choice", optionId: uid(101) })).toBeNull();
  });

  it("grades read-aloud lines by normalized sentence and reports a mismatch as a plain non-match", () => {
    const payload = lessonActivityPayloadSchema.parse(readAloudPayload);
    expect(gradeLessonActivityAnswer(payload, uid(50), { kind: "text", text: "  goedemorgen!  " })).toEqual({ correct: true, reference: "Goedemorgen.", explanation: null });
    expect(gradeLessonActivityAnswer(payload, uid(50), { kind: "text", text: "Goedemiddag." })).toEqual({ correct: false, reference: "Goedemorgen.", explanation: null });
    expect(gradeLessonActivityAnswer(payload, uid(50), { kind: "text", text: "   " })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(50), { kind: "choice", optionId: uid(51) })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(999), { kind: "text", text: "Goedemorgen." })).toBeNull();
  });

  it("strips guided correct options and read-aloud reference text from views", () => {
    const guided = viewOf(guidedPayload);
    expect(JSON.stringify(guided)).not.toContain("correctOptionId");
    expect(JSON.stringify(guided)).not.toContain("referenceText");
    expect(JSON.stringify(viewOf(readAloudPayload))).not.toContain("referenceText");
  });

  it("returns metric changes with completion and rejects unknown metric keys", () => {
    const run = { id: uid(70), status: "completed", cursor: 0, reader: "Mira", startedAt: 1, updatedAt: 2, completedAt: 2 };
    expect(activityRunPatchResponseSchema.parse({ run }).metrics).toBeUndefined();
    expect(activityRunPatchResponseSchema.parse({ run, metrics: [{ key: "lesson_grammar", before: 0.25, after: 0.5 }] }).metrics).toEqual([{ key: "lesson_grammar", before: 0.25, after: 0.5 }]);
    expect(activityRunPatchResponseSchema.safeParse({ run, metrics: [{ key: "course_progress", before: 0, after: 1 }] }).success).toBe(false);
    expect(activityRunPatchResponseSchema.safeParse({ run, metrics: [{ key: "lesson_share", before: 0, after: 1.5 }] }).success).toBe(false);
  });
});

describe("activity speech request", () => {
  const runId = uid(1);
  it("names one line, and never a role-play turn", () => {
    expect(activitySpeechRequestSchema.safeParse({ runId, lineId: uid(3), chunkIndex: 1 }).success).toBe(true);
    expect(activitySpeechRequestSchema.safeParse({ runId }).success).toBe(false);
    expect(activitySpeechRequestSchema.safeParse({ runId, turnId: uid(2) }).success).toBe(false);
  });
});
