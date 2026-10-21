import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionPips } from "./QuestionPips";

afterEach(cleanup);

describe("QuestionPips", () => {
  it("labels each status dot, marks the current step, and selects a dot", () => {
    const onSelect = vi.fn();
    render(<QuestionPips label="Practice steps" current={1} onSelect={onSelect} items={[
      { id: "a", label: "Practice 1 done", state: "done" },
      { id: "b", label: "Practice 2", state: "open" },
      { id: "c", label: "Practice 3 skipped", state: "skipped" },
    ]} />);
    const list = screen.getByRole("list", { name: "Practice steps" });
    const dots = within(list).getAllByRole("button");
    expect(dots[0]).toHaveAttribute("data-state", "done");
    expect(dots[1]).toHaveAttribute("aria-current", "step");
    expect(dots[2]).toHaveAttribute("data-state", "skipped");
    fireEvent.click(dots[2]!);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("disables navigation while its containing question set is locked", () => {
    render(<QuestionPips label="Question steps" current={0} disabled onSelect={() => undefined} items={[
      { id: "a", label: "Question 1", state: "answered" }, { id: "b", label: "Question 2", state: "open" },
    ]} />);
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
