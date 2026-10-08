import { MantineProvider } from "@mantine/core";
import { flattenToSteps, LESSON_DOCUMENT_SCHEMA_VERSION, lessonDocumentSchema } from "@wordinator/contracts/lesson-document";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { fitRows } from "./fitGrid";
import { runWords, WordRecap, type RecapWord } from "./WordRecap";

// jsdom has no layout, so each test sets the fit the grid would measure.
const fit = vi.hoisted(() => ({ value: { columns: 1, rows: 1 } }));
vi.mock("./fitGrid", async (importOriginal) => ({ ...await importOriginal<typeof import("./fitGrid")>(), measureFit: () => fit.value }));

const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const words: RecapWord[] = [
  { id: id(1), term: "der Hund", meaning: "the dog", forms: "die Hunde", example: "Der Hund bellt.", note: "Masculine." },
  { id: id(2), term: "die Katze", meaning: "the cat", forms: null, example: null, note: null },
];
const more: RecapWord[] = [...words, ...["das Haus", "der Baum", "die Tür"].map((term, index) => ({ id: id(index + 3), term, meaning: `meaning ${index + 3}`, forms: null, example: null, note: null }))];
const card = (term: string) => screen.getByRole("article", { name: term });
const renderRecap = (list: readonly RecapWord[], done = true) => {
  const onDone = vi.fn();
  render(<MantineProvider>{done ? <WordRecap words={list} doneLabel="Back to the course" onDone={onDone} /> : <WordRecap words={list} />}</MantineProvider>);
  return onDone;
};

afterEach(() => { cleanup(); fit.value = { columns: 1, rows: 1 }; });

describe("Word recap", () => {
  it("steps through one card at a time and flips each card to its meaning on request", () => {
    const onDone = renderRecap(words);
    expect(screen.getByText("Word 1 of 2")).toBeInTheDocument();
    expect(card("der Hund")).toHaveTextContent("die Hunde");
    expect(screen.queryByText("the dog")).not.toBeInTheDocument();
    // A single card needs no page-wide reveal.
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.click(within(card("der Hund")).getByRole("button", { name: "Show meaning" }));
    expect(screen.getByText("the dog")).toBeInTheDocument();
    expect(screen.getByText("Der Hund bellt.")).toBeInTheDocument();
    expect(screen.getByText("Masculine.")).toBeInTheDocument();
    fireEvent.click(within(card("der Hund")).getByRole("button", { name: "Hide meaning" }));
    expect(within(card("der Hund")).getByRole("button", { name: "Show meaning" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Word 2 of 2")).toBeInTheDocument();
    // Each page starts concealed again.
    expect(screen.queryByText("the cat")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByText("the dog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the course" }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("shows a page of cards, reveals the whole page, and moves by pages", () => {
    fit.value = { columns: 2, rows: 1 };
    const onDone = renderRecap(more);
    expect(screen.getByText("Words 1–2 of 5")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText("the dog")).toBeInTheDocument();
    expect(screen.getByText("the cat")).toBeInTheDocument();
    fireEvent.click(within(card("die Katze")).getByRole("button", { name: "Hide meaning" }));
    // With one card hidden again, the page action offers to show all once more.
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
    expect(within(card("der Hund")).getByRole("button", { name: "Show meaning" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Words 3–4 of 5")).toBeInTheDocument();
    expect(card("das Haus")).toBeInTheDocument();
    expect(screen.queryByText("meaning 3")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Word 5 of 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to the course" }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("keeps the first word in view when the page size changes", () => {
    renderRecap(more);
    for (let step = 0; step < 3; step += 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(card("der Baum")).toBeInTheDocument();
    act(() => { fit.value = { columns: 2, rows: 1 }; window.dispatchEvent(new Event("resize")); });
    expect(screen.getByText("Words 3–4 of 5")).toBeInTheDocument();
    act(() => { fit.value = { columns: 3, rows: 2 }; window.dispatchEvent(new Event("resize")); });
    expect(screen.getByText("Words 1–5 of 5")).toBeInTheDocument();
  });

  it("stops on the last page without a done action", () => {
    renderRecap(words, false);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("fits whole rows into the available height, at least one", () => {
    expect(fitRows(500, 240, 16)).toBe(2);
    expect(fitRows(496, 240, 16)).toBe(2);
    expect(fitRows(495, 240, 16)).toBe(1);
    expect(fitRows(100, 240, 16)).toBe(1);
    expect(fitRows(1000, 0, 16)).toBe(1);
  });

  it("collects a run's words once each, in step order", () => {
    const word = (n: number, term: string) => ({ id: id(n), term: ` ${term} `, meaning: "m", forms: "", note: "  " });
    const vocabulary = (n: number, ...entries: unknown[]) => ({ id: id(100 + n), type: "vocabulary", props: { data: JSON.stringify({ words: entries }) }, children: [] });
    const dialogue = { id: id(200), type: "dialogue", props: { turns: JSON.stringify([{ speaker: "A", text: "Hoi" }, { speaker: "B", text: "Dag" }]) }, children: [] };
    const document = lessonDocumentSchema.parse({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [dialogue, vocabulary(1, word(1, "hoi"), word(2, "dag")), vocabulary(2, word(3, "tot ziens"))] });
    expect(runWords(flattenToSteps(document))).toEqual([
      { id: id(1), term: "hoi", meaning: "m", forms: null, example: null, note: null },
      { id: id(2), term: "dag", meaning: "m", forms: null, example: null, note: null },
      { id: id(3), term: "tot ziens", meaning: "m", forms: null, example: null, note: null },
    ]);
  });
});
