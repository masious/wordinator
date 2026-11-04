import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { WordMarksProvider } from "../WordMarks/WordMarks";
import { document, stored } from "../WordMarks/WordMarks.fixtures";
import { LessonDocument } from "./LessonDocument";

afterEach(cleanup);

describe("Lesson document with word marks", () => {
  it("marks the lesson's text and opens a card, and renders unchanged without marks", async () => {
    const { container, unmount } = render(<MantineProvider><WordMarksProvider document={document} marks={stored}><LessonDocument document={document} /></WordMarksProvider></MantineProvider>);
    expect([...container.querySelectorAll("[data-word-mark]")].map((mark) => mark.textContent)).toEqual(["sta", "op", "Waar ", "kom"]);
    fireEvent.click(container.querySelector("[data-word-mark]")!);
    expect(await screen.findByText("to get up")).toBeInTheDocument();
    unmount();
    const plain = render(<MantineProvider><LessonDocument document={document} /></MantineProvider>);
    expect(plain.container.querySelector("[data-word-mark]")).toBeNull();
    expect(screen.getByText(/Ik/)).toBeInTheDocument();
  });
});
