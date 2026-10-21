import { describe, expect, it } from "vitest";
import { emptyLessonDocument, type LessonBlock, type LessonDocument } from "./lessonDocument";
import { LESSON_ACTIVITY_RECIPE_VERSION, LESSON_ACTIVITY_SCHEMA_VERSION, gradeLessonActivityAnswer, lessonActivityFocus, lessonActivityMetricSchema, lessonActivityPayloadSchema, lessonActivityTypeSchema, lessonActivityViewSchema, normalizeLessonSentence, resolveLessonActivitySources, toLessonActivityView, verifyLessonActivitySource } from "./lessonActivities";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const props = { textColor: "default" as const, backgroundColor: "default" as const };
const fingerprint = "0123456789abcdef".repeat(4);
const heading = (id: number, text: string, level: 1 | 2 | 3): LessonBlock => ({ id: uid(id), type: "heading", props: { ...props, level }, content: [{ type: "text", text, styles: {} }], children: [] });
const para = (id: number, text: string): LessonBlock => ({ id: uid(id), type: "paragraph", props, content: [{ type: "text", text, styles: {} }], children: [] });
// Dialogue turns are stored as a bare JSON array of { speaker, text } (see lessonDocument.ts readDialogueTurns).
const dialogue = (id: number, turns: { speaker: string; text: string }[]): LessonBlock => ({ id: uid(id), type: "dialogue", props: { turns: JSON.stringify(turns) }, content: undefined, children: [] });
const sofiaAndMira = [{ speaker: "Sofia", text: "Hallo." }, { speaker: "Mira", text: "Goedemorgen." }];

