import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";
import { COURSE_BLOCKS_MAX, COURSE_WORDS_PER_BLOCK_MAX, practicePayloadSchema } from ".";
import {
  collectImageUrls, collectLessonWords, collectPracticeIds, courseWordsResponseSchema, findPublishProblems, flattenToSteps, inlineText,
  LESSON_DOCUMENT_SCHEMA_VERSION, lessonDocumentSchema, lessonNotReadySchema, lessonPositionRequestSchema, lessonStepKey, mapImageUrls,
  parseStoredLessonDocument, readPracticeBlock, readVocabularyBlock, resolveStepIndex, saveLessonDraftRequestSchema, toLearnerDocument,
  upgradeLegacyBlocks, vocabularyPayloadSchema,
  type LessonDocument, type LessonStep,
} from "./lessonDocument";

const textProps = { backgroundColor: "default", textColor: "default", textAlignment: "left" };
const text = (value: string, styles: Record<string, unknown> = {}) => ({ type: "text", text: value, styles });
const paragraph = (value: string, extra: Record<string, unknown> = {}) => ({ id: randomUUID(), type: "paragraph", props: textProps, content: value ? [text(value)] : [], children: [], ...extra });
const heading = (value: string, level = 2) => ({ id: randomUUID(), type: "heading", props: { ...textProps, level, isToggleable: false }, content: [text(value)], children: [] });
const bullet = (value: string, children: unknown[] = []) => ({ id: randomUUID(), type: "bulletListItem", props: textProps, content: [text(value)], children });
const callout = (value: string) => ({ id: randomUUID(), type: "callout", props: { variant: "hint", icon: "auto" }, content: [text(value)], children: [] });
const example = (value: string) => ({ id: randomUUID(), type: "example", props: { translation: "There is a dog.", note: "" }, content: [text(value)], children: [] });
const image = (url: string, name = "A dog") => ({
  id: randomUUID(), type: "image", props: { textAlignment: "left", backgroundColor: "default", name, url, caption: "", showPreview: true, previewWidth: 512 }, children: [],
});
const practicePayload = {
  instruction: "Fill in the blanks.", passage: null,
  items: [{ prompt: "Ik zie … hond.", authorsVersion: ["de"], note: "Hond is a de-word." }, { prompt: "Translate: I see the dog.", authorsVersion: [], note: null }],
};
const practice = () => ({ id: randomUUID(), type: "practice", props: { data: JSON.stringify(practicePayload) }, children: [] });
const dialogue = () => ({ id: randomUUID(), type: "dialogue", props: { turns: JSON.stringify([{ speaker: "A", text: "Hoi" }, { speaker: "B", text: "Hallo" }]) }, children: [] });
const word = (term: string, extra: Record<string, unknown> = {}) => ({ id: randomUUID(), term, meaning: `meaning of ${term}`, ...extra });
const vocabulary = (...words: unknown[]) => ({ id: randomUUID(), type: "vocabulary", props: { data: JSON.stringify({ words }) }, children: [] });
const column = (...children: unknown[]) => ({ id: randomUUID(), type: "column", props: { width: 1 }, children });
const columns = (...children: unknown[]) => ({ id: randomUUID(), type: "columnList", props: {}, children });
const doc = (...blocks: unknown[]) => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks });
const parse = (...blocks: unknown[]) => lessonDocumentSchema.parse(doc(...blocks));
const rejects = (...blocks: unknown[]) => expect(lessonDocumentSchema.safeParse(doc(...blocks)).success).toBe(false);

