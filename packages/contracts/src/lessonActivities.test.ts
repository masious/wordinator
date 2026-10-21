import { describe, expect, it } from "vitest";
import { emptyLessonDocument, type LessonBlock, type LessonDocument } from "./lessonDocument";
import { gradeLessonActivityAnswer, lessonActivityPayloadSchema, lessonActivityViewSchema, normalizeLessonActivityText, resolveLessonActivitySources, toLessonActivityView, verifyLessonActivitySource } from "./lessonActivities";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const props = { textColor: "default" as const, backgroundColor: "default" as const };
const heading = (id: number, text: string, level: 1 | 2 | 3): LessonBlock => ({ id: uid(id), type: "heading", props: { ...props, level }, content: [{ type: "text", text }], children: [] };
const para = (id: number, text: string): LessonBlock => ({ id: uid(id), type: "paragraph", props, content: [{ type: "text", text }], children: [] };

describe("lesson activity contracts", () => {
  it("strips private answer references from activity views and grades from payload", () => {
    const payload = lessonActivityPayloadSchema.parse({
      type: "quick_grammar", recipeVersion: 1, schemaVersion: 1,
      question: { id: uid(1), kind: "choice", prompt: "Choose.", options: [{ id: uid(2), text: "A" }, { id: uid(3), text: "B" }, { id: uid(4), text: "C" }], correctOptionId: uid(3), explanation: "B is used here." },
    });
    const view = toLessonActivityView({ id: uid(10), sourceId: uid(11), sourceLabel: "Grammar", sourceFingerprint: "0123456789abcdef", payload });
    expect(lessonActivityViewSchema.parse(view).payload).not.toHaveProperty("question.correctOptionId");
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "choice", optionId: uid(3) })?.correct).toBe(true);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "choice", optionId: uid(2) })?.correct).toBe(false);
    expect(gradeLessonActivityAnswer(payload, uid(999), { kind: "choice", optionId: uid(3) })).toBeNull();
  });

  it("normalizes bounded text and grades fill and ordering from stored references", () => {
    expect(normalizeLessonActivityText("  IK\twoon  ")).toBe("ik woon");
    const fill = { type: "tricky_grammar", recipeVersion: 1, schemaVersion: 1, questions: [
      { id: uid(1), kind: "fill_in", prompt: "Ik … hier.", referenceAnswers: ["woon"], explanation: "Present tense." },
      ...[2, 3, 4].map((n) => ({ id: uid(n), kind: "choice", prompt: "Pick", options: [1, 2, 3].map((x) => ({ id: uid(n * 10 + x), text: `Option ${x}` })), correctOptionId: uid(n * 10 + 1), explanation: "Because." })),
    ] } as const;
    const payload = lessonActivityPayloadSchema.parse(fill);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "text", text: " WOON " })?.correct).toBe(true);
    expect(gradeLessonActivityAnswer(payload, uid(1), { kind: "text", text: "ga" })?.correct).toBe(false);
  });

  it("resolves prefix sections, grammar subsections, multiple eligible dialogue sources and lesson end deterministically", () => {
    const doc = {
      ...emptyLessonDocument(), blocks: [
        para(1, "Introductory content"), heading(2, "Story", 1), para(3, "Story text"),
        { id: uid(4), type: "dialogue", props: { turns: JSON.stringify({ turns: [
          { speaker: "Sofia", text: "Hallo." }, { speaker: "Mira", text: "Goedemorgen." },
        ] }) }, content: undefined, children: [] },
        { id: uid(5), type: "dialogue", props: { turns: JSON.stringify({ turns: [
          { speaker: " Sofia ", text: "Dag." }, { speaker: "Jan", text: "Hoi." },
        ] }) }, content: undefined, children: [] },
        heading(6, "Grammar", 1), { id: uid(7), type: "callout", props: { variant: "grammar", icon: "auto" }, content: [{ type: "text", text: "Word order" }], children: [] },
        heading(8, "Inversion", 3), para(9, "A rule"), heading(10, "Summary", 2), para(11, "End"),
      ],
    } as unknown as LessonDocument;
    const first = resolveLessonActivitySources({ document: doc, title: "Lesson" });
    const again = resolveLessonActivitySources({ document: doc, title: "Lesson" });
    expect(first).toEqual(again);
    expect(first.some((source) => source.sourceId === "intro")).toBe(true);
    expect(first.filter((source) => source.sourceKind === "dialogue")).toHaveLength(2);
    expect(first.find((source) => source.sourceId === uid(8))?.activityTypes).toContain("quick_grammar");
    expect(first.find((source) => source.sourceId === "lesson_end")?.activityTypes).toContain("mixed_practice");
    const dialogue = first.find((source) => source.sourceKind === "dialogue")!;
    expect(verifyLessonActivitySource(first, dialogue.sourceId, "roleplay", dialogue.fingerprint)).toEqual(dialogue);
    expect(verifyLessonActivitySource(first, dialogue.sourceId, "roleplay", "0000000000000000")).toBeNull();
  });

  it("never offers role-play unless Sofia and a partner both have original turns", () => {
    const doc = { ...emptyLessonDocument(), blocks: [heading(1, "Story", 1), { id: uid(2), type: "dialogue", props: { turns: JSON.stringify({ turns: [{ speaker: "Anna", text: "Hi" }, { speaker: "Mira", text: "Hello" }] }) }, content: undefined, children: [] }] } as unknown as LessonDocument;
    expect(resolveLessonActivitySources({ document: doc }).some((source) => source.activityTypes.includes("roleplay"))).toBe(false);
  });
});
