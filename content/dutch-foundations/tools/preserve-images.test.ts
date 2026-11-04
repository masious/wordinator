// Run: apps/api/node_modules/.bin/tsx --test content/dutch-foundations/tools/preserve-images.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { preserveImages } from "./preserve-images";

type Block = { id: string; type: string; children?: Block[] };
const block = (id: string, type = "paragraph", children: Block[] = []): Block => ({ id, type, children });
const image = (id: string) => block(id, "image");
const ids = (blocks: Block[]): string[] => blocks.flatMap((item) => [item.id, ...ids(item.children ?? [])]);

test("puts stored images back after the block they followed", () => {
  const stored = { blocks: [block("h"), image("cover"), block("dialogue"), block("p"), image("end")] };
  const file = { blocks: [block("h"), block("dialogue"), block("new"), block("p")] };
  const result = preserveImages(stored, file);
  assert.deepEqual(ids(result.document.blocks), ["h", "cover", "dialogue", "new", "p", "end"]);
  assert.equal(result.preserved, 2);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(ids(file.blocks), ["h", "dialogue", "new", "p"], "the input is not changed");
});

test("keeps the stored order of images that share an anchor, and a leading image first", () => {
  const stored = { blocks: [image("first"), block("a"), image("one"), image("two"), block("b")] };
  const result = preserveImages(stored, { blocks: [block("a"), block("b")] });
  assert.deepEqual(ids(result.document.blocks), ["first", "a", "one", "two", "b"]);
});

test("places nested images under the same parent", () => {
  const stored = { blocks: [block("cols", "columnList", [block("col", "column", [block("x"), image("pic")])])] };
  const result = preserveImages(stored, { blocks: [block("cols", "columnList", [block("col", "column", [block("x"), block("y")])])] });
  assert.deepEqual(ids(result.document.blocks), ["cols", "col", "x", "pic", "y"]);
});

test("falls back to the following block when the previous one is gone", () => {
  const stored = { blocks: [block("old"), image("pic"), block("b")] };
  const result = preserveImages(stored, { blocks: [block("a"), block("b")] });
  assert.deepEqual(ids(result.document.blocks), ["a", "pic", "b"]);
});

test("leaves images the file already holds alone", () => {
  const stored = { blocks: [block("a"), image("pic")] };
  const result = preserveImages(stored, { blocks: [image("pic"), block("a")] });
  assert.deepEqual(ids(result.document.blocks), ["pic", "a"]);
  assert.equal(result.preserved, 0);
});

test("puts back an image whose ID the file gave to another block, under a new ID", () => {
  const stored = { blocks: [image("shared"), block("heading"), block("p")] };
  const result = preserveImages(stored, { blocks: [block("shared", "heading"), block("p")] });
  const [first, second] = result.document.blocks;
  assert.equal(first!.type, "image");
  assert.notEqual(first!.id, "shared");
  assert.equal(second!.id, "shared");
  assert.equal(result.preserved, 1);
  assert.equal(result.renamed.length, 1);
  assert.match(result.renamed[0]!, /shared.*heading/);
});

test("reports an image it cannot place instead of guessing", () => {
  const stored = { blocks: [block("gone"), image("lost"), block("also-gone"), block("parent", "column", [image("orphan")])] };
  const result = preserveImages(stored, { blocks: [block("a")] });
  assert.deepEqual(ids(result.document.blocks), ["a"]);
  assert.equal(result.problems.length, 2);
  assert.match(result.problems[0]!, /lost/);
  assert.match(result.problems[1]!, /orphan.*parent/);
});
