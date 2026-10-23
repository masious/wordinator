import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { stopSpeech } from "../../molecules/Speech";
import { ReadAloudActivity, type ReadAloudActivityProps } from "./ReadAloudActivity";

const groupId = "20000000-0000-4000-8000-000000000001";
const endpoint = "/api/courses/c/lessons/l/activities/a1";
const runId = "70000000-0000-4000-8000-000000000001";
const uid = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Line = ReadAloudActivityProps["lines"][number];
// Dirk opens, Sofia answers, Dirk asks, Sofia answers again.
const lines: Line[] = [
  { id: uid(1), index: 0, speaker: "Dirk", dutchText: "Goedemorgen, Sofia." },
  { id: uid(2), index: 1, speaker: "Sofia", dutchText: "Goedemorgen, Dirk." },
  { id: uid(3), index: 2, speaker: "Dirk", dutchText: "Hoe gaat het?" },
  { id: uid(4), index: 3, speaker: "Sofia", dutchText: "Goed, dank je." },
];

type Call = { method: string; path: string; body: Record<string, unknown> | null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Serves the speech and answer routes; every request is recorded so tests can assert what the page sent.
function serve(options: { correct?: boolean; reference?: string | null } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    calls.push({ method, path, body });
    if (path.endsWith("/speech")) return json({ status: "ready", url: `https://media.test/${String(body?.lineId)}.mp3` });
    if (path.endsWith("/answers")) {
      return json({ answerId: uid(900), itemId: body?.itemId, correct: options.correct ?? true, reference: options.reference ?? null, explanation: null, pronunciation: null });
    }
    return json({ error: { code: "NOT_STUBBED", message: path } }, 500);
  }));
  return calls;
}
const speechLineIds = (calls: Call[]) => calls.filter((call) => call.path.endsWith("/speech")).map((call) => call.body?.lineId);
const answers = (calls: Call[]) => calls.filter((call) => call.path.endsWith("/answers"));

// The browser recognizer, faked: release (`stop`) delivers the transcript; `abort` cancels; `start` can be made to throw.
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static throwOnStart = false;
  static heard = "Goedemorgen, Dirk";
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  started = 0; stopped = 0; aborted = 0;
  constructor() { FakeRecognition.instances.push(this); }
  start() {
    if (FakeRecognition.throwOnStart) throw new Error("not allowed");
    this.started += 1;
    this.onaudiostart?.();
  }
  stop() {
    this.stopped += 1;
    this.onresult?.({ results: [Object.assign([{ transcript: FakeRecognition.heard }], { isFinal: true })] });
    this.onend?.();
  }
  abort() { this.aborted += 1; this.onend?.(); }
}

// Audio: each clip's play() is recorded; a test ends the clip to let the next one of the queue start.
let players: HTMLMediaElement[] = [];
const endClip = () => act(() => { players[players.length - 1]!.dispatchEvent(new Event("ended")); });

type HarnessProps = { onContinue: () => void; onChooseReader: (reader: string | null) => void; initialCursor?: number; initialReader?: string | null };
// The page's part: the chosen reader is the run's, and choosing one starts the reading over.
function Harness({ onContinue, onChooseReader, initialCursor = 0, initialReader = null }: HarnessProps) {
  const [cursor, setCursor] = useState(initialCursor);
  const [reader, setReader] = useState(initialReader);
  return <ReadAloudActivity groupId={groupId} language="nl" endpoint={endpoint} runId={runId} lines={lines} cursor={cursor} reader={reader}
    choosing={cursor === 0} advancing={false}
    onChooseReader={async (next) => { onChooseReader(next); setReader(next); setCursor(0); }}
    onContinue={() => { onContinue(); setCursor((value) => value + 1); }}
    backToLesson={<a href="/courses/dutch-foundations/lessons/lesson-title">Back to lesson</a>} />;
}

function renderDialogue(options: Partial<HarnessProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}>
    <Harness onContinue={options.onContinue ?? (() => undefined)} onChooseReader={options.onChooseReader ?? (() => undefined)} initialCursor={options.initialCursor} initialReader={options.initialReader} />
  </QueryClientProvider></MantineProvider>);
}

const mic = () => screen.getByRole("button", { name: "Hold to speak" });
const draftBox = () => screen.getByRole("textbox", { name: "What you said" }) as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "Send" });
const startButton = () => screen.getByRole("button", { name: "Start reading" });

// Choose Sofia, start, then let Dirk's line play to its end, so Sofia's line is ready.
async function startAsSofia() {
  fireEvent.click(screen.getByRole("radio", { name: "Sofia" }));
  fireEvent.click(startButton());
  await waitFor(() => expect(players.length).toBeGreaterThan(0));
  endClip();
  await waitFor(() => expect(mic()).not.toBeDisabled());
}

