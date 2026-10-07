import { MantineProvider } from "@mantine/core";
import { flattenToSteps, LESSON_DOCUMENT_SCHEMA_VERSION, lessonDocumentSchema } from "@wordinator/contracts/lesson-document";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { runWords, WordRecap, type RecapWord } from "./WordRecap";

const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const words: RecapWord[] = [
  { id: id(1), term: "der Hund", meaning: "the dog", forms: "die Hunde", example: "Der Hund bellt.", note: "Masculine." },
  { id: id(2), term: "die Katze", meaning: "the cat", forms: null, example: null, note: null },
];

afterEach(cleanup);

describe("Word recap", () => {
  it("steps through cards and reveals each meaning on request", () => {
    const onDone = vi.fn();
    render(<MantineProvider><WordRecap words={words} doneLabel="Back to the course" onDone={onDone} /></MantineProvider>);
    expect(screen.getByText("Word 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "der Hund" })).toHaveTextContent("die Hunde");
    expect(screen.queryByText("the dog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Show meaning" }));
    expect(screen.getByText("the dog")).toBeInTheDocument();
    expect(screen.getByText("Der Hund bellt.")).toBeInTheDocument();
    expect(screen.getByText("Masculine.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Word 2 of 2")).toBeInTheDocument();
    // Each card starts concealed again.
    expect(screen.queryByText("the cat")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByText("the dog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the course" }));
    expect(onDone).toHaveBeenCalledOnce();
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
