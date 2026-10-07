import { fragmentToBlocks, type DropCursorHooks } from "@blocknote/core";
import { detectEdgePosition, multiColumnDropCursor } from "@blocknote/xl-multi-column";
import { LESSON_COLUMNS_MAX } from "@wordinator/contracts/lesson-document";
import type { LessonEditorInstance } from "./editorSchema";

type View = NonNullable<LessonEditorInstance["prosemirrorView"]>;

// Dropping a block on the left or right edge of another block makes columns. The editor refuses edge drops that would
// leave a structure the contracts reject: a fourth column, a column list inside a column or list, or columns of columns.
// Regular drops are left to BlockNote; anything they nest is repaired after the change (see `breaksColumnRules`).
export function refusesColumnDrop(view: View, event: DragEvent) {
  const edge = detectEdgePosition(event, view, view.state);
  if (!edge || edge.position === "regular") return false;
  const slice = view.dragging?.slice;
  const dragged = slice ? fragmentToBlocks(slice.content) : [];
  if (dragged.some((block) => block.type === "columnList" || block.type === "column")) return true;
  const draggedIds = new Set(dragged.map((block) => block.id));
  const target = view.state.doc.resolve(edge.posBeforeNode);
  if (edge.node.type.name === "column") {
    // Columns emptied by the drag disappear, so they do not count towards the limit.
    let remaining = 0;
    target.parent.forEach((column) => {
      let keeps = false;
      column.forEach((child) => { if (!draggedIds.has(child.attrs.id as string)) keeps = true; });
      if (keeps) remaining += 1;
    });
    return remaining >= LESSON_COLUMNS_MAX;
  }
  // A new column list replaces the target block, which must sit at the top level of the document.
  return target.depth > 1;
}

export const lessonDropCursor: { hooks: DropCursorHooks } = {
  hooks: {
    computeDropPosition: (context) => refusesColumnDrop(context.view as View, context.event)
      ? null
      : multiColumnDropCursor.hooks.computeDropPosition!(context),
  },
};
