import { describe, expect, it } from "vitest";
import { breaksColumnRules, lessonImagePath, normalizeEditorBlocks, sanitizeEditorBlock, toLessonDocument, vocabularyIdRepairs, type EditorBlock } from "./lessonDraft";

const image = (previewWidth?: number) => ({
  id: "50000000-0000-4000-8000-000000000001", type: "image", children: [],
  props: { textAlignment: "left", backgroundColor: "default", name: "Een keuken", url: "https://media.test/k.jpg", caption: "", showPreview: true, previewWidth },
});

describe("Editor output normalisation", () => {
  it("rounds image preview widths so resized images still save", () => {
    expect(normalizeEditorBlocks([image(412.6)])[0]!.props!.previewWidth).toBe(413);
    expect(toLessonDocument([image(412.6)]).success).toBe(true);
    expect(toLessonDocument([image()]).success).toBe(true);
  });
});

const paragraph = (n: number, children: EditorBlock[] = []): EditorBlock => ({
  id: `50000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, type: "paragraph",
  props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text: `Zin ${n}`, styles: {} }], children,
});
const column = (n: number, children: EditorBlock[]): EditorBlock => ({ id: `50000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`, type: "column", props: { width: 1 }, children });
const columns = (n: number, children: EditorBlock[]): EditorBlock => ({ id: `50000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`, type: "columnList", props: {}, children });

describe("Column rules in the editor", () => {
  it("accepts two and three top-level columns as they are", () => {
    const three = columns(1, [column(1, [paragraph(1)]), column(2, [paragraph(2)]), column(3, [paragraph(3)])]);
    expect(breaksColumnRules(three)).toBe(false);
    expect(normalizeEditorBlocks([three])).toEqual([three]);
    expect(toLessonDocument([three]).success).toBe(true);
  });

  it("finds a fourth column and keeps its blocks after the first three", () => {
    const four = columns(1, [1, 2, 3, 4].map((n) => column(n, [paragraph(n)])));
    expect(breaksColumnRules(four)).toBe(true);
    const repaired = normalizeEditorBlocks([four]);
    expect(repaired.map((block) => block.type)).toEqual(["columnList", "paragraph"]);
    expect(repaired[0]!.children).toHaveLength(3);
    expect(repaired.some(breaksColumnRules)).toBe(false);
    expect(toLessonDocument([four]).success).toBe(true);
  });

  it("finds columns inside a column or a list and unwraps them in place", () => {
    const inner = columns(2, [column(4, [paragraph(4)]), column(5, [paragraph(5)])]);
    const nested = columns(1, [column(1, [paragraph(1), inner]), column(2, [paragraph(2)])]);
    expect(breaksColumnRules(nested)).toBe(true);
    expect(normalizeEditorBlocks([nested])[0]!.children![0]!.children!.map((block) => block.id)).toEqual([paragraph(1).id, paragraph(4).id, paragraph(5).id]);
    const list: EditorBlock = { ...paragraph(6, [inner]), type: "bulletListItem" };
    expect(breaksColumnRules(list)).toBe(true);
    expect(normalizeEditorBlocks([list]).some(breaksColumnRules)).toBe(false);
  });
});

describe("Pasted content repair", () => {
  const path = lessonImagePath("c1", "l1");
  const paragraph = (content: unknown[], props: Record<string, unknown> = { textColor: "default", backgroundColor: "default", textAlignment: "left" }): EditorBlock =>
    ({ id: "50000000-0000-4000-8000-000000000002", type: "paragraph", props, content, children: [] });

  it("leaves allowed content untouched", () => {
    const block = paragraph([{ type: "text", text: "Hoi", styles: { bold: true, textColor: "red" } }, { type: "link", href: "https://example.com", content: [{ type: "text", text: "link", styles: {} }] }]);
    expect(sanitizeEditorBlock(block, path)).toBe(block);
  });

  it("unwraps unsafe links and drops colours outside the palette and alignment", () => {
    const block = paragraph([
      { type: "link", href: "javascript:alert(1)", content: [{ type: "text", text: "klik", styles: { italic: true } }] },
      { type: "link", href: "mailto:a@b.test", content: [{ type: "text", text: " mail", styles: {} }] },
      { type: "text", text: " rood", styles: { textColor: "#ff0000", backgroundColor: "yellow" } },
    ], { textColor: "rgb(1, 2, 3)", backgroundColor: "default", textAlignment: "center" });
    const clean = sanitizeEditorBlock(block, path)!;
    expect(clean.content).toEqual([
      { type: "text", text: "klik", styles: { italic: true } }, { type: "text", text: " mail", styles: {} }, { type: "text", text: " rood", styles: { backgroundColor: "yellow" } },
    ]);
    expect(clean.props).toEqual({ textColor: "default", backgroundColor: "default", textAlignment: "left" });
    expect(toLessonDocument([clean]).success).toBe(true);
  });

  it("removes images hosted anywhere but this lesson, and keeps uploads in progress", () => {
    const at = (url: string) => ({ ...image(), props: { ...image().props, url } });
    expect(sanitizeEditorBlock(at("https://elsewhere.test/k.jpg"), path)).toBeNull();
    expect(sanitizeEditorBlock(at("https://media.test/courses/c2/lessons/l1/k.jpg"), path)).toBeNull();
    const own = at("https://media.test/courses/c1/lessons/l1/k.jpg");
    expect(sanitizeEditorBlock(own, path)).toBe(own);
    const pending = at("");
    expect(sanitizeEditorBlock(pending, path)).toBe(pending);
  });

  it("repairs nested list items", () => {
    const child = { ...paragraph([{ type: "link", href: "ftp://x.test", content: [{ type: "text", text: "x", styles: {} }] }]), type: "bulletListItem" };
    const parent: EditorBlock = { ...paragraph([{ type: "text", text: "a", styles: {} }]), id: "50000000-0000-4000-8000-000000000003", type: "bulletListItem", children: [child] };
    expect(sanitizeEditorBlock(parent, path)!.children![0]!.content).toEqual([{ type: "text", text: "x", styles: {} }]);
  });
});

const word = (n: number, term = `woord ${n}`) => ({ id: `70000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`, term, meaning: `word ${n}` });
const vocabulary = (n: number, words: ReturnType<typeof word>[]): EditorBlock => ({
  id: `50000000-0000-4000-8000-0000000004${String(n).padStart(2, "0")}`, type: "vocabulary", props: { data: JSON.stringify({ words }) }, children: [],
});

describe("New words in the editor", () => {
  it("leaves vocabulary blocks untouched when repairing pasted content", () => {
    const block = vocabulary(1, [{ ...word(1), forms: "de woorden" } as ReturnType<typeof word>]);
    expect(sanitizeEditorBlock(block, lessonImagePath("c", "l"))).toBe(block);
    expect(toLessonDocument([block]).success).toBe(true);
  });

  it("gives a pasted or duplicated block fresh word IDs and keeps the first block's IDs", () => {
    const original = vocabulary(1, [word(1), word(2)]);
    const copy = vocabulary(2, [word(1), word(3)]);
    const inColumns = columns(1, [column(1, [paragraph(1)]), column(2, [vocabulary(3, [word(2)])])]);
    expect(toLessonDocument([original, copy]).success).toBe(false);
    let next = 0;
    const repairs = vocabularyIdRepairs([original, copy, inColumns], () => `80000000-0000-4000-8000-00000000000${++next}`);
    expect(repairs).toEqual([
      { id: copy.id, data: JSON.stringify({ words: [{ ...word(1), id: "80000000-0000-4000-8000-000000000001" }, word(3)] }) },
      { id: "50000000-0000-4000-8000-000000000403", data: JSON.stringify({ words: [{ ...word(2), id: "80000000-0000-4000-8000-000000000002" }] }) },
    ]);
    expect(vocabularyIdRepairs([original, vocabulary(2, [word(3)])])).toEqual([]);
  });
});
