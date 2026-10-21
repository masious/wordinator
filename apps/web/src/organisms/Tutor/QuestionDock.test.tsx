import { MantineProvider } from "@mantine/core";
import { tutorComponentViewSchema, type TutorPart } from "@wordinator/contracts/tutor";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { QuestionDock } from "./QuestionDock";

type Question = Extract<TutorPart, { type: "component" }>;
const questions: Question[] = [
  { type: "component", toolCallId: "question-1", kind: "fill_in", view: tutorComponentViewSchema.parse({ kind: "fill_in", prompt: "Ik woon in een … huis.", blanks: 1, translation: "I live in a large house." }), answer: null, grade: null, answeredAt: null },
  { type: "component", toolCallId: "question-2", kind: "choice", view: tutorComponentViewSchema.parse({ kind: "choice", question: "Which is larger?", options: ["A", "B"] }), answer: null, grade: null, answeredAt: null },
];

afterEach(cleanup);

describe("QuestionDock", () => {
  it("uses the shared pips to navigate and shows a skipped question's status", () => {
    render(<MantineProvider><QuestionDock components={questions} language="Dutch" disabled={false} onSubmit={async () => undefined} /></MantineProvider>);
    const dock = screen.getByRole("region", { name: "Your tutor’s questions" });
    const pips = within(dock).getByRole("list", { name: "Your tutor’s questions" });
    const second = within(pips).getByRole("button", { name: "Question 2, not answered" });
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-current", "step");
    fireEvent.click(within(dock).getByRole("button", { name: "Skip" }));
    expect(within(pips).getByRole("button", { name: "Question 2, skipped" })).toHaveAttribute("data-state", "skipped");
  });
});
