import { LESSON_DOCUMENT_SCHEMA_VERSION, inlineText, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { resolveLessonActivitySources, type ActivityDescriptor } from "@wordinator/contracts/lesson-activities";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authoredDocument } from "../../../../../content/dutch-foundations/tools/normalize";
import lesson from "../../../../../content/dutch-foundations/part-ii/11-b-de-rekening-alstublieft.json";
import { useCurrentActivitySection } from "./CourseLessons";
import { lessonIndexEntries, useCurrentEntry, type LessonIndexEntry } from "./LessonIndex";

// Reproduction: the lesson index and Do more with AI disagree about the section at the reading line.
const blockId = (n: number) => `60000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const plain = { textColor: "default", backgroundColor: "default" } as const;
const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const heading = (n: number, level: 1 | 2 | 3, title: string): LessonTopBlock => ({ id: blockId(n), type: "heading", props: { ...plain, level }, content: text(title), children: [] });
const paragraph = (n: number, value: string): LessonTopBlock => ({ id: blockId(n), type: "paragraph", props: plain, content: text(value), children: [] });
const dialogue = (n: number): LessonTopBlock => ({ id: blockId(n), type: "dialogue", props: { turns: JSON.stringify([{ speaker: "Sofia", text: "Een tafel, graag." }, { speaker: "Ober", text: "Bij het raam?" }]) }, children: [] });
const callout = (n: number): LessonTopBlock => ({ id: blockId(n), type: "callout", props: { variant: "grammar", icon: "auto" }, content: text("Mag ik …?"), children: [] });
const fixture: LessonDocument = { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [
  heading(1, 1, "In het restaurant"), paragraph(2, "Intro."),
  heading(3, 2, "Story: Een tafel bij het raam"), dialogue(4),
  heading(5, 2, "Words: in het restaurant"), paragraph(6, "de ober, de kaart, de rekening"),
  heading(7, 2, "Mogen: Mag ik …?"), callout(8),
] };

let scrollY = 0;
const layout = new Map<string, number>();
const scroll = async (y: number) => {
  scrollY = y;
  await act(async () => { window.dispatchEvent(new Event("scroll")); await new Promise((resolve) => setTimeout(resolve, 5)); });
};

function Harness({ entries, descriptors, report }: { entries: LessonIndexEntry[]; descriptors: ActivityDescriptor[]; report: (index: string | undefined, ai: string | undefined) => void }) {
  const reading = useRef<HTMLDivElement>(null); const side = useRef<HTMLDivElement>(null);
  const current = useCurrentEntry(entries, reading, side);
  const section = useCurrentActivitySection(descriptors, reading, side);
  report(entries[current]?.text, section?.sourceLabel);
  return <><div ref={reading}>{[...layout.keys()].map((id) => <div key={id} data-block-id={id} />)}</div><div ref={side} /></>;
}

describe("current section, index vs Do more with AI", () => {
  beforeEach(() => {
    scrollY = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    Object.defineProperty(globalThis.document.documentElement, "scrollHeight", { configurable: true, value: 10000 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = (layout.get(this.dataset.blockId ?? "") ?? 0) - scrollY;
      return { top, bottom: top + 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); layout.clear(); });

  it("traces the real lesson's index entries and activity descriptors", async () => {
    const document = authoredDocument((lesson as { blocks: unknown[] }).blocks) as LessonDocument;
    const levels = new Map(document.blocks.flatMap((block) => block.type === "heading" ? [[block.id, `H${block.props.level} ${inlineText(block.content)}`]] : []));
    const entries = lessonIndexEntries(document);
    const descriptors = await resolveLessonActivitySources({ document, title: lesson.title });
    console.log("INDEX\n" + entries.map((entry) => `${entry.id.slice(0, 8)} d${entry.depth} ${entry.category.padEnd(12)} ${entry.text}`).join("\n"));
    console.log("DESCRIPTORS\n" + descriptors.map((entry) => `${entry.sourceKind.padEnd(9)} ${(entry.returnHeadingId ?? "null").slice(0, 8)} [${levels.get(entry.returnHeadingId ?? "") ?? "-"}] inIndex=${entries.some((item) => item.id === entry.returnHeadingId)} ${entry.activityTypes.join(",")}`).join("\n"));
  });

  it("keeps naming the story while the index has moved on to a section without activities", async () => {
    const entries = lessonIndexEntries(fixture);
    const descriptors = await resolveLessonActivitySources({ document: fixture, title: "In het restaurant" });
    // The Words section yields no descriptor: it has no dialogue, no grammar callout or label, and no summary label.
    expect(descriptors.map((entry) => entry.returnHeadingId)).toEqual([blockId(3), blockId(3), blockId(7), null]);
    [1, 3, 5, 7].forEach((n, index) => { layout.set(blockId(n), 200 + index * 1000); });
    const seen: Array<[string | undefined, string | undefined]> = [];
    render(<Harness entries={entries} descriptors={descriptors} report={(index, ai) => seen.push([index, ai])} />);
    await scroll(1300); // Story heading above the line, Words heading at 900 below it.
    expect(seen.at(-1)).toEqual(["Story: Een tafel bij het raam", "Story: Een tafel bij het raam"]);
    await scroll(2400); // Words heading passed, Mogen heading 800px below the line.
    expect(seen.at(-1)).toEqual(["Words: in het restaurant", "Story: Een tafel bij het raam"]);
    await scroll(3200); // Mogen heading passed.
    expect(seen.at(-1)).toEqual(["Mogen: Mag ik …?", "Mogen: Mag ik …?"]);
  });
});
