import { LESSON_DOCUMENT_SCHEMA_VERSION, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { resolveLessonActivitySources, type ActivityDescriptor } from "@wordinator/contracts/lesson-activities";
import { beforeEach, describe, expect, it } from "vitest";
import { activityParts, activityPlacements, type SectionActivity } from "./activitySections";
import { lessonIndexEntries } from "./LessonIndex";

// A lesson shaped like Dutch Foundations': its title, a story, a words-only section with level-3 groups, a grammar section split
// into level-3 parts, a topic section, and a summary.
const blockId = (n: number) => `60000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const plain = { textColor: "default", backgroundColor: "default" } as const;
const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const heading = (n: number, level: 1 | 2 | 3, title: string): LessonTopBlock => ({ id: blockId(n), type: "heading", props: { ...plain, level }, content: text(title), children: [] });
const paragraph = (n: number, value: string): LessonTopBlock => ({ id: blockId(n), type: "paragraph", props: plain, content: text(value), children: [] });
const dialogue = (n: number): LessonTopBlock => ({ id: blockId(n), type: "dialogue", props: { turns: JSON.stringify([{ speaker: "Sofia", text: "Een tafel, graag." }, { speaker: "Ober", text: "Bij het raam?" }]) }, children: [] });
const callout = (n: number): LessonTopBlock => ({ id: blockId(n), type: "callout", props: { variant: "grammar", icon: "auto" }, content: text("Mag ik …?"), children: [] });
const lesson: LessonDocument = { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [
  heading(1, 1, "In het restaurant"), paragraph(2, "Vandaag eten we buiten."),
  heading(3, 2, "Story: Een tafel bij het raam"), dialogue(4),
  heading(5, 2, "Words: in het restaurant"), heading(6, 3, "Eten en drinken"), paragraph(7, "de soep, de wijn"),
  heading(8, 2, "Mogen: Mag ik …?"), heading(9, 3, "Asking permission"), callout(10), heading(11, 3, "Not allowed"), paragraph(12, "Je mag hier niet roken."),
  heading(13, 2, "Willen and u"), paragraph(14, "Wilt u iets drinken?"),
  heading(15, 2, "Summary"), paragraph(16, "Klaar."),
] };
const ids = (activities: SectionActivity[]) => activities.map(({ descriptor, part }) => `${descriptor.sourceKind}:${descriptor.returnHeadingId === null ? "-" : descriptor.returnHeadingId.slice(-2)}${part ? `:${part.color}` : ""}`);

describe("activities in the text", () => {
  let descriptors: ActivityDescriptor[];
  const entries = lessonIndexEntries(lesson);
  beforeEach(async () => { descriptors = await resolveLessonActivitySources({ document: lesson, title: "In het restaurant" }); });

  it("leaves the lesson's title out of the index, lists level-3 headings with colours, and keeps level-2 ones at the left", () => {
    expect(entries.map((entry) => [entry.text, entry.depth, entry.color])).toEqual([
      ["Story: Een tafel bij het raam", 0, undefined], ["Words: in het restaurant", 0, undefined], ["Eten en drinken", 1, "pink"],
      ["Mogen: Mag ik …?", 0, undefined], ["Asking permission", 1, "violet"], ["Not allowed", 1, "teal"], ["Willen and u", 0, undefined], ["Summary", 0, undefined],
    ]);
  });

  it("marks each of a grammar section's level-3 parts with its heading's colour", () => {
    expect([...activityParts(entries, descriptors).values()].map((part) => [part.label, part.color])).toEqual([["Asking permission", "violet"], ["Not allowed", "teal"]]);
  });

  it("places each source's activities after its section's last block, and the lesson end after the lesson's", () => {
    const placements = activityPlacements(lesson, entries, descriptors);
    const placed = Object.fromEntries([...placements].map(([id, activities]) => [id.slice(-2), ids(activities)]));
    expect(placed).toEqual({
      // The title's section ends at the story; the words section has none.
      "04": ["section:03"],
      // Each grammar part ends at the next part or the next level-2 heading.
      "10": ["section:09:violet"],
      "12": ["section:11:teal"],
      "16": ["section:15", "lesson_end:-"],
    });
  });
});
