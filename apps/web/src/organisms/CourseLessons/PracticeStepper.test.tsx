import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { PracticeStepper } from "./PracticeStepper";

// The lesson page's practice stepper (docs/courses.md#lesson-pages).
const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const practice = (n: number, questions: number): LessonBlockOf<"practice"> => ({ id: id(n), type: "practice", children: [],
  props: { data: JSON.stringify({ instruction: `Instruction ${n}.`, passage: null, items: Array.from({ length: questions }, (_, index) => ({ prompt: `Prompt ${n}.${index + 1}`, authorsVersion: ["x"], note: null })) }) } });
const scope = { groupId: id(90), courseId: id(91), lessonId: id(92), accountId: id(93) };
const items = [{ title: "Fill in", block: practice(1, 2) }, { title: "At breakfast", block: practice(2, 1) }, { title: null, block: practice(3, 3) }];
const renderStepper = (answered: Record<string, number>) => render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
  <PracticeStepper items={items} scope={scope} published archived={false}
    progress={Object.fromEntries(Object.entries(answered).map(([key, count]) => [key, { done: 0, started: 1, answered: count }]))} />
</QueryClientProvider></MantineProvider>);

afterEach(cleanup);

describe("PracticeStepper", () => {
  it("counts the viewer's done practices, opens on the first not done, and shows only that one under its title", () => {
    renderStepper({ [id(1)]: 2 });
    const stepper = screen.getByRole("region", { name: "Practices" });
    expect(within(stepper).getByText("1 of 3 done")).toBeInTheDocument();
    const segments = within(stepper).getAllByRole("button", { name: /^Practice \d/ });
    expect(segments.map((segment) => segment.getAttribute("aria-label"))).toEqual(["Practice 1: Fill in, done", "Practice 2: At breakfast", "Practice 3"]);
    expect(segments[1]).toHaveAttribute("aria-current", "step");
    expect(within(stepper).getByRole("heading", { name: "At breakfast" })).toBeInTheDocument();
    expect(within(stepper).getByText("Instruction 2.")).toBeInTheDocument();
    expect(within(stepper).queryByText("Instruction 1.")).not.toBeInTheDocument();
  });

  it("moves between practices with the arrows and the segments", () => {
    renderStepper({});
    const stepper = screen.getByRole("region", { name: "Practices" });
    expect(within(stepper).getByRole("button", { name: "Previous practice" })).toBeDisabled();
    fireEvent.click(within(stepper).getByRole("button", { name: "Next practice" }));
    expect(within(stepper).getByText("Instruction 2.")).toBeInTheDocument();
    fireEvent.click(within(stepper).getByRole("button", { name: "Practice 3" }));
    // An untitled practice shows no title, only its instruction.
    expect(within(stepper).getByText("Instruction 3.")).toBeInTheDocument();
    expect(within(stepper).queryByRole("heading")).not.toBeInTheDocument();
    expect(within(stepper).getByRole("button", { name: "Next practice" })).toBeDisabled();
  });

  it("saves the answered count of a practice whose answers are open when the stepper moves on", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ progress: { done: 0, started: 1, answered: 1 } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    renderStepper({});
    const stepper = screen.getByRole("region", { name: "Practices" });
    fireEvent.click(within(stepper).getByRole("button", { name: "Answer" }));
    const answers = within(stepper).getByRole("region", { name: "Answer the practice" });
    fireEvent.change(within(answers).getByLabelText(/^1\. Prompt 1\.1/), { target: { value: "x" } });
    // Moving on unmounts the open answers, which saves their count just as closing them does.
    fireEvent.click(within(stepper).getByRole("button", { name: "Next practice" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/groups/${id(90)}/courses/${id(91)}/lessons/${id(92)}/blocks/${id(1)}/progress`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ answered: 1 }) })));
    vi.unstubAllGlobals();
  });
});
