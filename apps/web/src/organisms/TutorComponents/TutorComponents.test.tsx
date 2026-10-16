import { MantineProvider } from "@mantine/core";
import type { TutorComponentAnswer, TutorComponentView, TutorGrade } from "@wordinator/contracts/tutor";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { stopSpeech } from "../../molecules/Speech";
import { setRecognizer } from "../../molecules/speechRecognition";
import { AnswerComponent, ClipButton, resetOnDemandSpeech, type ClipResult, type ClipSource } from "./index";

const grade = (fields: Partial<TutorGrade> & Pick<TutorGrade, "correct">): TutorGrade => ({ matched: null, verdict: null, note: null, reference: null, items: [], score: null, ...fields });

function renderComponent(view: TutorComponentView, options: { answer?: TutorComponentAnswer | null; grade?: TutorGrade | null; onAnswer?: (answer: TutorComponentAnswer) => Promise<unknown>; clip?: ClipSource } = {}) {
  const onAnswer = vi.fn(options.onAnswer ?? (async () => undefined));
  const result = render(<MantineProvider><AnswerComponent view={view} answer={options.answer ?? null} grade={options.grade ?? null} onAnswer={onAnswer} clip={options.clip} language="Dutch" /></MantineProvider>);
  return { ...result, onAnswer };
}

