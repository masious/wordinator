import { MantineProvider } from "@mantine/core";
import type { LessonDocument } from "@wordinator/contracts/lesson-document";
import { currentWordMarks, type LessonWordMarks } from "@wordinator/contracts/word-marks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { document, field, id, opstaan, sentence, stored } from "./WordMarks.fixtures";
import { MarkedInline, MarkedText, WordMarksProvider } from "./WordMarks";

afterEach(cleanup);
const renderMarks = (node: ReactNode, marks: LessonWordMarks | null = stored) =>
  render(<MantineProvider><WordMarksProvider document={document} marks={marks}>{node}</WordMarksProvider></MantineProvider>);
const Paragraph = ({ blockId }: { blockId: string }) => {
  const block = document.blocks.find((entry) => entry.id === blockId)!;
  return <p><MarkedInline blockId={blockId} content={"content" in block ? block.content as never : []}>plain</MarkedInline></p>;
};

describe("Word marks", () => {
  it("tints a split mark in every part and keeps the bold piece", () => {
    const { container } = renderMarks(<Paragraph blockId={id(1)} />);
    const marks = [...container.querySelectorAll("[data-word-mark]")];
    expect(marks.map((mark) => mark.textContent)).toEqual(["sta", "op"]);
    expect(marks.every((mark) => mark.getAttribute("data-tone") === "red")).toBe(true);
    expect(marks[0]!.closest("strong")).not.toBeNull();
    expect(container.querySelector("p")!.textContent).toBe(sentence);
  });

  it("splits a mark that crosses a bold piece into one wrapper per piece, with the default colour", () => {
    const { container } = renderMarks(<Paragraph blockId={id(2)} />);
    const marks = [...container.querySelectorAll("[data-word-mark]")];
    expect(marks.map((mark) => mark.textContent)).toEqual(["Waar ", "kom"]);
    expect(marks.every((mark) => !mark.hasAttribute("data-tone"))).toBe(true);
    expect(container.querySelector("p")!.textContent).toBe("Waar kom je");
  });

  it("opens the word card on click and on Enter, and closes it again", async () => {
    renderMarks(<Paragraph blockId={id(1)} />);
    const [first, second] = screen.getAllByRole("button");
    fireEvent.click(first!);
    expect(await screen.findByText("to get up")).toBeInTheDocument();
    expect(screen.getByText("/ɔpstaːn/")).toBeInTheDocument();
    fireEvent.click(first!);
    fireEvent.keyDown(second!, { key: "Enter" });
    expect(await screen.findByText("stond op")).toBeInTheDocument();
    expect(second).toHaveAttribute("aria-expanded", "true");
  });

  it("does not open on hover", () => {
    renderMarks(<Paragraph blockId={id(1)} />);
    fireEvent.mouseEnter(screen.getAllByRole("button")[0]!);
    expect(screen.queryByText("to get up")).not.toBeInTheDocument();
  });

  it("marks plain text fields and leaves other fields alone", () => {
    const turns: LessonWordMarks = { version: 1, fields: [{ blockId: id(1), field: "turn:0", fingerprint: "x", marks: [] }] };
    renderMarks(<><MarkedText blockId={id(1)} field="content" text={sentence} /><MarkedText blockId={id(1)} field="note" text="Geen" /></>, turns);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Ik sta vroeg opGeen/)).toBeInTheDocument();
  });

  it("ignores marks for words the lesson does not introduce", () => {
    const unknown: LessonWordMarks = { version: 1, fields: [field(id(1), sentence, [{ wordId: id(99), parts: [[3, 6]], color: null }])] };
    expect(currentWordMarks(document, unknown).size).toBe(0);
    renderMarks(<Paragraph blockId={id(1)} />, unknown);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("plain")).toBeInTheDocument();
  });

  it("shows no marks for a field whose text changed", () => {
    const stale: LessonWordMarks = { version: 1, fields: [field(id(1), sentence, [{ wordId: opstaan.id, parts: [[3, 6]], color: null }], "deadbeef")] };
    expect(currentWordMarks(document, stale).size).toBe(0);
    renderMarks(<Paragraph blockId={id(1)} />, stale);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
