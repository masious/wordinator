import { LESSON_DOCUMENT_SCHEMA_VERSION, walkLessonBlocks, type LessonBlock, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { describe, expect, it } from "vitest";
import { mergeLessonDocuments } from "./lessonMerge";

const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const textProps = { textColor: "default", backgroundColor: "default", textAlignment: "left" } as const;
const p = (n: number, text = `p${n}`): LessonBlock => ({ id: id(n), type: "paragraph", props: textProps, content: [{ type: "text", text, styles: {} }], children: [] });
const li = (n: number, text: string, children: LessonBlock[] = []) =>
  ({ id: id(n), type: "bulletListItem", props: textProps, content: [{ type: "text", text, styles: {} }], children }) as LessonBlock;
const columns = (n: number, ...cols: LessonBlock[][]) => ({
  id: id(n), type: "columnList", props: {}, children: cols.map((children, index) => ({ id: id(n + 1 + index), type: "column", props: { width: 1 }, children })),
}) as LessonBlock;
const doc = (...blocks: LessonBlock[]): LessonDocument => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks } as LessonDocument);
const texts = (document: LessonDocument): string[] => [...walkLessonBlocks(document.blocks)].map(({ block }) =>
  Array.isArray(block.content) ? block.content.map((item) => item.type === "text" ? item.text : "").join("") : block.type);

describe("lesson merge", () => {
  const base = doc(p(1), p(2), p(3));

  it("merges edits to different blocks without asking", () => {
    const result = mergeLessonDocuments(base, doc(p(1, "mine"), p(2), p(3)), doc(p(1), p(2), p(3, "theirs")))!;
    expect(texts(result.document)).toEqual(["mine", "p2", "theirs"]);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps additions from both sides in place", () => {
    const result = mergeLessonDocuments(base, doc(p(1), p(10, "new mine"), p(2), p(3)), doc(p(1), p(2), p(3), p(11, "new theirs")))!;
    expect(texts(result.document)).toEqual(["p1", "new mine", "p2", "p3", "new theirs"]);
    expect(result.conflicts).toEqual([]);
  });

  it("applies a local move to a block the other side edited", () => {
    const result = mergeLessonDocuments(base, doc(p(3), p(1), p(2)), doc(p(1), p(2, "edited"), p(3)))!;
    expect(texts(result.document)).toEqual(["p3", "p1", "edited"]);
    expect(result.conflicts).toEqual([]);
  });

  it("applies a server move to a block edited locally", () => {
    const result = mergeLessonDocuments(base, doc(p(1, "edited"), p(2), p(3)), doc(p(2), p(3), p(1)))!;
    expect(texts(result.document)).toEqual(["p2", "p3", "edited"]);
    expect(result.conflicts).toEqual([]);
  });

  it("lets a deletion of an unchanged block win on either side", () => {
    const result = mergeLessonDocuments(base, doc(p(1), p(3)), doc(p(1), p(2), p(3, "theirs")))!;
    expect(texts(result.document)).toEqual(["p1", "theirs"]);
    expect(mergeLessonDocuments(base, doc(p(1, "mine"), p(2), p(3)), doc(p(1), p(3)))!.document.blocks.map((block) => block.id)).toEqual([id(1), id(3)]);
  });

  it("asks when one side deleted a block the other edited, keeping the edit until then", () => {
    const deletedLocally = mergeLessonDocuments(base, doc(p(1), p(3)), doc(p(1), p(2, "theirs"), p(3)))!;
    expect(texts(deletedLocally.document)).toEqual(["p1", "theirs", "p3"]);
    expect(deletedLocally.conflicts).toEqual([{ blockId: id(2), local: null, server: p(2, "theirs") }]);

    const deletedOnServer = mergeLessonDocuments(base, doc(p(1), p(2, "mine"), p(3)), doc(p(1), p(3)))!;
    expect(texts(deletedOnServer.document)).toEqual(["p1", "mine", "p3"]);
    expect(deletedOnServer.conflicts).toEqual([{ blockId: id(2), local: p(2, "mine"), server: null }]);
  });

  it("asks when both sides edited the same block differently, showing the newer version", () => {
    const result = mergeLessonDocuments(base, doc(p(1), p(2, "mine"), p(3)), doc(p(1), p(2, "theirs"), p(3)))!;
    expect(texts(result.document)).toEqual(["p1", "theirs", "p3"]);
    expect(result.conflicts).toEqual([{ blockId: id(2), local: p(2, "mine"), server: p(2, "theirs") }]);
  });

  it("asks side by side when both sides edited the same New words block", () => {
    const words = (meaning: string) => ({ id: id(20), type: "vocabulary", props: { data: JSON.stringify({ words: [{ id: id(21), term: "het huis", meaning }] }) }, children: [] }) as LessonBlock;
    const result = mergeLessonDocuments(doc(p(1), words("house")), doc(p(1), words("the house")), doc(p(1, "edited"), words("home")))!;
    expect(texts(result.document)).toEqual(["edited", "vocabulary"]);
    expect(result.conflicts).toEqual([{ blockId: id(20), local: words("the house"), server: words("home") }]);
  });

  it("does not ask when both sides made the same edit", () => {
    const result = mergeLessonDocuments(base, doc(p(1), p(2, "same"), p(3)), doc(p(1), p(2, "same"), p(3)))!;
    expect(result.conflicts).toEqual([]);
    expect(texts(result.document)).toEqual(["p1", "same", "p3"]);
  });

  it("merges inside lists and keeps a child whose parent the other side deleted", () => {
    const listBase = doc(li(1, "a", [li(2, "a.1")]), p(3));
    const local = doc(li(1, "a", [li(2, "a.1"), li(4, "a.2")]), p(3));
    const server = doc(p(3));
    const result = mergeLessonDocuments(listBase, local, server)!;
    expect(texts(result.document)).toEqual(["a.2", "p3"]);
    expect(result.conflicts).toEqual([]);
  });

  it("merges inside columns and lifts blocks out of a column list the other side removed", () => {
    const columnBase = doc(columns(1, [p(10)], [p(11)]), p(20));
    const local = doc(columns(1, [p(10), p(12, "added")], [p(11)]), p(20));
    const server = doc(p(20));
    const result = mergeLessonDocuments(columnBase, local, server)!;
    expect(texts(result.document)).toEqual(["added", "p20"]);
    const both = mergeLessonDocuments(columnBase, local, doc(columns(1, [p(10)], [p(11, "theirs")]), p(20)))!;
    expect(texts(both.document)).toEqual(["columnList", "column", "p10", "added", "column", "theirs", "p20"]);
  });

  it("does not count editor defaults missing from a stored document as edits", () => {
    const stored = (n: number, text?: string) => { const block = p(n, text); return { ...block, props: { textColor: "default", backgroundColor: "default" } } as LessonBlock; };
    const result = mergeLessonDocuments(doc(stored(1), stored(2)), doc(p(1), p(2, "mine")), doc(p(1, "theirs"), p(2)))!;
    expect(texts(result.document)).toEqual(["theirs", "mine"]);
    expect(result.conflicts).toEqual([]);
  });
});
