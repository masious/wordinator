import { walkLessonBlocks, type LessonBlock, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { stableJson, toLessonDocument, type EditorBlock } from "./lessonDraft";

// Block-level three-way merge for a draft save refused with `409`. `base` is the draft the local edit started from, `local`
// the author's edit, and `server` the newer draft. Blocks are matched by ID and compared on their own type, props, and
// content; their children are structure, merged by position.
//
// - A block changed on one side only takes that side's version; a deletion on one side of an unchanged block wins.
// - A block changed differently on both sides, or deleted on one side and edited on the other, is a conflict. The merged
//   document holds the newer draft's version (or the edited one, when the other side deleted it) and the conflict
//   carries both versions so the author can choose.
// - Positions follow the newer draft, except blocks the author added or moved while the newer draft left them in place.
//   Blocks whose parent was deleted take the parent's place.
//
// The result is reshaped like any editor output; `null` means it still breaks the contracts and cannot be merged.
export type MergeConflict = { blockId: string; local: LessonBlock | null; server: LessonBlock | null };
export type MergeResult = { document: LessonDocument; conflicts: MergeConflict[] };

type Side = Map<string, Placed>;
type Placed = { block: LessonBlock; parent: string; siblings: string[]; index: number };
const TOP = "";

function place(document: LessonDocument): Side {
  const side: Side = new Map();
  const visit = (blocks: readonly LessonBlock[], parent: string) => {
    const siblings = blocks.map((block) => block.id);
    blocks.forEach((block, index) => {
      side.set(block.id, { block, parent, siblings, index });
      visit(block.children as LessonBlock[], block.id);
    });
  };
  visit(document.blocks, TOP);
  return side;
}

// Defaults the editor adds to every block it emits (but a stored document may omit) do not count as edits.
const editorDefaults: Record<string, unknown> = { textAlignment: "left", isToggleable: false };
const own = (block: LessonBlock) => stableJson({
  type: block.type, content: block.content,
  props: Object.fromEntries(Object.entries(block.props).filter(([key, value]) => editorDefaults[key] !== value)),
});
const sameOwn = (left: LessonBlock, right: LessonBlock) => own(left) === own(right);
const isContainer = (block: LessonBlock) => block.type === "columnList" || block.type === "column";
// A block moved when its parent changed or its nearest earlier sibling known to both sides did; blocks added or deleted
// around it do not count as a move.
const prevIn = (placed: Placed, other: Side) => placed.siblings.slice(0, placed.index).reverse().find((sibling) => other.has(sibling)) ?? null;
const moved = (from: Placed, fromSide: Side, to: Placed, toSide: Side) => from.parent !== to.parent || prevIn(from, toSide) !== prevIn(to, fromSide);

export function mergeLessonDocuments(base: LessonDocument, local: LessonDocument, server: LessonDocument): MergeResult | null {
  const B = place(base); const L = place(local); const S = place(server);
  const chosen = new Map<string, { block: LessonBlock; side: Side }>();
  const conflicts: MergeConflict[] = [];

  for (const id of new Set([...B.keys(), ...L.keys(), ...S.keys()])) {
    const b = B.get(id)?.block; const l = L.get(id); const s = S.get(id);
    // Content comes from one side, position from the side chosen below.
    let block: LessonBlock | null;
    if (l && s) {
      const reference = b ?? s.block;
      if (sameOwn(l.block, reference)) block = s.block;
      else if (sameOwn(s.block, reference) || sameOwn(l.block, s.block) || isContainer(l.block)) block = l.block;
      else { block = s.block; conflicts.push({ blockId: id, local: l.block, server: s.block }); }
    } else if (l) {
      // Added locally, or deleted on the server.
      if (!b) block = l.block;
      else if (sameOwn(l.block, b) || isContainer(l.block)) block = null;
      else { block = l.block; conflicts.push({ blockId: id, local: l.block, server: null }); }
    } else if (s) {
      if (!b) block = s.block;
      else if (sameOwn(s.block, b) || isContainer(s.block)) block = null;
      else { block = s.block; conflicts.push({ blockId: id, local: null, server: s.block }); }
    } else block = null;
    if (!block) continue;
    const before = B.get(id);
    const localPlaced = Boolean(l && (!s || !before || (moved(before, B, l, L) && !moved(before, B, s, S))));
    chosen.set(id, { block, side: localPlaced ? L : S });
  }

  // Where a block goes: its parent on the chosen side, after the nearest earlier sibling that is already placed. A block
  // whose parent is gone takes the parent's place, after the parent's earlier siblings.
  const target = (id: string, side: Side): { parent: string; anchors: string[] } => {
    const placed = side.get(id)!;
    const anchors = placed.siblings.slice(0, placed.index).reverse();
    if (placed.parent === TOP || chosen.has(placed.parent)) return { parent: placed.parent, anchors };
    const up = target(placed.parent, side);
    return { parent: up.parent, anchors: [...anchors, placed.parent, ...up.anchors] };
  };
  const children = new Map<string, string[]>();
  const insert = (id: string, side: Side) => {
    const { parent, anchors } = target(id, side);
    const list = children.get(parent) ?? [];
    children.set(parent, list);
    const anchor = anchors.find((candidate) => list.includes(candidate));
    list.splice(anchor === undefined ? 0 : list.indexOf(anchor) + 1, 0, id);
  };
  // Newer-draft positions first, in reading order, then the author's added and moved blocks in their reading order.
  for (const { block } of walkLessonBlocks(server.blocks)) if (chosen.get(block.id)?.side === S) insert(block.id, S);
  for (const { block } of walkLessonBlocks(local.blocks)) if (chosen.get(block.id)?.side === L) insert(block.id, L);

  const build = (parent: string): EditorBlock[] => (children.get(parent) ?? []).map((id) => {
    const { block } = chosen.get(id)!;
    return { ...block, children: build(id) } as EditorBlock;
  });
  const parsed = toLessonDocument(build(TOP));
  if (!parsed.success) return null;
  const kept = new Set([...walkLessonBlocks(parsed.data.blocks)].map(({ block }) => block.id));
  return { document: parsed.data, conflicts: conflicts.filter((conflict) => kept.has(conflict.blockId)) };
}
