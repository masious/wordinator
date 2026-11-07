import { inlineText, walkLessonBlocks, type InlineContent, type LessonDocument } from "@wordinator/contracts/lesson-document";

// The text of the last heading before a dialogue, without its "Story: " label, which titles its banner (null without one).
export function dialogueTitle(document: LessonDocument, blockId: string): string | null {
  let title: string | null = null;
  for (const { block } of walkLessonBlocks(document.blocks)) {
    if (block.id === blockId) return title;
    if (block.type === "heading") title = inlineText(block.content as InlineContent).replace(/^story:\s*/i, "").trim() || null;
  }
  return null;
}

// The lesson images that can cover a dialogue's banner: the nearest above it, and the lesson's first.
export function dialogueLessonImages(document: LessonDocument, blockId: string): { above: string | null; first: string | null } {
  let above: string | null = null;
  let first: string | null = null;
  let passed = false;
  for (const { block } of walkLessonBlocks(document.blocks)) {
    if (block.id === blockId) passed = true;
    if (block.type !== "image") continue;
    first ??= block.props.url;
    if (!passed) above = block.props.url;
  }
  return { above, first };
}
