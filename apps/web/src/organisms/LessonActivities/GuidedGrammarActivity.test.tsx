import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { apiRequest } from "../../api";
import { GuidedGrammarActivity, type GuidedGrammarActivityProps, type GuidedGrammarStep } from "./GuidedGrammarActivity";

vi.mock("../../api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../api")>()), apiRequest: vi.fn() }));

const endpoint = "/api/activities/activity-1";
const lessonText = (n: number) => `Lesson text for step ${n}.`;
const paragraph = (n: number): GuidedGrammarStep["blocks"][number] => ({
  id: `block-${n}`, type: "paragraph", props: { textColor: "default", backgroundColor: "default" },
  content: [{ type: "text", text: lessonText(n), styles: {} }], children: [],
});
const step = (n: number): GuidedGrammarStep => ({
  blocks: [paragraph(n)],
  question: {
    id: `question-${n}`, kind: "choice", prompt: `Which form fits step ${n}?`,
    options: [{ id: `q${n}-a`, text: `Option A${n}` }, { id: `q${n}-b`, text: `Option B${n}` }, { id: `q${n}-c`, text: `Option C${n}` }],
  },
});
const steps = [step(1), step(2), step(3)];

function renderActivity(overrides: Partial<GuidedGrammarActivityProps> = {}) {
  const props: GuidedGrammarActivityProps = {
    endpoint, runId: "run-1", steps, cursor: 0, advancing: false, onContinue: vi.fn(), onComplete: vi.fn(), ...overrides,
  };
  const client = new QueryClient();
  const tree = (current: GuidedGrammarActivityProps) => <MantineProvider>
    <QueryClientProvider client={client}><GuidedGrammarActivity {...current} /></QueryClientProvider>
  </MantineProvider>;
  const view = render(tree(props));
  return { props, moveTo: (cursor: number) => view.rerender(tree({ ...props, cursor })) };
}

const correctAnswer = (itemId: string) => ({ answerId: "answer-1", itemId, correct: true, reference: "Option B", explanation: "Because it fits.", pronunciation: null });

describe("GuidedGrammarActivity", () => {
  beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
  afterEach(() => { cleanup(); });

  it("renders the saved step's blocks and question and resumes there", () => {
    renderActivity({ cursor: 1 });

    expect(screen.getByText(lessonText(2))).toBeTruthy();
    expect(screen.queryByText(lessonText(1))).toBeNull();
    expect(screen.getByText("Which form fits step 2?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Option B2" })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  });

  it("shows feedback after a checked answer, then the next step when Continue is pressed", async () => {
    vi.mocked(apiRequest).mockResolvedValue(correctAnswer("question-1"));
    const { props, moveTo } = renderActivity();

    fireEvent.click(screen.getByRole("button", { name: "Option B1" }));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText("Correct")).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith(`${endpoint}/answers`, expect.anything(), expect.objectContaining({ method: "POST" }));

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(props.onContinue).toHaveBeenCalledTimes(1);
    expect(props.onComplete).not.toHaveBeenCalled();

    moveTo(1);
    expect(screen.getByText(lessonText(2))).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Check answer" }).hasAttribute("disabled")).toBe(true);
  });

  it("completes the activity when the last step's Continue is pressed", async () => {
    vi.mocked(apiRequest).mockResolvedValue(correctAnswer("question-3"));
    const { props } = renderActivity({ cursor: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Option B3" }));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1));
    expect(props.onContinue).not.toHaveBeenCalled();
  });
});