beforeEach(() => {
  players = [];
  FakeRecognition.instances = [];
  FakeRecognition.throwOnStart = false;
  FakeRecognition.heard = "Goedemorgen, Dirk";
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { players.push(this); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  localStorage.clear();
});
afterEach(() => {
  act(() => stopSpeech());
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Read aloud", () => {
  it("asks whose lines to read, offering each speaker once and All lines, and requests no audio before Start", async () => {
    const calls = serve();
    renderDialogue();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Dirk" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sofia" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All lines" })).toBeChecked();
    expect(speechLineIds(calls)).toEqual([]);
    expect(players).toHaveLength(0);
  });

  it("chooses the speaker on Start, then voices the other speaker's lines before the learner's", async () => {
    const calls = serve();
    const onChooseReader = vi.fn();
    renderDialogue({ onChooseReader });
    await startAsSofia();
    expect(onChooseReader).toHaveBeenCalledWith("Sofia");
    expect(speechLineIds(calls)).toEqual([uid(1)]);
    expect(screen.getByText("Read this line aloud as Sofia")).toBeInTheDocument();
    expect(screen.getByText("Your line 1 of 2")).toBeInTheDocument();
  });

  it("reads every line with no voiced lines when All lines is chosen, and keeps a reader the run already has", async () => {
    const calls = serve();
    const onChooseReader = vi.fn();
    renderDialogue({ onChooseReader });
    fireEvent.click(startButton());
    await waitFor(() => expect(mic()).not.toBeDisabled());
    expect(onChooseReader).not.toHaveBeenCalled();
    expect(screen.getByText("Read this line aloud as Dirk")).toBeInTheDocument();
    expect(screen.getByText("Your line 1 of 4")).toBeInTheDocument();
    expect(speechLineIds(calls)).toEqual([]);
  });

  it("resumes a started run at its line without asking again", async () => {
    serve();
    renderDialogue({ initialCursor: 1, initialReader: "Sofia" });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await waitFor(() => expect(players.length).toBeGreaterThan(0));
    endClip();
    expect(await screen.findByText("Read this line aloud as Sofia")).toBeInTheDocument();
    expect(screen.getByText("Goed, dank je.")).toBeInTheDocument();
  });

  it("writes the held transcript to the draft only, and sends it once as a spoken answer", async () => {
    const calls = serve();
    renderDialogue();
    await startAsSofia();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic());
    expect(draftBox().value).toBe("Goedemorgen, Dirk");
    expect(answers(calls)).toHaveLength(0);
    fireEvent.click(sendButton()); fireEvent.click(sendButton());
    await screen.findByText("Correct");
    expect(answers(calls)).toHaveLength(1);
    expect(answers(calls)[0]!.body).toMatchObject({ runId, itemId: uid(2), answer: { kind: "text", text: "Goedemorgen, Dirk" }, inputMode: "spoken" });
  });

  it("advances only after an explicit Continue, and voices the next line only then", async () => {
    const calls = serve();
    const onContinue = vi.fn();
    renderDialogue({ onContinue });
    await startAsSofia();
    fireEvent.change(draftBox(), { target: { value: "Goedemorgen, Dirk." } });
    fireEvent.click(sendButton());
    await screen.findByText("Correct");
    expect(speechLineIds(calls)).toEqual([uid(1)]);
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(speechLineIds(calls)).toEqual([uid(1), uid(3)]));
    endClip();
    expect(await screen.findByText("Goed, dank je.")).toBeInTheDocument();
  });

  it("falls back to typing when the recognizer throws, and calls a mismatch different, never wrong", async () => {
    const calls = serve({ correct: false, reference: "Goedemorgen, Dirk." });
    FakeRecognition.throwOnStart = true;
    renderDialogue();
    await startAsSofia();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic());
    expect(await screen.findByText("Speech recognition is not available right now. Type the line instead.")).toBeInTheDocument();
    fireEvent.change(draftBox(), { target: { value: "Dag Dirk" } });
    fireEvent.click(sendButton());
    expect(await screen.findByText("Different from the original line")).toBeInTheDocument();
    expect(screen.getByText("Original line: Goedemorgen, Dirk.")).toBeInTheDocument();
    expect(screen.queryByText(/wrong/i)).not.toBeInTheDocument();
    expect(answers(calls)[0]!.body).toMatchObject({ inputMode: "typed", answer: { kind: "text", text: "Dag Dirk" } });
  });

  it("does not start a capture while a voiced line is playing, and stops a capture on unmount", async () => {
    serve();
    const view = renderDialogue();
    fireEvent.click(screen.getByRole("radio", { name: "Sofia" }));
    fireEvent.click(startButton());
    await waitFor(() => expect(players.length).toBeGreaterThan(0));
    expect(mic()).toBeDisabled();
    fireEvent.pointerDown(mic());
    expect(FakeRecognition.instances).toHaveLength(0);
    endClip();
    await waitFor(() => expect(mic()).not.toBeDisabled());
    fireEvent.pointerDown(mic());
    expect(FakeRecognition.instances[0]!.started).toBe(1);
    view.unmount();
    expect(FakeRecognition.instances[0]!.aborted).toBe(1);
  });

  it("offers Finish and Back to lesson on the last line, and Listen plays the learner's own line", async () => {
    const calls = serve();
    const onContinue = vi.fn();
    renderDialogue({ onContinue, initialCursor: 1, initialReader: "Sofia" });
    await waitFor(() => expect(players.length).toBeGreaterThan(0));
    endClip();
    await waitFor(() => expect(mic()).not.toBeDisabled());
    fireEvent.change(draftBox(), { target: { value: "Goed, dank je." } });
    fireEvent.click(sendButton());
    await screen.findByText("Correct");
    expect(screen.getByRole("link", { name: "Back to lesson" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() => expect(speechLineIds(calls)).toContain(uid(4)));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
