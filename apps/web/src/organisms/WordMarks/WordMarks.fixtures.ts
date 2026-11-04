import { LESSON_DOCUMENT_SCHEMA_VERSION, lessonDocumentSchema, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { wordMarkFingerprint, type LessonWordMarks } from "@wordinator/contracts/word-marks";

// Fixtures for the word mark tests.
export const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = (value: string, styles: Record<string, unknown> = {}) => ({ type: "text" as const, text: value, styles });
const plain = { textColor: "default", backgroundColor: "default" } as const;
export const opstaan = { id: id(10), term: "opstaan", meaning: "to get up", forms: "stond op", ipa: "ɔpstaːn" };
export const waar = { id: id(11), term: "de waar", meaning: "goods" };
export const sentence = "Ik sta vroeg op";
export const document: LessonDocument = lessonDocumentSchema.parse({
  schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION,
  blocks: [
    { id: id(1), type: "paragraph", props: plain, content: [text("Ik "), text("sta", { bold: true }), text(" vroeg op")], children: [] },
    { id: id(2), type: "paragraph", props: plain, content: [text("Waar "), text("kom", { bold: true }), text(" je")], children: [] },
    { id: id(3), type: "vocabulary", props: { data: JSON.stringify({ words: [opstaan, waar] }) }, children: [] },
  ],
});
export const field = (blockId: string, value: string, marks: LessonWordMarks["fields"][number]["marks"], fingerprint = wordMarkFingerprint(value)) =>
  ({ blockId, field: "content", fingerprint, marks });
export const stored: LessonWordMarks = { version: 1, fields: [
  field(id(1), sentence, [{ wordId: opstaan.id, parts: [[3, 6], [13, 15]], color: "red" }]),
  field(id(2), "Waar kom je", [{ wordId: waar.id, parts: [[0, 8]], color: null }]),
] };