describe("lesson document schema", () => {
  it("accepts BlockNote output with restricted rich text, callouts, columns, nested lists, and unfinished images", () => {
    const document = parse(
      heading("Der Akkusativ"),
      { ...paragraph(""), content: [text("Use the "), text("accusative", { bold: true, textColor: "red" }), text(" now."), { type: "link", href: "https://example.com/a", content: [text("more", { italic: true })] }] },
      { ...paragraph("Coloured block"), props: { ...textProps, backgroundColor: "yellow" } },
      callout("Only masculine articles change."),
      bullet("One", [bullet("Two", [bullet("Three")])]),
      { id: randomUUID(), type: "numberedListItem", props: { ...textProps, start: 3 }, content: [text("Three")], children: [] },
      { id: randomUUID(), type: "divider", props: {}, children: [] },
      image(""),
      columns(column(heading("Nominativ", 3), paragraph("Der Hund.")), column(heading("Akkusativ", 3), practice())),
      example("Ich sehe den Hund."),
      dialogue(),
      paragraph(""),
    );
    expect(document.blocks).toHaveLength(12);
  });

  it("rejects styles, links, alignment, and props outside the subset", () => {
    rejects({ ...paragraph(""), content: [text("x", { underline: true })] });
    rejects({ ...paragraph(""), content: [text("x", { code: true })] });
    rejects({ ...paragraph(""), content: [text("x", { textColor: "#ff0000" })] });
    rejects({ ...paragraph(""), content: [{ type: "link", href: "javascript:alert(1)", content: [text("x")] }] });
    rejects({ ...paragraph(""), content: [{ type: "link", href: "/relative", content: [text("x")] }] });
    rejects({ ...paragraph("x"), props: { ...textProps, textAlignment: "center" } });
    rejects({ ...heading("x"), props: { ...textProps, level: 4 } });
    rejects({ ...heading("x"), props: { ...textProps, level: 2, isToggleable: true } });
    rejects({ ...callout("x"), props: { variant: "hint", icon: "skull" } });
    rejects({ ...callout("x"), props: { variant: "danger", icon: "auto" } });
    rejects({ id: randomUUID(), type: "codeBlock", props: {}, content: [text("x")], children: [] });
    rejects({ ...paragraph("x"), extra: true });
    rejects({ ...paragraph("x"), id: "not-a-uuid" });
  });

  it("enforces nesting, column, size, and identity rules", () => {
    rejects(paragraph("parent", { children: [paragraph("child")] }));
    rejects(bullet("1", [bullet("2", [bullet("3", [bullet("4")])])]));
    rejects(bullet("1", [paragraph("not a list item")]));
    rejects(columns(column(paragraph("only one"))));
    rejects(columns(column(paragraph("1")), column(paragraph("2")), column(paragraph("3")), column(paragraph("4"))));
    rejects(columns(column(columns(column(paragraph("a")), column(paragraph("b")))), column(paragraph("c"))));
    rejects(columns(column(), column(paragraph("empty column"))));
    rejects(column(paragraph("column outside a list")));
    rejects(...Array.from({ length: COURSE_BLOCKS_MAX - 1 }, () => paragraph("x")), columns(column(paragraph("a")), column(paragraph("b"))));
    rejects(...Array.from({ length: 30 }, () => paragraph("x".repeat(9_000))));
    const duplicate = paragraph("x");
    rejects(duplicate, duplicate);
    rejects({ ...heading("x".repeat(201)) });
  });

  it("validates structured dialogue and practice data", () => {
    rejects({ ...practice(), props: { data: "{" } });
    rejects({ ...practice(), props: { data: JSON.stringify({ instruction: "x", items: [] }) } });
    rejects({ ...dialogue(), props: { turns: JSON.stringify([]) } });
    rejects({ ...dialogue(), props: { turns: JSON.stringify([{ speaker: "A" }]) } });
  });

  it("validates vocabulary words and their limits", () => {
    const accepted = (payload: unknown) => vocabularyPayloadSchema.safeParse(payload).success;
    expect(accepted({ words: [word("der Hund", { forms: "die Hunde", example: "Der Hund bellt.", note: "Masculine." })] })).toBe(true);
    expect(accepted({ words: [word("", { meaning: "" })] })).toBe(true);
    expect(accepted({ words: Array.from({ length: COURSE_WORDS_PER_BLOCK_MAX }, () => word("x")) })).toBe(true);
    expect(accepted({ words: [] })).toBe(false);
    expect(accepted({ words: Array.from({ length: COURSE_WORDS_PER_BLOCK_MAX + 1 }, () => word("x")) })).toBe(false);
    expect(accepted({ words: [{ term: "der Hund", meaning: "the dog" }] })).toBe(false);
    expect(accepted({ words: [word("x", { id: "word-1" })] })).toBe(false);
    expect(accepted({ words: [word("x".repeat(201))] })).toBe(false);
    expect(accepted({ words: [word("x", { meaning: "x".repeat(501) })] })).toBe(false);
    expect(accepted({ words: [word("x", { forms: "x".repeat(201) })] })).toBe(false);
    expect(accepted({ words: [word("x", { example: "x".repeat(1_001) })] })).toBe(false);
    expect(accepted({ words: [word("x", { note: "x".repeat(2_001) })] })).toBe(false);
    expect(accepted({ words: [word("x", { gender: "m" })] })).toBe(false);
    const twice = word("x");
    expect(accepted({ words: [twice, twice] })).toBe(false);
    const block = vocabulary(word("het huis"));
    expect(parse(block, columns(column(vocabulary(word("de kat"))), column(paragraph("x")))).blocks).toHaveLength(2);
    expect(readVocabularyBlock(parse(block).blocks[0] as never).words[0]!.term).toBe("het huis");
    rejects({ ...block, props: { data: "{" } });
    rejects({ ...block, content: [text("x")] });
    // Word IDs share the document's ID space, so they may not repeat across blocks or collide with a block ID.
    const shared = word("x");
    rejects(vocabulary(shared), vocabulary(shared));
    rejects(paragraph("x", { id: shared.id }), vocabulary(shared));
  });

  it("requires a positive draft version and a version-2 document on save", () => {
    expect(saveLessonDraftRequestSchema.safeParse({ document: doc(paragraph("x")), draftVersion: 1 }).success).toBe(true);
    expect(saveLessonDraftRequestSchema.safeParse({ document: doc(paragraph("x")), draftVersion: 0 }).success).toBe(false);
    expect(saveLessonDraftRequestSchema.safeParse({ document: { schemaVersion: 1, blocks: [] }, draftVersion: 1 }).success).toBe(false);
    expect(parseStoredLessonDocument({ schemaVersion: 3, blocks: [] })).toBeNull();
  });
});

