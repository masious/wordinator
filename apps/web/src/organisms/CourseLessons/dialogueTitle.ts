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

// The lesson image nearest above a dialogue, else the lesson's first image: the banner's cover when the dialogue has no scene of its own.
export function dialogueFallbackImage(document: LessonDocument, blockId: string): string | null {
  let above: string | null = null;
  let first: string | null = null;
  let passed = false;
  for (const { block } of walkLessonBlocks(document.blocks)) {
    if (block.id === blockId) passed = true;
    if (block.type !== "image") continue;
    first ??= block.props.url;
    if (!passed) above = block.props.url;
  }
  return above ?? first;
}
