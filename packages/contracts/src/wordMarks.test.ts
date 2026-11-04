import { describe, expect, it } from "vitest";
import { lessonDocumentSchema } from "./lessonDocument";
import { currentWordMarks, resolveWordMarks, wordMarkFingerprint, wordMarkKey, wordMarkTexts, wordMarkTokens } from "./wordMarks";

const id = (n: number) => `92000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = (value: string) => [{ type: "text", text: value, styles: {} }];
const document = lessonDocumentSchema.parse({ schemaVersion: 2, blocks: [
  { id: id(1), type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: text("Ik sta om zeven uur op."), children: [] },
  { id: id(2), type: "dialogue", props: { turns: JSON.stringify([{ speaker: "Daan", text: "Waar kom je vandaan?" }]) }, content: undefined, children: [] },
  { id: id(3), type: "vocabulary", props: { data: JSON.stringify({ words: [
    { id: id(10), term: "opstaan", meaning: "to get up", example: "Ik sta vroeg op." },
    { id: id(11), term: "Waar kom je vandaan?", meaning: "Where are you from?" },
  ] }) }, content: undefined, children: [] },
] });

describe("word marks", () => {
  it("lists every markable text", () => {
    expect(wordMarkTexts(document).map((entry) => wordMarkKey(entry.blockId, entry.field)))
      .toEqual([`${id(1)}|content`, `${id(2)}|turn:0`, `${id(3)}|word:${id(10)}:example`]);
  });

  it("resolves token indices into parts and keeps them while the text is unchanged", () => {
    const { marks, problems } = resolveWordMarks(document, [
      { blockId: id(1), field: "content", word: id(10), tokens: [1, 5], color: "blue" },
      { blockId: id(2), field: "turn:0", word: id(11), tokens: [0, 1, 2, 3] },
    ]);
    expect(problems).toEqual([]);
    expect(marks.fields[0]!.marks[0]!.parts).toEqual([[3, 6], [20, 22]]);
    expect(marks.fields[1]!.marks[0]).toEqual({ wordId: id(11), parts: [[0, 19]], color: null });
    expect(currentWordMarks(document, marks).size).toBe(2);
    const stale = { ...marks, fields: marks.fields.map((field, index) => index ? field : { ...field, fingerprint: wordMarkFingerprint("changed") }) };
    expect([...currentWordMarks(document, stale).keys()]).toEqual([`${id(2)}|turn:0`]);
  });

  it("reports marks that do not fit", () => {
    const { problems } = resolveWordMarks(document, [
      { blockId: id(1), field: "content", word: id(99), tokens: [0] },
      { blockId: id(1), field: "content", word: id(10), tokens: [40] },
      { blockId: id(1), field: "note", word: id(10), tokens: [0] },
    ]);
    expect(problems).toHaveLength(3);
  });

  it("numbers words, keeping inner apostrophes", () => {
    expect(wordMarkTokens("Foto's, z'n ov-chipkaart!").map((token) => token.text)).toEqual(["Foto's", "z'n", "ov", "chipkaart"]);
  });
});