describe("lesson document helpers", () => {
  it("collects practice IDs and image URLs inside columns and maps image URLs", () => {
    const inner = practice();
    const document = parse(practice(), columns(column(inner, image("media:courses/a.png")), column(image(""))));
    expect(collectPracticeIds(document)).toHaveLength(2);
    expect(collectPracticeIds(document)).toContain(inner.id);
    expect(collectImageUrls(document)).toEqual(["media:courses/a.png"]);
    const expanded = mapImageUrls(document, (url) => url.replace("media:", "https://images.example/"));
    expect(collectImageUrls(expanded)).toEqual(["https://images.example/courses/a.png"]);
    expect(collectImageUrls(document)).toEqual(["media:courses/a.png"]);
  });

  it("strips authors' versions and notes from learner documents and returns them as references", () => {
    const block = practice();
    const { document, references } = toLearnerDocument(parse(columns(column(block), column(paragraph("x")))));
    const learnerBlock = document.blocks[0]!.children[0]!.children[0]!;
    expect(JSON.parse((learnerBlock.props as { data: string }).data)).toEqual({
      instruction: "Fill in the blanks.", passage: null, items: [{ prompt: "Ik zie … hond." }, { prompt: "Translate: I see the dog." }],
    });
    expect(JSON.stringify(document)).not.toContain("Hond is a de-word.");
    expect(references[block.id]!.items[0]).toEqual({ prompt: "Ik zie … hond.", authorsVersion: ["de"], note: "Hond is a de-word." });
  });

  it("keeps vocabulary words, notes included, intact in learner documents", () => {
    const block = vocabulary(word("der Hund", { note: "Masculine." }));
    const { document } = toLearnerDocument(parse(block, practice()));
    expect(document.blocks[0]).toEqual(block);
  });

  it("collects lesson words in reading order with lesson-wide positions", () => {
    const first = word(" der Hund ", { forms: "die Hunde", example: " ", note: "" });
    const second = word("die Katze"); const third = word("das Haus");
    const document = parse(vocabulary(first), columns(column(vocabulary(second)), column(paragraph("x"))), vocabulary(third));
    const words = collectLessonWords(document);
    expect(words.map((entry) => [entry.id, entry.position, entry.blockId])).toEqual([
      [first.id, 0, document.blocks[0]!.id], [second.id, 1, document.blocks[1]!.children[0]!.children[0]!.id], [third.id, 2, document.blocks[2]!.id],
    ]);
    expect(words[0]).toMatchObject({ term: "der Hund", meaning: "meaning of  der Hund ".trim(), forms: "die Hunde", example: null, note: null });
    expect(collectLessonWords(parse(paragraph("x")))).toEqual([]);
  });

  it("validates the course words response", () => {
    const entry = { id: randomUUID(), lessonId: randomUUID(), term: "der Hund", meaning: "the dog", forms: null, example: null, note: null };
    expect(courseWordsResponseSchema.safeParse({ words: [entry] }).success).toBe(true);
    expect(courseWordsResponseSchema.safeParse({ words: [{ ...entry, lessonId: undefined }] }).success).toBe(false);
  });

  it("reports unfinished work that blocks publishing", () => {
    const missing = image("");
    const noAlt = image("media:courses/a.png", " ");
    const empty = { ...example(""), content: [] };
    expect(findPublishProblems(parse(missing, noAlt, empty, image("media:courses/b.png")))).toEqual([
      { blockId: missing.id, problem: "image-missing" },
      { blockId: noAlt.id, problem: "image-alt-missing" },
      { blockId: empty.id, problem: "example-empty" },
    ]);
    const noTerm = word(" "); const noMeaning = word("der Hund", { meaning: "" });
    const words = vocabulary(word("die Katze"), noTerm, noMeaning);
    const problems = findPublishProblems(parse(columns(column(words), column(paragraph("x")))));
    expect(problems).toEqual([
      { blockId: words.id, wordId: noTerm.id, problem: "word-empty" },
      { blockId: words.id, wordId: noMeaning.id, problem: "word-empty" },
    ]);
    expect(lessonNotReadySchema.safeParse({ error: { code: "LESSON_NOT_READY", message: "x" }, problems }).success).toBe(true);
  });

  it("flattens a document into player steps", () => {
    const steps = flattenToSteps(parse(
      paragraph("Intro"),
      paragraph(""),
      heading("Part one"),
      paragraph("Prose A"),
      bullet("Prose B"),
      image("media:courses/a.png"),
      callout("Hint"),
      example("Ich sehe den Hund."),
      paragraph(""),
      heading("Part two"),
      columns(column(paragraph("Left")), column(paragraph("Right"))),
      columns(column(paragraph("Read this")), column(dialogue())),
      practice(),
    ));
    expect(steps.map((step) => [step.kind, step.heading])).toEqual([
      ["content", null],
      ["content", "Part one"],
      ["callout", "Part one"],
      ["example", "Part one"],
      ["columns", "Part two"],
      ["content", "Part two"],
      ["dialogueTurn", "Part two"],
      ["dialogueTurn", "Part two"],
      ["practiceItem", "Part two"],
      ["practiceItem", "Part two"],
    ]);
    const prose = steps[1]!;
    expect(prose.kind === "content" && prose.blocks.map((block) => block.type)).toEqual(["paragraph", "bulletListItem", "image"]);
  });

  it("keys steps by block so a saved position survives unrelated edits", () => {
    const intro = paragraph("Intro"); const talk = dialogue(); const quiz = practice();
    const steps = flattenToSteps(parse(intro, talk, quiz));
    const keys = steps.map(lessonStepKey);
    expect(keys).toEqual([intro.id, `${talk.id}:0`, `${talk.id}:1`, `${quiz.id}:0`, `${quiz.id}:1`]);
    keys.forEach((key) => expect(lessonPositionRequestSchema.safeParse({ stepKey: key }).success).toBe(true));
    expect(lessonPositionRequestSchema.safeParse({ stepKey: "step-1" }).success).toBe(false);
    // A step inserted earlier moves the index but not the key.
    const edited = flattenToSteps(parse(intro, callout("New hint"), talk, quiz));
    expect(resolveStepIndex(edited, `${quiz.id}:0`, 3)).toBe(4);
    // A removed step falls back to its old index, clamped to the lesson.
    expect(resolveStepIndex(edited, `${randomUUID()}:0`, 2)).toBe(2);
    expect(resolveStepIndex(edited, `${randomUUID()}:0`, 40)).toBe(edited.length - 1);
  });
});

