import { describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";
import {
  answerMatches, COURSE_DIALOGUE_TURNS_MAX, COURSE_PRACTICE_ITEMS_MAX, COURSE_SPEAKER_MAX, courseBlockContentSchema, courseBlockKindSchema, courseInputSchema,
  lessonInputSchema, practicePayloadSchema, practiceProgressRequestSchema, reorderRequestSchema, splitPracticePayload, updateLessonRequestSchema,
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

  it("normalizes lesson details and rejects malformed reorder lists", () => {
    expect(lessonInputSchema.parse({ title: "Mijn huis", goal: "" })).toEqual({ title: "Mijn huis", goal: null });
    // Publishing is its own endpoint now, so lesson details carry neither a published flag nor a version.
    expect(updateLessonRequestSchema.parse({ title: "Mijn huis", goal: null, published: true, version: 2 })).toEqual({ title: "Mijn huis", goal: null });
    expect(() => reorderRequestSchema.parse({ ids: ["not-an-id"] })).toThrow();
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
  });

  it("matches answers to the author's version, ignoring case, punctuation, and spacing", () => {
    const open = { prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] };
    expect(answerMatches(open, "er is   een „tuin“")).toBe(true);
    expect(answerMatches(open, "Er is een tuin!")).toBe(true);
    expect(answerMatches(open, "Een tuin is er.")).toBe(false);
    expect(answerMatches(open, " ")).toBe(false);
    expect(answerMatches({ prompt: "There is a garden.", authorsVersion: [] }, "Er is een tuin.")).toBe(false);
    const fill = { prompt: "… een kleine keuken, … drie kamers.", authorsVersion: ["Er is", "er zijn"] };
    expect(answerMatches(fill, "er is, er zijn")).toBe(true);
    expect(answerMatches(fill, "Er is een kleine keuken, er zijn drie kamers.")).toBe(true);
    expect(answerMatches(fill, "er is")).toBe(false);
    expect(answerMatches({ prompt: "… een … keuken.", authorsVersion: ["Er is", null] }, "Er is")).toBe(false);
  });

  it("accepts a practice progress count within the practice item limit", () => {
    expect(practiceProgressRequestSchema.parse({ answered: 0 })).toEqual({ answered: 0 });
    expect(practiceProgressRequestSchema.parse({ answered: 50 })).toEqual({ answered: 50 });
    for (const answered of [-1, 1.5, 51, "2"]) expect(practiceProgressRequestSchema.safeParse({ answered }).success).toBe(false);
    expect(practiceProgressRequestSchema.safeParse({}).success).toBe(false);
  });
});