beforeEach(() => {
  resetOnDemandSpeech();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("playing")); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => { act(() => stopSpeech()); cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("Answer components", () => {
  it("Fill in the blank sends one entry per blank, then shows the grade in place", async () => {
    const view: TutorComponentView = { kind: "fill_in", prompt: "Ik … naar … .", blanks: 2, translation: "I go home." };
    const { onAnswer, rerender } = renderComponent(view);
    fireEvent.change(screen.getByRole("textbox", { name: "Blank 1" }), { target: { value: "ga" } });
    const second = screen.getByRole("textbox", { name: "Blank 2" });
    fireEvent.change(second, { target: { value: " huis " } });
    fireEvent.keyDown(second, { key: "Enter" });
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "fill_in", blanks: ["ga", "huis"] }));
    expect(screen.getByRole("textbox", { name: "Blank 1" })).toBeDisabled();
    rerender(<MantineProvider><AnswerComponent view={view} answer={{ kind: "fill_in", blanks: ["ga", "huis"] }} onAnswer={onAnswer}
      grade={grade({ correct: false, matched: false, reference: "ga · naar huis", items: [{ expected: "ga", given: "ga", ok: true }, { expected: "naar huis", given: "huis", ok: false }] })} /></MantineProvider>);
    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("ga · naar huis")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  it("re-opens after a failed send", async () => {
    const { onAnswer } = renderComponent({ kind: "translate", source: "The house is big." }, { onAnswer: async () => { throw new Error("offline"); } });
    fireEvent.change(screen.getByRole("textbox", { name: "Your translation" }), { target: { value: "Het huis is groot." } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your answer was not sent");
    expect(onAnswer).toHaveBeenCalledWith({ kind: "translate", text: "Het huis is groot." });
    expect(screen.getByRole("textbox", { name: "Your translation" })).toBeEnabled();
  });

  it("Translate shows the tutor's verdict and note for an accepted answer", () => {
    renderComponent({ kind: "translate", source: "The house is big." }, {
      answer: { kind: "translate", text: "Het huis is erg groot." },
      grade: grade({ correct: true, matched: false, verdict: "acceptable", note: "Fine, erg adds emphasis.", reference: "Het huis is groot." }),
    });
    expect(screen.getByText("Good answer")).toBeInTheDocument();
    // The other phrasing and the note share one feedback box, each under its term.
    const box = screen.getByText("Fine, erg adds emphasis.").closest("dl")!;
    expect(within(box).getAllByRole("term").map((term) => term.textContent)).toEqual(["Also right", "Tutor’s note"]);
    expect(within(box).getByText("Het huis is groot.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your translation" })).toHaveValue("Het huis is erg groot.");
  });

  it("keeps word hints closed until opened, sends the opened ones with the answer, and shows them all after", async () => {
    const hints = [
      { lessonId: "11111111-1111-4111-8111-111111111111", wordId: "22222222-2222-4222-8222-222222222222", cue: "tidy up", term: "opruimen", meaning: "to tidy up", forms: "ruimde op, opgeruimd" },
      { lessonId: "11111111-1111-4111-8111-111111111111", wordId: "33333333-3333-4333-8333-333333333333", cue: "the kitchen", term: "de keuken", meaning: "the kitchen", forms: null },
    ];
    const { onAnswer } = renderComponent({ kind: "translate", source: "I tidy up the kitchen.", hints });
    expect(screen.queryByText("opruimen")).toBeNull();
    expect(screen.queryByText("de keuken")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the word for “tidy up”" }));
    expect(screen.getByText("opruimen")).toBeInTheDocument();
    expect(screen.queryByText("de keuken")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Your translation" }), { target: { value: "Ik ruim de keuken op." } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "translate", text: "Ik ruim de keuken op.", hintsUsed: [{ lessonId: "11111111-1111-4111-8111-111111111111", wordId: "22222222-2222-4222-8222-222222222222" }] }));
    expect(await screen.findByText("de keuken")).toBeInTheDocument();
    expect(screen.getByText("opruimen").closest("[data-used]")).not.toBeNull();
    expect(screen.getByText("de keuken").closest("[data-used]")).toBeNull();
  });

  it("Word order places chunks by click and moves them with the arrow keys", async () => {
    const { onAnswer } = renderComponent({ kind: "word_order", chunks: ["groot", "Het huis", "is"], translation: "The house is big." });
    const check = screen.getByRole("button", { name: "Check" });
    expect(check).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add “Het huis”" }));
    fireEvent.click(screen.getByRole("button", { name: "Add “groot”" }));
    fireEvent.click(screen.getByRole("button", { name: "Add “is”" }));
    // groot is second; ArrowRight moves it after is.
    const groot = screen.getByRole("button", { name: "Remove “groot”, place 2" });
    fireEvent.keyDown(groot, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Remove “groot”, place 3" })).toHaveFocus();
    // Removing returns a chunk to the pool.
    fireEvent.click(screen.getByRole("button", { name: "Remove “is”, place 2" }));
    expect(screen.getByRole("button", { name: "Add “is”" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add “is”" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Remove “is”, place 3" }), { key: "ArrowLeft" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "word_order", chunks: ["Het huis", "is", "groot"] }));
  });

  it("De or het picks with the toggles or the number keys", async () => {
    const { onAnswer } = renderComponent({ kind: "article", options: ["de", "het"], nouns: [{ noun: "huis", meaning: "house" }, { noun: "man", meaning: null }] });
    const first = screen.getByRole("group", { name: "Article for huis" });
    fireEvent.click(within(first).getByRole("button", { name: "het" }));
    expect(within(first).getByRole("button", { name: "het" })).toHaveAttribute("aria-pressed", "true");
    const second = screen.getByRole("group", { name: "Article for man" });
    fireEvent.keyDown(within(second).getByRole("button", { name: "het" }), { key: "1" });
    expect(within(second).getByRole("button", { name: "de" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "article", articles: ["het", "de"] }));
  });

  it("Multiple choice answers with keys 1–4 and then marks the correct option", async () => {
    const view: TutorComponentView = { kind: "choice", question: "What does huis mean?", options: ["house", "mouse", "horse"] };
    const { onAnswer, rerender } = renderComponent(view);
    fireEvent.keyDown(screen.getByRole("button", { name: /house/ }), { key: "2" });
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "choice", choice: 1 }));
    rerender(<MantineProvider><AnswerComponent view={view} answer={{ kind: "choice", choice: 1 }} onAnswer={onAnswer}
      grade={grade({ correct: false, matched: false, reference: "house", items: [{ expected: "house", given: "mouse", ok: false }] })} /></MantineProvider>);
    expect(screen.getByRole("button", { name: /mouse/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /house/ })).toHaveAttribute("data-correct");
    expect(screen.getByRole("button", { name: /horse/ })).toBeDisabled();
  });

  it("Quick review grades each drill card and sends the results after the last", async () => {
    const card = (wordId: string, term: string) => ({ lessonId: "l1", wordId, direction: "understand" as const, term, meaning: `${term} meaning`, forms: null, example: null });
    const { onAnswer } = renderComponent({ kind: "quick_review", cards: [card("w1", "huis"), card("w2", "boom")] });
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: /Got it/ }));
    expect(screen.getByText("Card 2 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: /Again/ }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "quick_review", results: ["got", "again"] }));
  });

  it("Say it with the browser recognizer says it needs Microsoft and offers to switch", () => {
    vi.stubGlobal("webkitSpeechRecognition", class {});
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
    renderComponent({ kind: "say_it", sentence: "Goedemorgen", translation: "Good morning" });
    expect(screen.getByText(/Say it needs the Microsoft recognizer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use Microsoft on this device" }));
    expect(screen.queryByText(/Say it needs the Microsoft recognizer/)).toBeNull();
    setRecognizer("browser");
  });

  it("Say it shows the stored score and breakdown once answered", () => {
    const scores = { overall: 82, accuracy: 85, fluency: 80, completeness: 100, words: [{ word: "Goedemorgen", accuracy: 85, error: "none" as const }] };
    renderComponent({ kind: "say_it", sentence: "Goedemorgen", translation: null }, { answer: { kind: "say_it", scores }, grade: grade({ correct: true, score: 82, reference: "Goedemorgen" }) });
    expect(screen.getByText("Well said")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /82/ })).toBeInTheDocument();
  });

  it("Dictation plays its audio and sends what was typed", async () => {
    const clip = { key: "dictation", load: vi.fn(async (): Promise<ClipResult> => ({ status: "ready", url: "https://media.test/d.mp3" })) };
    const { onAnswer } = renderComponent({ kind: "dictation", translation: null }, { clip });
    fireEvent.click(screen.getByRole("button", { name: "Play the sentence" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox", { name: "What you heard" }), { target: { value: "ik ben moe" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "dictation", text: "ik ben moe" }));
  });

  it("offers a quiet Skip on a waiting component, also in Say it's needs-Microsoft state, and none once answered", async () => {
    vi.stubGlobal("webkitSpeechRecognition", class {});
    setRecognizer("browser");
    const onSkip = vi.fn(async () => undefined);
    const view: TutorComponentView = { kind: "say_it", sentence: "Goedemorgen", translation: null };
    const { rerender } = render(<MantineProvider><AnswerComponent view={view} answer={null} grade={null} onAnswer={vi.fn()} onSkip={onSkip} /></MantineProvider>);
    expect(screen.getByText(/Say it needs the Microsoft recognizer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip this question" }));
    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
    // A busy chat disables it; a stored answer removes it.
    rerender(<MantineProvider><AnswerComponent view={view} answer={null} grade={null} onAnswer={vi.fn()} onSkip={onSkip} disabled /></MantineProvider>);
    expect(screen.getByRole("button", { name: "Skip this question" })).toBeDisabled();
    const choice: TutorComponentView = { kind: "choice", question: "What does huis mean?", options: ["house", "mouse"] };
    rerender(<MantineProvider><AnswerComponent view={choice} answer={{ kind: "choice", choice: 0 }} grade={null} onAnswer={vi.fn()} onSkip={onSkip} /></MantineProvider>);
    expect(screen.queryByRole("button", { name: "Skip this question" })).toBeNull();
    // Without `onSkip` (the lesson page) there is no Skip at all.
    rerender(<MantineProvider><AnswerComponent view={choice} answer={null} grade={null} onAnswer={vi.fn()} /></MantineProvider>);
    expect(screen.queryByRole("button", { name: "Skip this question" })).toBeNull();
  });

  it("shows a failed skip and keeps the component open", async () => {
    render(<MantineProvider><AnswerComponent view={{ kind: "choice", question: "Q", options: ["a", "b"] }} answer={null} grade={null} onAnswer={vi.fn()}
      onSkip={async () => { throw new Error("offline"); }} /></MantineProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Skip this question" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your answer was not sent");
    expect(screen.getByRole("button", { name: "Skip this question" })).toBeEnabled();
  });

  it("Fix the mistake starts from the sentence", async () => {
    const { onAnswer } = renderComponent({ kind: "fix_mistake", sentence: "Ik heb naar huis gegaan.", hint: "The auxiliary" });
    const field = screen.getByRole("textbox", { name: "The corrected sentence" });
    expect(field).toHaveValue("Ik heb naar huis gegaan.");
    fireEvent.change(field, { target: { value: "Ik ben naar huis gegaan." } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ kind: "fix_mistake", text: "Ik ben naar huis gegaan." }));
  });
});

describe("On-demand speaker button", () => {
  const renderButton = (load: () => Promise<ClipResult>, key = "k") =>
    render(<MantineProvider><ClipButton clip={{ key, load }} label="Play" /></MantineProvider>);

  it("loads once, plays, and plays the cached clip on the next press", async () => {
    let resolve: (value: ClipResult) => void = () => undefined;
    const load = vi.fn(() => new Promise<ClipResult>((done) => { resolve = done; }));
    renderButton(load);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-busy", "true");
    await act(async () => resolve({ status: "ready", url: "https://media.test/a.mp3" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    act(() => stopSpeech());
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("asks again after a 202 until the clip is ready", async () => {
    vi.useFakeTimers();
    const load = vi.fn<() => Promise<ClipResult>>().mockResolvedValueOnce({ status: "pending" }).mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValue({ status: "ready", url: "https://media.test/b.mp3" });
    renderButton(load, "retry");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(load).toHaveBeenCalledTimes(3);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("gives up after five retries", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async (): Promise<ClipResult> => ({ status: "pending" }));
    renderButton(load, "never");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(load).toHaveBeenCalledTimes(6);
    expect(screen.getByRole("status")).toHaveTextContent("This audio could not be played.");
  });

  it("says when the daily audio limit is reached", async () => {
    renderButton(async () => ({ status: "limit", resetsAt: Date.UTC(2026, 9, 17) }), "limit");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Today’s audio limit is reached");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("hides every speaker button for the visit when speech is unavailable", async () => {
    render(<MantineProvider>
      <ClipButton clip={{ key: "u1", load: async () => ({ status: "unavailable" }) }} label="First" />
      <ClipButton clip={{ key: "u2", load: async () => ({ status: "ready", url: "https://media.test/c.mp3" }) }} label="Second" />
    </MantineProvider>);
    fireEvent.click(screen.getByRole("button", { name: "First" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Second" })).toBeNull());
    expect(screen.queryByRole("button", { name: "First" })).toBeNull();
  });
});
