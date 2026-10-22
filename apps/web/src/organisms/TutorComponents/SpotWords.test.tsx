import { MantineProvider } from "@mantine/core";
import type { TutorComponentAnswer, TutorComponentView, TutorGrade } from "@wordinator/contracts/tutor";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { AnswerComponent } from "./index";

const id = (n: number) => `92000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const view: Extract<TutorComponentView, { kind: "spot_words" }> = {
  kind: "spot_words", passage: "Het huis heeft een tafel.", translation: "The house has a table.",
  words: [{ lessonId: id(1), wordId: id(2), term: "het huis", meaning: "the house", forms: null }, { lessonId: id(1), wordId: id(3), term: "de tafel", meaning: "the table", forms: null }],
};
const grade: TutorGrade = { correct: false, matched: null, verdict: null, note: null, reference: "The house has a table.", items: [], score: null };

afterEach(cleanup);

describe("Spot the words", () => {
  it("sends the ticks, then shows meanings and the translation", async () => {
    const onAnswer = vi.fn(async (_answer: TutorComponentAnswer) => undefined);
    const { rerender } = render(<MantineProvider><AnswerComponent view={view} answer={null} grade={null} onAnswer={onAnswer} /></MantineProvider>);
    expect(screen.getByText("Het huis heeft een tafel.")).toBeInTheDocument();
    expect(screen.queryByText("the house")).not.toBeInTheDocument();
    expect(screen.queryByText(/The house has a table/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I know “het huis”" }));
    expect(screen.getByRole("button", { name: "I know “het huis”" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Send checklist" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "spot_words", known: [true, false] }));
    rerender(<MantineProvider><AnswerComponent view={view} answer={{ kind: "spot_words", known: [true, false] }} grade={grade} onAnswer={onAnswer} /></MantineProvider>);
    expect(screen.getByText("Recognised 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("the table")).toBeInTheDocument();
    expect(screen.getByText(/The house has a table/)).toBeInTheDocument();
  });
});

describe("answer marks", () => {
  const translate: TutorComponentView = { kind: "translate", source: "I see many things at the market." };
  const miss = (fields: Partial<TutorGrade>): TutorGrade => ({ ...grade, correct: false, matched: false, verdict: "error", note: "At a market is op.", reference: "Ik zie veel spullen op de markt.", ...fields });

  it("stacks each fix over the smaller typed word, for up to three mistakes, against the judge's correction", () => {
    render(<MantineProvider><AnswerComponent view={translate} answer={{ kind: "translate", text: "ik zie veel spulen in de markt" }}
      grade={miss({ corrected: "Ik zie veel spullen op de markt." })} onAnswer={vi.fn()} /></MantineProvider>);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("in").tagName).toBe("DEL");
    expect(screen.getByText("op").tagName).toBe("INS");
    expect(screen.getByText("spulen", { selector: "del" })).toBeInTheDocument();
    expect(screen.getByText("l", { selector: "u" }).closest("ins")).toHaveTextContent("spullen");
    // The correction says what the reference says, so the reference is not repeated.
    expect(screen.queryByText("Expected")).not.toBeInTheDocument();
  });

  it("keeps the field and the expected answer without a correction or with too many mistakes", () => {
    const { unmount } = render(<MantineProvider><AnswerComponent view={translate} answer={{ kind: "translate", text: "ik zie veel spullen in de markt" }} grade={miss({})} onAnswer={vi.fn()} /></MantineProvider>);
    expect(screen.getByRole("textbox")).toHaveValue("ik zie veel spullen in de markt");
    expect(screen.getByText("Expected")).toBeInTheDocument();
    unmount();
    render(<MantineProvider><AnswerComponent view={translate} answer={{ kind: "translate", text: "ik heb gisteren een boek gekocht" }}
      grade={miss({ corrected: "Wij hebben gisteren twee boeken gekocht." })} onAnswer={vi.fn()} /></MantineProvider>);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows a correction that differs from the reference with the reference as another way", () => {
    render(<MantineProvider><AnswerComponent view={translate} answer={{ kind: "translate", text: "ik zie veel dingen in de markt" }}
      grade={miss({ corrected: "Ik zie veel dingen op de markt." })} onAnswer={vi.fn()} /></MantineProvider>);
    expect(screen.getByText("op").tagName).toBe("INS");
    expect(screen.getByText("Also right")).toBeInTheDocument();
  });
});

describe("answered set", () => {
  it("moves a settled set to the learner's side, one answer at a time with pips", async () => {
    const { AssistantParts } = await import("../Tutor/Messages");
    const choice = (n: number, correct: boolean) => ({
      type: "component" as const, toolCallId: id(50 + n), kind: "choice" as const, answeredAt: 1, skipped: false,
      view: { kind: "choice" as const, question: `Question ${n}?`, options: ["a", "b", "c"] }, answer: { kind: "choice" as const, choice: 0 },
      grade: { ...grade, correct, matched: correct, reference: "a" },
    });
    const parts = [{ type: "text" as const, text: "Three questions.", spans: [] }, choice(1, true), choice(2, false), choice(3, true)];
    render(<MantineProvider><AssistantParts parts={parts as never} streaming={false} handlers={{ disabled: false }} /></MantineProvider>);
    const answers = screen.getByRole("region", { name: "Your answers" });
    expect(screen.getByRole("article", { name: /tutor/i })).not.toHaveTextContent("Question 1?");
    expect(within(answers).getByText("Question 1?")).toBeInTheDocument();
    expect(within(answers).getByText("2 of 3 right")).toBeInTheDocument();
    fireEvent.click(within(answers).getByRole("button", { name: "Answer 2: not quite" }));
    expect(within(answers).getByText("Question 2?")).toBeInTheDocument();
  });
});
