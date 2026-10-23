import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { AnswerResult, ChoiceOptions, CorrectBadge } from "./ChoiceOptions";

const options = [{ id: "a", text: "Om één uur heb ik een vergadering" }, { id: "b", text: "Ik heb een vergadering om één uur" }, { id: "c", text: "Een vergadering heb ik om één uur" }];
const renderOptions = (props: Partial<Parameters<typeof ChoiceOptions>[0]> = {}) =>
  render(<MantineProvider><ChoiceOptions prompt="Which phrase?" options={options} selected="" result={null} onSelect={() => undefined} {...props} /></MantineProvider>);

afterEach(() => cleanup());

describe("ChoiceOptions", () => {
  it("selects an option before the answer is checked, with no marks", () => {
    const onSelect = vi.fn();
    renderOptions({ selected: "b", onSelect });
    const group = screen.getByRole("group", { name: "Which phrase?" });
    expect(within(group).getByRole("button", { name: options[1]!.text })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: options[0]!.text }));
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(group.querySelector("[data-correct], [data-wrong]")).toBeNull();
  });

  it("once checked, locks the options, turns the correct one green with its badge, and marks a wrong pick", () => {
    renderOptions({ selected: "b", result: { correct: false, reference: options[0]!.text } });
    const group = screen.getByRole("group", { name: "Which phrase?" });
    const correct = within(group).getByRole("button", { name: `${options[0]!.text} Correct answer` });
    expect(correct).toHaveAttribute("data-correct");
    expect(correct).toBeDisabled();
    expect(within(group).getByRole("button", { name: options[1]!.text })).toHaveAttribute("data-wrong");
    expect(within(group).getAllByText("Correct answer")).toHaveLength(1);
  });

  it("ends a checked answer with a boxless result row whose Continue takes focus, so Enter moves on", () => {
    const onContinue = vi.fn();
    render(<MantineProvider><AnswerResult status={<CorrectBadge />} continueLabel="Continue" advancing={false} onRetry={() => undefined} onContinue={onContinue} /></MantineProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Correct");
    const next = screen.getByRole("button", { name: "Continue" });
    expect(next).toHaveFocus();
    fireEvent.click(next);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
