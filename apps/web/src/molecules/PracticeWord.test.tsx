import { MantineProvider } from "@mantine/core";
import { parseMessageMarks, type TutorWordPracticeWord } from "@wordinator/contracts/tutor";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../i18n";
import { AssistantText } from "../organisms/Tutor/Markdown";
import { MarkedPassage, PracticeWordsContext } from "./PracticeWord";

const id = (n: number) => `93000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const words: TutorWordPracticeWord[] = [
  { lessonId: id(1), wordId: id(2), term: "de tafel", source: "drill", meaning: "the table", forms: "tafels", example: "De tafel is rond.", note: "Also a times table." },
];
const withWords = (node: React.ReactNode) => render(<MantineProvider><PracticeWordsContext.Provider value={words}>{node}</PracticeWordsContext.Provider></MantineProvider>);

afterEach(cleanup);

describe("practice word highlights", () => {
  it("highlights a marked word in the tutor's text and shows its card on focus and hover", async () => {
    const { text, spans, words: marks } = parseMessageMarks("Zet het op de [[{{tafels|1}}]], niet {{daar|5}}.", 1);
    withWords(<AssistantText text={text} spans={spans} words={marks} />);
    const mark = screen.getByText("tafels");
    expect(mark.tagName).toBe("MARK");
    expect(screen.getByText(/niet daar/)).toBeInTheDocument();
    expect(screen.queryByText("the table")).not.toBeInTheDocument();
    fireEvent.focus(mark);
    expect(await screen.findByText("the table")).toBeInTheDocument();
    expect(screen.getByText("De tafel is rond.")).toBeInTheDocument();
    expect(screen.getByText("Also a times table.")).toBeInTheDocument();
    fireEvent.blur(mark);
    fireEvent.mouseEnter(mark);
    expect(await screen.findByText("the table")).toBeInTheDocument();
  });

  it("keeps a passage's card closed until it is allowed", () => {
    withWords(<MarkedPassage text="Een tafel." marks={[{ start: 4, end: 9, index: 0 }]} card={false} />);
    const mark = screen.getByText("tafel");
    expect(mark.tagName).toBe("MARK");
    fireEvent.focus(mark); fireEvent.mouseEnter(mark);
    expect(screen.queryByText("the table")).not.toBeInTheDocument();
  });
});