describe("lesson activity contracts", () => {
  it("strips private answer references from activity views and grades from payload", () => {
    const payload = lessonActivityPayloadSchema.parse({
      type: "tricky_grammar", recipeVersion: 2, schemaVersion: 2,
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
    const fill = { type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, questions: [
      { id: uid(1), kind: "fill_in", prompt: "Ik … hier.", referenceAnswers: ["woon"], explanation: "Present tense." },
      ...[2, 3, 4].map((n) => ({ id: uid(n), kind: "choice", prompt: "Pick", options: [1, 2, 3].map((x) => ({ id: uid(n * 10 + x), text: `Option ${x}` })), correctOptionId: uid(n * 10 + 1), explanation: "Because." })),
    ] } as const;
    const payload = lessonActivityPayloadSchema.parse(fill);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "text", text: " WOON " })?.correct).toBe(true);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "text", text: "ga" })?.correct).toBe(false);
  });

  it("grades word order against the stored expected order and rejects a non-permutation", () => {
    const wordOrder = { id: uid(1), kind: "word_order", prompt: "Order the words.", tokens: ["hier", "woon", "ik"], expectedOrder: [2, 1, 0], explanation: "Verb second." };
    const fillIn = (n: number) => ({ id: uid(n), kind: "fill_in", prompt: "Ik … hier.", referenceAnswers: ["woon"], explanation: "Present tense." });
    const payload = lessonActivityPayloadSchema.parse({ type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, questions: [wordOrder, fillIn(2), fillIn(3), fillIn(4)] });
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "word_order", order: [2, 1, 0] })).toMatchObject({ correct: true, reference: "ik woon hier" });
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "word_order", order: [0, 1, 2] })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "word_order", order: [2, 1] })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "text", text: "ik woon hier" })?.correct).toBe(false);
    expect(lessonActivityPayloadSchema.safeParse({ type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, questions: [{ ...wordOrder, expectedOrder: [0, 0, 1] }, fillIn(2), fillIn(3), fillIn(4)] }).success).toBe(false);
  });

  it("strips role-play reference text from the learner-facing view and still grades it", () => {
    const turn = (index: number, speaker: string, isLearner: boolean) => ({ id: uid(20 + index), index, speaker, isLearner, cue: "Say hello.", dutchText: "Hallo Sofia", englishText: "Hello Sofia", voice: null, referenceText: "Hallo Sofia" });
    const payload = lessonActivityPayloadSchema.parse({ type: "roleplay", recipeVersion: 1, schemaVersion: 1, dialogueId: uid(30), cueLanguage: "english", turns: [turn(0, "Sofia", false), turn(1, "Mira", true)] });
    const view = toLessonActivityView({ id: uid(10), sourceId: uid(31), sourceLabel: "Dialogue", sourceFingerprint: fingerprint, payload });
    expect(view.payload.type === "roleplay" && view.payload.turns.length).toBe(2);
    expect(view.payload.type === "roleplay" && view.payload.turns.every((item) => !("referenceText" in item))).toBe(true);
    expect(JSON.stringify(view)).not.toContain("referenceText");
    expect(lessonActivityViewSchema.parse(view).payload.type).toBe("roleplay");
    expect(gradeLessonActivityAnswer(payload, uid(21), { kind: "text", text: "hallo  sofia" })?.correct).toBe(true);
    expect(gradeLessonActivityAnswer(payload, uid(21), { kind: "text", text: "Hoi" })?.correct).toBe(false);
  });

  it("compares sentences by punctuation, accent equivalence and spacing, but not by dropping articles", () => {
    const reply = (referenceText: string) => lessonActivityPayloadSchema.parse({ type: "roleplay", recipeVersion: 1, schemaVersion: 1, dialogueId: uid(40), cueLanguage: "dutch", turns: [
      { id: uid(41), index: 0, speaker: "Sofia", isLearner: false, cue: null, dutchText: "Hallo", englishText: null, voice: null, referenceText: "Hallo" },
      { id: uid(42), index: 1, speaker: "Dirk", isLearner: true, cue: "Greet him.", dutchText: referenceText, englishText: null, voice: null, referenceText },
    ] });
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
    const fill = lessonActivityPayloadSchema.parse({ type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, questions: [
      { id: uid(1), kind: "fill_in", prompt: "Ik … hier.", referenceAnswers: ["woon"], explanation: "Present tense." },
      ...[2, 3, 4].map((n) => ({ id: uid(n), kind: "choice", prompt: "Pick", options: [1, 2, 3].map((x) => ({ id: uid(n * 10 + x), text: `Option ${x}` })), correctOptionId: uid(n * 10 + 1), explanation: "Because." })),
    ] });
    expect(gradeLessonActivityAnswer(fill, uid(1), { kind: "text", text: "Woon." })?.correct).toBe(true);
    expect(gradeLessonActivityAnswer(fill, uid(1), { kind: "text", text: "de woon" })?.correct).toBe(false);
  });

  it("resolves prefix sections, grammar subsections, multiple eligible dialogue sources and lesson end deterministically", async () => {
    const doc = {
      ...emptyLessonDocument(), blocks: [
        para(1, "Introductory content"), dialogue(4, sofiaAndMira), heading(2, "Story", 1), para(3, "Story text"),
        dialogue(5, [{ speaker: " Sofia ", text: "Dag." }, { speaker: "Jan", text: "Hoi." }]),
        heading(6, "Grammar", 1), { id: uid(7), type: "callout", props: { variant: "grammar", icon: "auto" }, content: [{ type: "text", text: "Word order" }], children: [] },
        heading(8, "Inversion", 3), para(9, "A rule"), heading(10, "Summary", 2), para(11, "End"),
      ],
    } as unknown as LessonDocument;
    const first = await resolveLessonActivitySources({ document: doc, title: "Lesson" });
    const again = await resolveLessonActivitySources({ document: doc, title: "Lesson" });
    expect(first).toEqual(again);
    expect(first.some((source) => source.sourceId === "intro")).toBe(true);
    expect(first.filter((source) => source.sourceKind === "dialogue")).toHaveLength(2);
    expect(first.find((source) => source.sourceId === uid(8))?.activityTypes).toContain("tricky_grammar");
    expect(first.find((source) => source.sourceId === "lesson_end")?.activityTypes).toContain("mixed_practice");
    const dialogueSource = first.find((source) => source.sourceKind === "dialogue")!;
    expect(verifyLessonActivitySource(first, dialogueSource.sourceId, "roleplay", dialogueSource.fingerprint)).toEqual(dialogueSource);
    expect(verifyLessonActivitySource(first, dialogueSource.sourceId, "roleplay", "0".repeat(64))).toBeNull();
  });

  it("never offers role-play unless Sofia and a partner both have original turns", async () => {
    const doc = { ...emptyLessonDocument(), blocks: [heading(1, "Story", 1), dialogue(2, [{ speaker: "Anna", text: "Hi" }, { speaker: "Mira", text: "Hello" }])] } as unknown as LessonDocument;
    expect((await resolveLessonActivitySources({ document: doc })).some((source) => source.activityTypes.includes("roleplay"))).toBe(false);
  });

  it("offers no role-play for an introduction dialogue without Sofia", async () => {
    const doc = { ...emptyLessonDocument(), blocks: [para(1, "Introduction"), dialogue(2, [{ speaker: "Anna", text: "Hi" }, { speaker: "Mira", text: "Hello" }])] } as unknown as LessonDocument;
    const sources = await resolveLessonActivitySources({ document: doc, includeLessonEnd: false });
    expect(sources.some((source) => source.activityTypes.includes("roleplay"))).toBe(false);
    expect(sources.find((source) => source.sourceId === "intro")?.activityTypes).toEqual(["story_summary", "story_comprehension"]);
  });

  it("keeps a level 3 heading inside a non-grammar section as part of that section", async () => {
    const doc = { ...emptyLessonDocument(), blocks: [heading(1, "Story", 1), para(2, "Story text"), heading(3, "Details", 3), para(4, "More"), dialogue(5, sofiaAndMira)] } as unknown as LessonDocument;
    const sources = await resolveLessonActivitySources({ document: doc, includeLessonEnd: false });
    expect(sources.map((source) => source.sourceId)).not.toContain(uid(3));
    expect(sources.some((source) => source.sourceLabel === "Details")).toBe(false);
    expect(sources.find((source) => source.sourceId === uid(1))?.activityTypes).toEqual(["story_summary", "story_comprehension"]);
    expect(sources.find((source) => source.sourceId === uid(5))).toMatchObject({ sourceKind: "dialogue", sourceLabel: "Dialogue · Story", activityTypes: ["roleplay"] });
  });

  it("has nine v2 activity types, rejects quick_grammar and maps focus for the new types", () => {
    expect(lessonActivityTypeSchema.options).toHaveLength(9);
    expect(lessonActivityTypeSchema.safeParse("quick_grammar").success).toBe(false);
    expect(lessonActivityTypeSchema.safeParse("guided_grammar").success).toBe(true);
    expect(lessonActivityPayloadSchema.safeParse({ type: "quick_grammar", recipeVersion: 2, schemaVersion: 2 }).success).toBe(false);
    expect(lessonActivityFocus("read_aloud")).toBe("speaking");
    expect(lessonActivityFocus("speak_from_english")).toBe("speaking");
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
    expect(sources.find((source) => source.sourceId === uid(1))?.activityTypes).toEqual(["story_summary", "story_comprehension"]);
    expect(sources.find((source) => source.sourceId === uid(9))).toMatchObject({ sourceLabel: "Dialogue · Story", activityTypes: ["roleplay"] });
  });
});
