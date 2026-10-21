import { LESSON_DOCUMENT_SCHEMA_VERSION, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { resolveLessonActivitySources, type ActivityDescriptor } from "@wordinator/contracts/lesson-activities";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityParts, sectionActivities, useVisibleParts } from "./activitySections";
import { lessonIndexEntries, useCurrentEntry } from "./LessonIndex";

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
const ids = (activities: ReturnType<typeof sectionActivities>["activities"]) => activities.map(({ descriptor, part }) => `${descriptor.sourceKind}:${descriptor.returnHeadingId === null ? "-" : descriptor.returnHeadingId.slice(-2)}${part ? `:${part.color}` : ""}`);

describe("Do more with AI's section", () => {
  let descriptors: ActivityDescriptor[];
  const entries = lessonIndexEntries(lesson);
  const at = (id: number) => entries.findIndex((entry) => entry.id === blockId(id));
  beforeEach(async () => { descriptors = await resolveLessonActivitySources({ document: lesson, title: "In het restaurant" }); });

  it("leaves the lesson's title out of the index, lists level-3 headings with colours, and keeps level-2 ones at the left", () => {
    expect(entries.map((entry) => [entry.text, entry.depth, entry.color])).toEqual([
      ["Story: Een tafel bij het raam", 0, undefined], ["Words: in het restaurant", 0, undefined], ["Eten en drinken", 1, "pink"],
      ["Mogen: Mag ik …?", 0, undefined], ["Asking permission", 1, "violet"], ["Not allowed", 1, "teal"], ["Willen and u", 0, undefined], ["Summary", 0, undefined],
    ]);
  });

  it("names the section the index marks, and offers its story activities with its role-play", () => {
    const section = sectionActivities(entries, at(3), descriptors, new Set());
    expect(section).toMatchObject({ label: "Story: Een tafel bij het raam", category: "story" });
    expect(ids(section.activities)).toEqual(["section:03", "dialogue:03"]);
  });

  it("falls back to the lesson-end activity in a section without activities, still named after that section", () => {
    for (const id of [5, 6, 13]) {
      const section = sectionActivities(entries, at(id), descriptors, new Set());
      expect(section.label).toBe(id === 13 ? "Willen and u" : "Words: in het restaurant");
      expect(ids(section.activities)).toEqual(["lesson_end:-"]);
    }
  });

  it("offers a grammar section's level-3 parts that are on screen, each marked with its heading's colour", () => {
    const parts = activityParts(entries, descriptors);
    expect([...parts.values()].map((part) => [part.label, part.color])).toEqual([["Asking permission", "violet"], ["Not allowed", "teal"]]);
    // On the level-2 heading, or either of its level-3 ones, the section is the level-2's; only the parts on screen are offered.
    for (const id of [8, 9, 11]) {
      const section = sectionActivities(entries, at(id), descriptors, new Set([blockId(9), blockId(11)]));
      expect(section).toMatchObject({ label: "Mogen: Mag ik …?", category: "grammar" });
      expect(ids(section.activities)).toEqual(["section:09:violet", "section:11:teal"]);
    }
    expect(ids(sectionActivities(entries, at(11), descriptors, new Set([blockId(11)])).activities)).toEqual(["section:11:teal"]);
    // With none of them on screen there is nothing of the section's to offer, so the lesson end is.
    expect(ids(sectionActivities(entries, at(8), descriptors, new Set()).activities)).toEqual(["lesson_end:-"]);
  });

  it("offers the introduction's activities before the first entry", () => {
    const section = sectionActivities(entries, -1, descriptors, new Set());
    // The introduction sits under the lesson's title, which the index leaves out; it has no activities of its own here.
    expect(section.label).toBeNull();
    expect(ids(section.activities)).toEqual(["lesson_end:-"]);
  });
});

// Headings 1000px apart in reading order, read through an 800px window whose reading line is its top.
let scrollY = 0;
const layout = new Map<string, number>();
const scroll = async (y: number) => {
  scrollY = y;
  await act(async () => { window.dispatchEvent(new Event("scroll")); await new Promise((resolve) => setTimeout(resolve, 5)); });
};

describe("the index and Do more with AI on the page", () => {
  beforeEach(() => {
    scrollY = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    Object.defineProperty(globalThis.document.documentElement, "scrollHeight", { configurable: true, value: 30000 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = (layout.get(this.dataset.blockId ?? "") ?? 20000) - scrollY;
      return { top, bottom: top + 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); layout.clear(); });

  it("agrees on the section, and narrows a grammar section to the parts on screen", async () => {
    const entries = lessonIndexEntries(lesson);
    const descriptors = await resolveLessonActivitySources({ document: lesson, title: "In het restaurant" });
    entries.forEach((entry, index) => { layout.set(entry.id, 1000 + index * 1000); });
    const seen: Array<{ index: string | undefined; label: string | null; activities: string[] }> = [];
    function Harness() {
      const reading = useRef<HTMLDivElement>(null); const side = useRef<HTMLDivElement>(null);
      const current = useCurrentEntry(entries, reading, side);
      const visible = useVisibleParts(activityParts(entries, descriptors), entries, reading, side);
      const section = sectionActivities(entries, current, descriptors, visible);
      seen.push({ index: entries[current]?.text, label: section.label, activities: ids(section.activities) });
      return <><div ref={reading}>{entries.map((entry) => <div key={entry.id} data-block-id={entry.id} />)}</div><div ref={side} /></>;
    }
    render(<Harness />);
    // The reported bug: past the story, on Words, both sides name Words; it has no activities, so the lesson end is offered.
    await scroll(2000);
    expect(seen.at(-1)).toEqual({ index: "Words: in het restaurant", label: "Words: in het restaurant", activities: ["lesson_end:-"] });
    // On Mogen, before its parts reach the window, there is nothing of its own to offer.
    await scroll(4000);
    expect(seen.at(-1)).toEqual({ index: "Mogen: Mag ik …?", label: "Mogen: Mag ik …?", activities: ["lesson_end:-"] });
    // Further down, its first part (from 5000) is on screen and its second (from 6000) is not.
    await scroll(4500);
    expect(seen.at(-1)).toEqual({ index: "Mogen: Mag ik …?", label: "Mogen: Mag ik …?", activities: [`section:09:violet`] });
    // On its second part, the first has left the screen, so only the second is offered, still under Mogen.
    await scroll(6000);
    expect(seen.at(-1)).toEqual({ index: "Not allowed", label: "Mogen: Mag ik …?", activities: [`section:11:teal`] });
  });
});
