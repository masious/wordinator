import { LESSON_DOCUMENT_SCHEMA_VERSION, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { currentEntry, LessonIndex, lessonIndexEntries, type LessonIndexEntry } from "./LessonIndex";

const blockId = (n: number) => `50000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const plain = { textColor: "default", backgroundColor: "default" } as const;
const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const heading = (n: number, level: 1 | 2 | 3, title: string): LessonTopBlock => ({ id: blockId(n), type: "heading", props: { ...plain, level }, content: text(title), children: [] });
const paragraph = (n: number, value: string): LessonTopBlock => ({ id: blockId(n), type: "paragraph", props: plain, content: text(value), children: [] });
const example = (n: number): LessonTopBlock => ({ id: blockId(n), type: "example", props: { translation: "", note: "" }, content: text("Zin."), children: [] });
const practice = (n: number, instruction: string): LessonTopBlock => ({
  id: blockId(n), type: "practice", children: [],
  props: { data: JSON.stringify({ instruction, passage: null, items: [{ prompt: "Hallo", authorsVersion: ["Hello"], note: null }] }) },
});
const document = (blocks: LessonTopBlock[]): LessonDocument => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks });

describe("lesson index entries", () => {
  it("lists top-level level-1 and level-2 headings in reading order, and leaves out practices and every other block", () => {
    const entries = lessonIndexEntries(document([
      practice(1, "Warm up"),
      heading(2, 2, "Greetings"), paragraph(3, "Hallo!"), example(4), practice(5, "Translate into English."),
      heading(6, 3, "Formal"), practice(7, "Fill in the verb."), heading(8, 2, "  "),
      { id: blockId(9), type: "columnList", props: {}, content: undefined, children: [
        { id: blockId(10), type: "column", props: { width: 1 }, content: undefined, children: [heading(11, 2, "Left") as never] },
        { id: blockId(12), type: "column", props: { width: 1 }, content: undefined, children: [practice(13, "Fill in") as never] },
      ] } as unknown as LessonTopBlock,
      heading(14, 1, "Your  turn"), heading(15, 2, "Writing"),
    ]));
    expect(entries).toEqual([
      // The highest heading level in the lesson is depth 0, whatever its level; lower levels are indented.
      { id: blockId(2), text: "Greetings", depth: 1 },
      { id: blockId(14), text: "Your turn", depth: 0 },
      { id: blockId(15), text: "Writing", depth: 1 },
    ]);
  });

  it("marks the last entry that reached the line, none before the first, and the last at the bottom of the page", () => {
    expect(currentEntry([100, 600, 1200], 50, false)).toBe(-1);
    expect(currentEntry([-400, 40, 1200], 50, false)).toBe(1);
    // A jump lands an entry exactly on the line, give or take rounding.
    expect(currentEntry([-400, 55, 1200], 50, false)).toBe(1);
    expect(currentEntry([-400, null, 1200], 50, false)).toBe(0);
    expect(currentEntry([-400, 200, 600], 50, true)).toBe(2);
  });
});

// Three entries, 1000px apart, read through an 800px window. Every element's box follows `scrollY`.
const entries: LessonIndexEntry[] = [
  { id: blockId(1), text: "Greetings", depth: 0 },
  { id: blockId(2), text: "Small talk", depth: 1 },
  { id: blockId(3), text: "Goodbyes", depth: 0 },
];
const layout = new Map(entries.map((entry, index) => [entry.id, 300 + index * 1000]));
let scrollY = 0;

function Harness() {
  const reading = useRef<HTMLDivElement>(null); const side = useRef<HTMLDivElement>(null);
  return <>
    <div ref={reading}>{entries.map((entry) => <div key={entry.id} data-block-id={entry.id}>{entry.text}</div>)}</div>
    <div ref={side}><LessonIndex entries={entries} reading={reading} side={side} /></div>
  </>;
}
const scroll = async (y: number) => {
  scrollY = y;
  await act(async () => { window.dispatchEvent(new Event("scroll")); await new Promise((resolve) => setTimeout(resolve, 5)); });
};

describe("LessonIndex", () => {
  beforeEach(() => {
    scrollY = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    Object.defineProperty(globalThis.document.documentElement, "scrollHeight", { configurable: true, value: 3000 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = (layout.get(this.dataset.blockId ?? "") ?? 0) - scrollY;
      return { top, bottom: top + 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("lists every entry, marks the one the reader is in, and dims the ones already passed", async () => {
    render(<Harness />);
    const index = screen.getByRole("navigation", { name: "In this lesson" });
    const buttons = within(index).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Greetings", "Small talk", "Goodbyes"]);
    await scroll(0);
    // Before the first heading nothing is current and nothing is passed.
    expect(index.querySelector("[aria-current]")).toBeNull();
    expect(index.querySelector("[data-passed]")).toBeNull();
    await scroll(1400);
    expect(buttons[1]).toHaveAttribute("aria-current", "location");
    expect(buttons[0]).toHaveAttribute("data-passed");
    expect(buttons[2]).not.toHaveAttribute("data-passed");
    // Scrolling back moves the current entry back.
    await scroll(400);
    expect(buttons[0]).toHaveAttribute("aria-current", "location");
    expect(buttons[0]).not.toHaveAttribute("data-passed");
    // The last entry is current at the bottom of the page, even below the line.
    await scroll(2200);
    expect(buttons[2]).toHaveAttribute("aria-current", "location");
  });

  it("scrolls the page to an entry when it is chosen", async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    render(<Harness />);
    await scroll(500);
    fireEvent.click(screen.getByRole("button", { name: "Goodbyes" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 2300, behavior: "auto" });
  });
});
