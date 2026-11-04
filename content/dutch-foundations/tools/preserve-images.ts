// Image blocks are added in the app (uploads stored in R2), never in the lesson files, so re-importing a file would drop them.
// `preserveImages` puts each image block of the stored draft back into the file's document: under the same parent, after the
// non-image sibling it followed (or before the one it preceded, when that is gone). Images the file already holds are kept as
// they are. An image whose ID the file gives to another block (the file and the app assigned IDs separately) is put back
// under a new ID, listed in `renamed`. Returns the problems instead of guessing when an image's parent or both its neighbours
// are gone.
type Block = { id: string; type: string; children?: Block[] };
type Document = { blocks: Block[] };

function find(blocks: Block[], id: string): Block | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const found = find(block.children ?? [], id);
    if (found) return found;
  }
  return null;
}

type Placement = { block: Block; parent: string | null; previous: string | null; next: string | null };
function imagePlacements(blocks: Block[], parent: string | null = null, out: Placement[] = []) {
  blocks.forEach((block, index) => {
    if (block.type === "image") out.push({
      block, parent,
      previous: blocks.slice(0, index).reverse().find((item) => item.type !== "image")?.id ?? null,
      next: blocks.slice(index + 1).find((item) => item.type !== "image")?.id ?? null,
    });
    imagePlacements(block.children ?? [], block.id, out);
  });
  return out;
}

// Lesson documents are BlockNote-shaped: every block has an ID and a type, and may have children.
export function preserveImages<T extends { blocks: object[] }>(storedDocument: { blocks: object[] }, document: T): { document: T; preserved: number; renamed: string[]; problems: string[] } {
  const stored = storedDocument as Document;
  const copy = structuredClone(document);
  const result = copy as unknown as Document;
  const problems: string[] = [];
  const renamed: string[] = [];
  let preserved = 0;
  for (const image of imagePlacements(stored.blocks)) {
    const taken = find(result.blocks, image.block.id);
    if (taken?.type === "image") continue;
    const siblings = image.parent === null ? result.blocks : find(result.blocks, image.parent)?.children;
    if (!siblings) { problems.push(`image ${image.block.id}: its parent block ${image.parent} is gone`); continue; }
    let at = image.previous === null ? 0 : siblings.findIndex((item) => item.id === image.previous) + 1;
    if (image.previous !== null && at === 0) {
      at = image.next === null ? -1 : siblings.findIndex((item) => item.id === image.next);
      if (at < 0) { problems.push(`image ${image.block.id}: the blocks around it (${image.previous}, ${image.next ?? "end"}) are gone`); continue; }
    }
    // Images that shared this anchor were placed already; keep their stored order.
    while (at < siblings.length && siblings[at]!.type === "image") at += 1;
    const restored = structuredClone(image.block);
    if (taken) { restored.id = crypto.randomUUID(); renamed.push(`image ${image.block.id} (its ID is a ${taken.type} block in the file) is now ${restored.id}`); }
    siblings.splice(at, 0, restored);
    preserved += 1;
  }
  return { document: copy, preserved, renamed, problems };
}
