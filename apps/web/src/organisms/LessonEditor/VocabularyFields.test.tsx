import { MantineProvider } from "@mantine/core";
import type { VocabularyWord } from "@wordinator/contracts/lesson-document";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { VocabularyFields } from "./VocabularyFields";

const huis: VocabularyWord = { id: "70000000-0000-4000-8000-000000000001", term: "het huis", meaning: "house", forms: "de huizen" };
const tuin: VocabularyWord = { id: "70000000-0000-4000-8000-000000000002", term: "de tuin", meaning: "garden" };

function Harness({ initial, onChange }: { initial: VocabularyWord[]; onChange: (words: VocabularyWord[]) => void }) {
  const [words, setWords] = useState(initial);
  return <MantineProvider><VocabularyFields words={words} onChange={(next) => { setWords(next); onChange(next); }} /></MantineProvider>;
}
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.lastCall![0] as VocabularyWord[];

afterEach(cleanup);

describe("Vocabulary fields", () => {
  it("edits a word and drops an optional field that is cleared", () => {
    const onChange = vi.fn();
    render(<Harness initial={[huis]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/^Word 1 meaning/), { target: { value: "the house" } });
    expect(last(onChange)).toEqual([{ ...huis, meaning: "the house" }]);
    // Words with details start expanded.
    fireEvent.change(screen.getByLabelText("Word 1 forms"), { target: { value: "" } });
    expect(last(onChange)).toEqual([{ id: huis.id, term: "het huis", meaning: "the house" }]);
  });

  it("shows the optional fields of a word on request", () => {
    const onChange = vi.fn();
    render(<Harness initial={[tuin]} onChange={onChange} />);
    expect(screen.queryByLabelText("Word 1 example")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Forms, example, and note for word 1" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Word 1 example"), { target: { value: "De tuin is groot." } });
    expect(last(onChange)).toEqual([{ ...tuin, example: "De tuin is groot." }]);
  });

  it("adds an empty word with a fresh ID, reorders, and removes words but never the last one", () => {
    const onChange = vi.fn();
    render(<Harness initial={[huis]} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Remove word 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move word 1 up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add word" }));
    const [, added] = last(onChange);
    expect(added).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), term: "", meaning: "" });
    expect(added!.id).not.toBe(huis.id);
    fireEvent.click(screen.getByRole("button", { name: "Move word 2 up" }));
    expect(last(onChange).map((word) => word.id)).toEqual([added!.id, huis.id]);
    fireEvent.click(screen.getByRole("button", { name: "Remove word 1" }));
    expect(last(onChange)).toEqual([huis]);
  });
});
