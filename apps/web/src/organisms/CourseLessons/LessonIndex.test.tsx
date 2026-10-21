import { LESSON_DOCUMENT_SCHEMA_VERSION, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { NotebookPen } from "lucide-react";
import { stopCategories } from "../LessonOverview/stopCategories";
import { currentEntry, entryStates, LessonIndex, lessonIndexEntries, useCurrentEntry, type LessonIndexEntry } from "./LessonIndex";

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
      // A section's category reads every step up to the next listed heading, level-3 sections included. It starts at its first
      // step; one with none of its own starts where the next does (here, after the last step).
      { id: blockId(2), text: "Greetings", depth: 1, category: "translate", start: 1 },
      { id: blockId(14), text: "Your turn", depth: 0, category: "topic", start: 6 },
      { id: blockId(15), text: "Writing", depth: 1, category: "topic", start: 6 },
    ]);
  });

  it("reads each heading's category from its section, as the overview reads its stops", () => {
    const dialogue = (n: number): LessonTopBlock => ({ id: blockId(n), type: "dialogue", props: { turns: JSON.stringify([{ speaker: "Noor", text: "Hoi!" }]) }, children: [] });
    const callout = (n: number, variant: "grammar" | "culture"): LessonTopBlock => ({ id: blockId(n), type: "callout", props: { variant, icon: "auto" }, content: text("Regel."), children: [] });
    const entries = lessonIndexEntries(document([
      heading(1, 1, "Zullen we?"), heading(2, 2, "Story: dinner"), dialogue(3),
      heading(4, 2, "Making a suggestion"), callout(5, "grammar"), heading(6, 2, "Sinterklaas"), callout(7, "culture"),
      heading(8, 2, "Practice"), practice(9, "Put the words in the right order."), heading(10, 2, "Summary"), paragraph(11, "Klaar."),
    ]));
    expect(entries.map((entry) => entry.category)).toEqual(["intro", "story", "grammar", "culture", "wordOrder", "summary"]);
  });

  it("locks the entries the reader has not reached, and keeps those reached unlocked when the current one moves back", () => {
    const listed = [0, 3, 6].map((start, index) => ({ id: blockId(index), text: `Entry ${index}`, depth: 0, category: "topic" as const, start }));
    expect(entryStates(listed, -1, -1)).toEqual(["locked", "locked", "locked"]);
    expect(entryStates(listed, 0, 1)).toEqual(["current", "locked", "locked"]);
    // The furthest step reached unlocks a section before it becomes current.
    expect(entryStates(listed, 0, 3)).toEqual(["current", "passed", "locked"]);
    expect(entryStates(listed, 2, 6)).toEqual(["passed", "passed", "current"]);
    expect(entryStates(listed, 0, 6)).toEqual(["current", "passed", "passed"]);
    // An entry visited on this visit (a jump from the index reads nothing) stays unlocked too.
    expect(entryStates(listed, 0, -1, 2)).toEqual(["current", "passed", "passed"]);
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
  { id: blockId(1), text: "Greetings", depth: 0, category: "intro", start: 0 },
  { id: blockId(2), text: "Small talk", depth: 1, category: "conversation", start: 1 },
  { id: blockId(3), text: "Goodbyes", depth: 0, category: "summary", start: 2 },
];
const layout = new Map(entries.map((entry, index) => [entry.id, 300 + index * 1000]));
let scrollY = 0;

// The page shares the current entry with the headings, so the harness follows it the same way; nothing is reached beyond it.
function Harness() {
  const reading = useRef<HTMLDivElement>(null); const side = useRef<HTMLDivElement>(null);
  const current = useCurrentEntry(entries, reading, side);
  return <>
    <div ref={reading}>{entries.map((entry) => <div key={entry.id} data-block-id={entry.id}>{entry.text}</div>)}</div>
    <div ref={side}><LessonIndex entries={entries} current={current} states={entryStates(entries, current, -1)} reading={reading} side={side} /></div>
  </>;
}
const scroll = async (y: number) => {
  scrollY = y;
  await act(async () => { window.dispatchEvent(new Event("scroll")); await new Promise((resolve) => setTimeout(resolve, 5)); });
};

describe("LessonIndex", () => {
  it("uses a note mark for grammar and the accent tone for Summary", () => {
    expect(stopCategories.grammar.icon).toBe(NotebookPen);
    expect(stopCategories.grammar.emoji).toBe("✍️");
    expect(stopCategories.summary.tone).toBe("accent");
  });

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

  it("lists every entry, marks the one the reader is in, and locks the ones not reached yet", async () => {
    render(<Harness />);
    const index = screen.getByRole("navigation", { name: "In this lesson" });
    const buttons = within(index).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Greetings", "Small talk", "Goodbyes"]);
    await scroll(0);
    // Before the first heading nothing is current and every entry is locked.
    expect(index.querySelector("[aria-current]")).toBeNull();
    expect(buttons.map((button) => button.dataset.state)).toEqual(["locked", "locked", "locked"]);
    await scroll(1400);
    expect(buttons[1]).toHaveAttribute("aria-current", "location");
    expect(buttons.map((button) => button.dataset.state)).toEqual(["passed", "current", "locked"]);
    // Scrolling back moves the current entry back.
    await scroll(400);
    expect(buttons[0]).toHaveAttribute("aria-current", "location");
    expect(buttons.map((button) => button.dataset.state)).toEqual(["current", "locked", "locked"]);
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
