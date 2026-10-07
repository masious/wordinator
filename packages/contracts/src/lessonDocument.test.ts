import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";
import { COURSE_BLOCKS_MAX, practicePayloadSchema } from ".";
import {
  collectImageUrls, collectPracticeIds, findPublishProblems, flattenToSteps, inlineText, LESSON_DOCUMENT_SCHEMA_VERSION, lessonDocumentSchema,
  lessonPositionRequestSchema, lessonStepKey, mapImageUrls, parseStoredLessonDocument, readPracticeBlock, resolveStepIndex, saveLessonDraftRequestSchema,
  toLearnerDocument, upgradeLegacyBlocks,
  type LessonDocument,
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

  it("reports unfinished work that blocks publishing", () => {
    const missing = image("");
    const noAlt = image("media:courses/a.png", " ");
    const empty = { ...example(""), content: [] };
    expect(findPublishProblems(parse(missing, noAlt, empty, image("media:courses/b.png")))).toEqual([
      { blockId: missing.id, problem: "image-missing" },
      { blockId: noAlt.id, problem: "image-alt-missing" },
      { blockId: empty.id, problem: "example-empty" },
    ]);
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
