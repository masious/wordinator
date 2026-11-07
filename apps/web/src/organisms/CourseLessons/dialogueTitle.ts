import { inlineText, walkLessonBlocks, type InlineContent, type LessonDocument } from "@wordinator/contracts/lesson-document";

// The text of the last heading before a dialogue, which titles its banner and scene (null without one).
export function dialogueTitle(document: LessonDocument, blockId: string): string | null {
  let title: string | null = null;
  for (const { block } of walkLessonBlocks(document.blocks)) {
    if (block.id === blockId) return title;
    if (block.type === "heading") title = inlineText(block.content as InlineContent);
  }
  return null;
}
