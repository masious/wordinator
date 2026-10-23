import type { ActivityDescriptor } from "@wordinator/contracts/lesson-activities";
import type { LessonDocument } from "@wordinator/contracts/lesson-document";
import type { HeadingColor, LessonIndexEntry } from "./LessonIndex";

// A grammar part: a level-3 heading that a grammar section's activities are split at (docs/lesson-activities.md). It has an index
// row and a colour like any level-3 heading, and its activities carry that colour's dot.
export type ActivityPart = { headingId: string; label: string; color: HeadingColor };
export type SectionActivity = { descriptor: ActivityDescriptor; part: ActivityPart | null };

// Every grammar part of the lesson, keyed by its heading.
export function activityParts(entries: readonly LessonIndexEntry[], descriptors: readonly ActivityDescriptor[]) {
  const colored = new Map(entries.flatMap((entry) => entry.color ? [[entry.id, entry.color] as const] : []));
  const parts = new Map<string, ActivityPart>();
  for (const { sourceKind, returnHeadingId, sourceLabel } of descriptors) {
    const color = returnHeadingId ? colored.get(returnHeadingId) : undefined;
    if (sourceKind === "section" && returnHeadingId && color) parts.set(returnHeadingId, { headingId: returnHeadingId, label: sourceLabel, color });
  }
  return parts;
}

// Where each source's activities sit in the text, keyed by the block they follow. A source runs from its heading
// (the introduction from the top) to the next heading that starts a source boundary: any level-1 or level-2 heading, or a grammar
// part's level-3 heading. Its activities follow its last top-level block, its role-play after them; the lesson-end activity follows
// the lesson's last block.
export function activityPlacements(document: LessonDocument, entries: readonly LessonIndexEntry[], descriptors: readonly ActivityDescriptor[]) {
  const parts = activityParts(entries, descriptors);
  const blocks = document.blocks;
  const isHeading = (index: number) => blocks[index]?.type === "heading";
  const boundary = (index: number) => {
    const block = blocks[index];
    return block?.type === "heading" && (block.props.level < 3 || parts.has(block.id));
  };
  const placements = new Map<string, SectionActivity[]>();
  const place = (index: number, activities: SectionActivity[]) => {
    const anchor = blocks[Math.max(0, index)]; if (!anchor || !activities.length) return;
    placements.set(anchor.id, [...placements.get(anchor.id) ?? [], ...activities]);
  };
  for (const descriptor of descriptors) {
    if (descriptor.sourceKind === "lesson_end") { place(blocks.length - 1, [{ descriptor, part: null }]); continue; }
    if (descriptor.sourceKind !== "section") continue;
    const start = descriptor.returnHeadingId === null ? -1 : blocks.findIndex((block) => block.id === descriptor.returnHeadingId);
    let end = start + 1;
    while (end < blocks.length && !(descriptor.returnHeadingId === null ? isHeading(end) : boundary(end))) end += 1;
    const part = descriptor.returnHeadingId ? parts.get(descriptor.returnHeadingId) ?? null : null;
    place(end - 1, [{ descriptor, part }]);
  }
  return placements;
}
