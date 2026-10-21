import type { ActivityDescriptor } from "@wordinator/contracts/lesson-activities";
import { type RefObject, useEffect, useState } from "react";
import type { OverviewCategory } from "../LessonOverview/overviewModel";
import { stickyInset, type HeadingColor, type LessonIndexEntry } from "./LessonIndex";

// A grammar part: a level-3 heading that a grammar section's activities are split at (docs/lesson-activities.md). It has an index
// row and a colour like any level-3 heading, and its activities carry that colour's dot.
export type ActivityPart = { headingId: string; label: string; color: HeadingColor };
export type SectionActivity = { descriptor: ActivityDescriptor; part: ActivityPart | null };
export type SectionActivities = { label: string | null; category: OverviewCategory | undefined; activities: SectionActivity[] };

// The section each entry is in: the level-1 or level-2 entry at or before it (itself for those), -1 before the first.
const sectionOwners = (entries: readonly LessonIndexEntry[]) => {
  let owner = -1;
  return entries.map((entry, index) => {
    if (entry.level < 3) owner = index;
    return owner;
  });
};

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

// What Do more with AI offers while index entry `current` is the reader's (-1 before the first): the activities of the section it
// is in (its level-2 entry's, when it is a level-3 one), that section's own first, then those of its grammar parts that are on
// screen (`visible`, by heading), in reading order, each source's role-play after it. A section with none falls back to the
// lesson-end activity. The area is named after the section, as its row in the index is.
export function sectionActivities(entries: readonly LessonIndexEntry[], current: number, descriptors: readonly ActivityDescriptor[], visible: ReadonlySet<string>): SectionActivities {
  const owners = sectionOwners(entries);
  const positions = new Map(entries.map((entry, index) => [entry.id, index]));
  const parts = activityParts(entries, descriptors);
  const section = current >= 0 ? owners[current]! : -1;
  // Sources under no listed heading (the introduction, or the lesson's own title) belong before the first entry.
  const ownerOf = (descriptor: ActivityDescriptor) => {
    const position = descriptor.returnHeadingId === null ? undefined : positions.get(descriptor.returnHeadingId);
    return position === undefined ? -1 : owners[position]!;
  };
  const activities: SectionActivity[] = [];
  for (const descriptor of descriptors) {
    if (descriptor.sourceKind !== "section" || ownerOf(descriptor) !== section) continue;
    const part = descriptor.returnHeadingId ? parts.get(descriptor.returnHeadingId) ?? null : null;
    if (part && !visible.has(part.headingId)) continue;
    activities.push({ descriptor, part });
    for (const dialogue of descriptors) if (dialogue.sourceKind === "dialogue" && dialogue.returnHeadingId === descriptor.returnHeadingId) activities.push({ descriptor: dialogue, part });
  }
  if (!activities.length) {
    const end = descriptors.find((descriptor) => descriptor.sourceKind === "lesson_end");
    if (end) activities.push({ descriptor: end, part: null });
  }
  const entry = entries[section];
  const intro = descriptors.find((descriptor) => descriptor.sourceKind === "section" && ownerOf(descriptor) === -1);
  return { label: entry?.text ?? (section === -1 ? intro?.sourceLabel ?? null : null), category: entry?.category, activities };
}

// The grammar parts on screen: a part runs from its heading to the next entry (or the end of `reading`), and is on screen while any
// of it is between the reading line and the window's bottom. Follows the window's scroll and size.
export function useVisibleParts(parts: ReadonlyMap<string, ActivityPart>, entries: readonly LessonIndexEntry[], reading: RefObject<HTMLElement | null>, side: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0; const root = reading.current; if (!root) return;
      const top = (id: string) => root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)?.getBoundingClientRect().top ?? null;
      const line = stickyInset(side.current);
      const shown = new Set<string>();
      entries.forEach((entry, index) => {
        if (!parts.has(entry.id)) return;
        const start = top(entry.id); if (start === null) return;
        const next = entries[index + 1];
        const end = (next ? top(next.id) : null) ?? root.getBoundingClientRect().bottom;
        if (start < window.innerHeight && end > line) shown.add(entry.id);
      });
      setVisible((previous) => previous.size === shown.size && [...shown].every((id) => previous.has(id)) ? previous : shown);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll); onScroll();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [parts, entries, reading, side]);
  return visible;
}