describe("new words in player steps", () => {
  const terms = (step: LessonStep) => step.words.map((entry) => entry.term);
  const summary = (steps: LessonStep[]) => steps.map((step) => [step.kind, terms(step)]);

  it("ends a prose step and attaches to it; following prose starts a new step", () => {
    const a = paragraph("Prose A"); const b = paragraph("Prose B"); const words = vocabulary(word("der Hund"));
    const steps = flattenToSteps(parse(a, words, b));
    expect(summary(steps)).toEqual([["content", ["der Hund"]], ["content", []]]);
    expect(steps.map(lessonStepKey)).toEqual([a.id, b.id]);
  });

  it("attaches to a preceding example or callout", () => {
    const steps = flattenToSteps(parse(example("Ich sehe den Hund."), vocabulary(word("sehen")), callout("Hint"), vocabulary(word("der Tipp"))));
    expect(summary(steps)).toEqual([["example", ["sehen"]], ["callout", ["der Tipp"]]]);
  });

  it("spreads over every turn of a dialogue and every item of a practice", () => {
    const steps = flattenToSteps(parse(dialogue(), vocabulary(word("hoi")), practice(), vocabulary(word("zien"))));
    expect(summary(steps)).toEqual([
      ["dialogueTurn", ["hoi"]], ["dialogueTurn", []], ["practiceItem", ["zien"]], ["practiceItem", ["zien"]],
    ]);
    // Each step owns its list, so later words never leak between blocks.
    expect(steps[2]!.words).not.toBe(steps[3]!.words);
  });

  it("shows a dialogue's words on the first turn that uses them and the rest on the last turn", () => {
    const talk = { ...dialogue(), props: { turns: JSON.stringify([
      { speaker: "A", text: "Check je in met je bankpas?" },
      { speaker: "B", text: "Ja. In Amsterdam stappen we over. De bankpas is oud." },
      { speaker: "A", text: "Kijk, de trein! Waar stappen we in?" },
      { speaker: "B", text: "Hier." },
    ]) } };
    const steps = flattenToSteps(parse(talk, vocabulary(
      word("de bankpas"), word("inchecken", { forms: "checkt in · checkte in · ingecheckt" }),
      word("instappen", { forms: "stapt in · stapte in · ingestapt" }), word("overstappen", { forms: "stapt over · stapte over · overgestapt" }),
      word("het perron"), word("stil"),
    ), paragraph("Stiltecoupé.")));
    expect(summary(steps)).toEqual([
      ["dialogueTurn", ["de bankpas", "inchecken"]], ["dialogueTurn", ["overstappen"]], ["dialogueTurn", ["instappen"]],
      ["dialogueTurn", ["het perron", "stil"]], ["content", []],
    ]);
  });

  it("falls back to the next block's steps when nothing precedes it in the section", () => {
    const steps = flattenToSteps(parse(
      vocabulary(word("eins")), example("Eins."),
      heading("Part two"), vocabulary(word("zwei")), paragraph(""), dialogue(),
      example("Drei."), heading("Part three"), vocabulary(word("vier")), paragraph("Vier."),
    ));
    expect(summary(steps)).toEqual([
      ["example", ["eins"]], ["dialogueTurn", []], ["dialogueTurn", ["zwei"]], ["example", []], ["content", ["vier"]],
    ]);
  });

  it("combines consecutive blocks into one list in document order", () => {
    const steps = flattenToSteps(parse(
      vocabulary(word("vorher")), vocabulary(word("davor")), paragraph("Text"), vocabulary(word("eins")), vocabulary(word("zwei"), word("drei")),
    ));
    expect(summary(steps)).toEqual([["content", ["vorher", "davor", "eins", "zwei", "drei"]]]);
  });

  it("turns a words-only section into a words step keyed by its first block", () => {
    const first = vocabulary(word("eins")); const second = vocabulary(word("zwei")); const last = vocabulary(word("drei"));
    const steps = flattenToSteps(parse(heading("Words"), first, paragraph(""), second, heading("Text"), paragraph("x"), heading("More"), last));
    expect(steps.map((step) => [step.kind, step.heading, terms(step)])).toEqual([
      ["words", "Words", ["eins", "zwei"]], ["content", "Text", []], ["words", "More", ["drei"]],
    ]);
    expect(steps.map(lessonStepKey)).toEqual([first.id, expect.any(String), last.id]);
    expect(lessonPositionRequestSchema.safeParse({ stepKey: lessonStepKey(steps[0]!) }).success).toBe(true);
  });

  it("keeps columns read as one step whole and reads interactive columns in leaf order", () => {
    const steps = flattenToSteps(parse(
      columns(column(paragraph("Links"), vocabulary(word("links"))), column(paragraph("Rechts"))), vocabulary(word("danach")),
      columns(column(paragraph("Read"), vocabulary(word("lesen"))), column(dialogue(), vocabulary(word("sprechen")))),
    ));
    expect(summary(steps)).toEqual([
      ["columns", ["links", "danach"]], ["content", ["lesen"]], ["dialogueTurn", []], ["dialogueTurn", ["sprechen"]],
    ]);
  });

  it("never keys a step by a vocabulary block, so adding words keeps saved positions", () => {
    const intro = paragraph("Intro"); const talk = dialogue(); const quiz = practice(); const hint = callout("Hint");
    const keys = flattenToSteps(parse(intro, talk, hint, quiz)).map(lessonStepKey);
    const withWords = flattenToSteps(parse(vocabulary(word("a")), intro, vocabulary(word("b")), talk, vocabulary(word("c")), hint, vocabulary(word("d")), quiz));
    expect(withWords.map(lessonStepKey)).toEqual(keys);
    expect(flattenToSteps(parse(intro, talk)).every((step) => step.words.length === 0)).toBe(true);
  });
});

describe("legacy block upgrade", () => {
  it("upgrades every fixture lesson into a valid document that keeps IDs, order, and content", () => {
    for (const lesson of fixture.lessons) {
      const legacy = lesson.blocks.map((block) => ({ id: randomUUID(), ...block }));
      const document: LessonDocument = upgradeLegacyBlocks(legacy);
      expect(document.blocks.map((block) => block.id)).toEqual(legacy.map((block) => block.id));
      document.blocks.forEach((block, index) => {
        const source = legacy[index]!;
        const payload = source.payload as Record<string, unknown>;
        if (block.type === "heading") expect(inlineText(block.content)).toBe(payload.title);
        if (block.type === "paragraph") expect(inlineText(block.content)).toBe(payload.content);
        if (block.type === "example") expect([inlineText(block.content), block.props.translation]).toEqual([payload.sentence, payload.translation ?? ""]);
        if (block.type === "practice") expect(readPracticeBlock(block)).toEqual(practicePayloadSchema.parse(payload));
      });
    }
  });

  it("rejects unknown legacy kinds", () => {
    expect(() => upgradeLegacyBlocks([{ id: randomUUID(), kind: "poll", payload: {} }])).toThrow();
  });
});
