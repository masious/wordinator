import { describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";
import {
  COURSE_BLOCK_PAYLOAD_VERSION, COURSE_DIALOGUE_TURNS_MAX, COURSE_PRACTICE_ITEMS_MAX, COURSE_SPEAKER_MAX, courseBlockContentSchema, courseBlockKindSchema,
  courseBlockSchema, courseInputSchema, createBlockRequestSchema, createPracticeCommentRequestSchema, lessonInputSchema, parseStoredBlockPayload,
  practicePayloadSchema, reorderRequestSchema, splitPracticePayload, updateBlockRequestSchema, updatePracticeCommentRequestSchema,
} from ".";

const fixtureBlocks = fixture.lessons.flatMap((lesson) => lesson.blocks);

describe("course block contracts", () => {
  it("validates each content kind and normalizes empty optional fields", () => {
    expect(courseBlockContentSchema.parse({ kind: "heading", payload: { title: " Er is en er zijn " } })).toEqual({ kind: "heading", payload: { title: "Er is en er zijn" } });
    expect(courseBlockContentSchema.parse({ kind: "example", payload: { sentence: "Er is een balkon.", translation: "", note: null } }))
      .toEqual({ kind: "example", payload: { sentence: "Er is een balkon.", translation: null, note: null } });
    expect(() => courseBlockContentSchema.parse({ kind: "text", payload: { content: "  " } })).toThrow();
    expect(() => courseBlockContentSchema.parse({ kind: "heading", payload: { title: "x".repeat(201) } })).toThrow();
    expect(() => courseBlockContentSchema.parse({ kind: "dialogue", payload: { turns: [] } })).toThrow();
    expect(() => courseBlockContentSchema.parse({ kind: "dialogue", payload: { turns: [{ speaker: "x".repeat(COURSE_SPEAKER_MAX + 1), text: "Hallo" }] } })).toThrow();
    expect(() => courseBlockContentSchema.parse({ kind: "dialogue", payload: { turns: Array.from({ length: COURSE_DIALOGUE_TURNS_MAX + 1 }, () => ({ speaker: "A", text: "Hoi" })) } })).toThrow();
    expect(() => courseBlockContentSchema.parse({ kind: "practice", payload: { instruction: "x", items: [] } })).toThrow();
  });

  it("requires a version for updates and defaults new blocks to unpublished", () => {
    expect(createBlockRequestSchema.parse({ kind: "text", payload: { content: "Hallo" } })).toMatchObject({ published: false });
    expect(() => updateBlockRequestSchema.parse({ kind: "text", payload: { content: "Hallo" }, published: true })).toThrow();
    expect(() => updateBlockRequestSchema.parse({ kind: "text", payload: { content: "Hallo" }, published: true, version: 0 })).toThrow();
    expect(lessonInputSchema.parse({ title: "Mijn huis", goal: "" })).toEqual({ title: "Mijn huis", goal: null });
    expect(() => reorderRequestSchema.parse({ ids: ["not-an-id"] })).toThrow();
  });

  it("parses stored payloads by payload version and rejects unknown versions", () => {
    const stored = { sentence: "Is er een tuin?", translation: "Is there a garden?", note: null };
    expect(parseStoredBlockPayload("example", COURSE_BLOCK_PAYLOAD_VERSION, stored)).toEqual({ kind: "example", payload: stored });
    expect(parseStoredBlockPayload("example", COURSE_BLOCK_PAYLOAD_VERSION + 1, stored)).toBeNull();
    expect(parseStoredBlockPayload("example", COURSE_BLOCK_PAYLOAD_VERSION, { title: "wrong shape" })).toBeNull();
    expect(parseStoredBlockPayload("unknown", COURSE_BLOCK_PAYLOAD_VERSION, stored)).toBeNull();
  });

  it("accepts the normalized acceptance fixture", () => {
    expect(courseInputSchema.parse(fixture.course).title).toBe("Dutch Foundations — Part III: Home and Surroundings");
    expect(fixture.lessons).toHaveLength(6);
    for (const lesson of fixture.lessons) expect(lessonInputSchema.safeParse(lesson).success).toBe(true);
    expect(fixtureBlocks.length).toBeGreaterThan(30);
    expect(fixtureBlocks.every((block) => courseBlockKindSchema.safeParse(block.kind).success)).toBe(true);
    expect(fixtureBlocks.filter((block) => block.kind === "practice")).toHaveLength(6);
    for (const block of fixtureBlocks) expect(courseBlockContentSchema.safeParse(block).success, JSON.stringify(block)).toBe(true);
    // Sections became heading blocks and blanks use the single-character ellipsis.
    expect(fixture.lessons[0]!.blocks[0]).toEqual({ kind: "heading", payload: { title: "Er is en er zijn" } });
    expect(JSON.stringify(fixture)).not.toContain("___");
  });

  it("applies the fill-in and open rules to practice items", () => {
    const practice = (items: unknown[], extra: object = {}) => practicePayloadSchema.safeParse({ instruction: "Vul in.", items, ...extra });
    expect(practice([{ prompt: "… een tuin en … een balkon.", authorsVersion: ["Er is", null] }]).success).toBe(true);
    expect(practice([{ prompt: "… een tuin en … een balkon.", authorsVersion: ["Er is"] }]).success).toBe(false);
    expect(practice([{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin.", "Er is een tuin!"] }]).success).toBe(false);
    expect(practice([{ prompt: "x".repeat(1_001) }]).success).toBe(false);
    expect(practice(Array.from({ length: COURSE_PRACTICE_ITEMS_MAX + 1 }, () => ({ prompt: "Hoi" }))).success).toBe(false);
    // An all-empty author's version means there is none, and an absent passage is null.
    expect(practicePayloadSchema.parse({ instruction: "Vertaal.", items: [{ prompt: "… huis", authorsVersion: [" "], note: "" }] }))
      .toEqual({ instruction: "Vertaal.", passage: null, items: [{ prompt: "… huis", authorsVersion: [], note: null }] });
    expect(practice([{ prompt: "Waar?" }], { passage: { title: "", content: "Het huis is groot." } }).data?.passage).toEqual({ title: null, content: "Het huis is groot." });
  });

  it("separates the learner payload from the reference", () => {
    const payload = practicePayloadSchema.parse({ instruction: "Vertaal.", items: [{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."], note: "Word order" }] });
    const split = splitPracticePayload(payload);
    expect(split.payload).toEqual({ instruction: "Vertaal.", passage: null, items: [{ prompt: "There is a garden." }] });
    expect(JSON.stringify(split.payload)).not.toContain("Er is een tuin.");
    expect(split.reference.items[0]).toEqual({ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."], note: "Word order" });
    const block = { id: crypto.randomUUID(), lessonId: crypto.randomUUID(), position: 0, published: true, version: 1, updatedBy: { id: crypto.randomUUID(), displayName: "A" }, updatedAt: 1 };
    expect(courseBlockSchema.safeParse({ ...block, kind: "practice", ...split, reference: null, answerCount: 0 }).success).toBe(true);
  });

  it("accepts practice answer sets and plain-text replies only", () => {
    expect(createPracticeCommentRequestSchema.parse({ kind: "practice_response", answers: ["Er is", ""] }).kind).toBe("practice_response");
    expect(createPracticeCommentRequestSchema.safeParse({ kind: "practice_response", answers: [] }).success).toBe(false);
    expect(createPracticeCommentRequestSchema.safeParse({ kind: "fill_response", answers: ["x"] }).success).toBe(false);
    expect(updatePracticeCommentRequestSchema.parse({ kind: "text", body: "Goed!", parentId: crypto.randomUUID() })).toEqual({ kind: "text", body: "Goed!" });
  });
});
