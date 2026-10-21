import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { stopSpeech } from "../../molecules/Speech";
import { RoleplayActivity, type RoleplayActivityProps } from "./RoleplayActivity";

const groupId = "20000000-0000-4000-8000-000000000001";
const endpoint = "/api/courses/c/lessons/l/activities/a1";
const runId = "70000000-0000-4000-8000-000000000001";
const uid = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Turn = RoleplayActivityProps["turns"][number];
// Dirk opens, Sofia answers, Dirk asks, Sofia answers again.
const turns: Turn[] = [
  { id: uid(1), index: 0, speaker: "Dirk", isLearner: false, cue: null, dutchText: "Goedemorgen, Sofia.", englishText: "Good morning, Sofia.", voice: null },
  { id: uid(2), index: 1, speaker: "Sofia", isLearner: true, cue: "Greet Dirk back.", dutchText: "Goedemorgen, Dirk.", englishText: "Good morning, Dirk.", voice: null },
  { id: uid(3), index: 2, speaker: "Dirk", isLearner: false, cue: null, dutchText: "Hoe gaat het?", englishText: "How are you?", voice: null },
  { id: uid(4), index: 3, speaker: "Sofia", isLearner: true, cue: "Say you are fine, thanks.", dutchText: "Goed, dank je.", englishText: "Good, thanks.", voice: null },
];

type Call = { method: string; path: string; body: Record<string, unknown> | null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Serves the speech and answer routes; every request is recorded so tests can assert what the page sent.
function serve(options: { correct?: boolean; reference?: string | null; speechStatus?: number } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    calls.push({ method, path, body });
    if (path.endsWith("/speech")) {
      if (options.speechStatus) return json({ error: { code: "SPEECH_UNAVAILABLE", message: "" } }, options.speechStatus);
      return json({ status: "ready", url: `https://media.test/${String(body?.turnId)}.mp3` });
    }
    if (path.endsWith("/answers")) {
      return json({ answerId: uid(900), itemId: body?.itemId, correct: options.correct ?? true, reference: options.reference ?? null, explanation: null, pronunciation: null });
    }
    return json({ error: { code: "NOT_STUBBED", message: path } }, 500);
  }));
  return calls;
}
const speechTurnIds = (calls: Call[]) => calls.filter((call) => call.path.endsWith("/speech")).map((call) => call.body?.turnId);
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

function Harness({ onContinue, initialCursor = 0, cueMode = "english" }: { onContinue: () => void; initialCursor?: number; cueMode?: "english" | "dutch" }) {
  const [cursor, setCursor] = useState(initialCursor);
  return <RoleplayActivity groupId={groupId} language="nl" endpoint={endpoint} runId={runId} turns={turns} cursor={cursor} cueMode={cueMode}
    keyFor={() => null} advancing={false} onCueMode={() => undefined}
    onContinue={() => { onContinue(); setCursor((value) => value + 1); }}
    backToLesson={<a href="/courses/dutch-foundations/lessons/lesson-title">Back to lesson</a>} />;
}

function renderDialogue(options: { onContinue?: () => void; initialCursor?: number; cueMode?: "english" | "dutch" } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><Harness onContinue={options.onContinue ?? (() => undefined)} initialCursor={options.initialCursor} cueMode={options.cueMode} /></QueryClientProvider></MantineProvider>);
}

const mic = () => screen.getByRole("button", { name: "Hold to speak" });
const draftBox = () => screen.getByRole("textbox", { name: "Your reply" }) as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "Send" });

// Start, then let Dirk's line play to its end, so Sofia's turn is ready.
async function startAndPlayPartner() {
  fireEvent.click(screen.getByRole("button", { name: "Start dialogue" }));
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

describe("Role-play dialogue", () => {
  it("requests no partner audio before Start", async () => {
    const calls = serve();
    renderDialogue();
    expect(await screen.findByRole("button", { name: "Start dialogue" })).toBeInTheDocument();
    expect(speechTurnIds(calls)).toEqual([]);
    expect(players).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Start dialogue" }));
    await waitFor(() => expect(speechTurnIds(calls)).toEqual([uid(1)]));
  });

  it("writes the held transcript to the draft only, with no request", async () => {
    const calls = serve();
    renderDialogue();
    await startAndPlayPartner();
    fireEvent.pointerDown(mic());
    expect(FakeRecognition.instances).toHaveLength(1);
    fireEvent.pointerUp(mic());
    expect(draftBox().value).toBe("Goedemorgen, Dirk");
    expect(answers(calls)).toHaveLength(0);
    expect(sendButton()).toBeEnabled();
  });

  it("sends the draft once when Send is clicked twice, as a spoken answer", async () => {
    const calls = serve();
    renderDialogue();
    await startAndPlayPartner();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic());
    fireEvent.click(sendButton()); fireEvent.click(sendButton());
    await screen.findByText("Correct");
    expect(answers(calls)).toHaveLength(1);
    expect(answers(calls)[0]!.body).toMatchObject({ runId, itemId: uid(2), answer: { kind: "text", text: "Goedemorgen, Dirk" }, inputMode: "spoken" });
  });

  it("sends an edited spoken draft as typed", async () => {
    const calls = serve();
    renderDialogue();
    await startAndPlayPartner();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic());
    fireEvent.change(draftBox(), { target: { value: "Goedemorgen, Dirk!" } });
    fireEvent.click(sendButton());
    await screen.findByText("Correct");
    expect(answers(calls)[0]!.body).toMatchObject({ inputMode: "typed" });
  });

  it("advances only after an explicit Continue, and requests the next partner line only then", async () => {
    const calls = serve();
    const onContinue = vi.fn();
    renderDialogue({ onContinue });
    await startAndPlayPartner();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic());
    fireEvent.click(sendButton());
    await screen.findByText("Correct");
    expect(speechTurnIds(calls)).toEqual([uid(1)]);
    expect(screen.queryByText("Say you are fine, thanks.")).not.toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(speechTurnIds(calls)).toEqual([uid(1), uid(3)]));
    endClip();
    expect(await screen.findByText("Say you are fine, thanks.")).toBeInTheDocument();
  });

  it("falls back to typing when the recognizer throws, and sends what was typed", async () => {
    const calls = serve({ correct: false, reference: "Goedemorgen, Dirk." });
    FakeRecognition.throwOnStart = true;
    renderDialogue();
    await startAndPlayPartner();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic());
    expect(await screen.findByText("Speech recognition is not available right now. Type your reply instead.")).toBeInTheDocument();
    fireEvent.change(draftBox(), { target: { value: "Goedemorgen, Dirk." } });
    fireEvent.click(sendButton());
    await screen.findByText("Different from Sofia's line");
    expect(answers(calls)[0]!.body).toMatchObject({ inputMode: "typed", answer: { kind: "text", text: "Goedemorgen, Dirk." } });
  });

  it("ignores key repeat while Space is held and ends the capture on release", async () => {
    serve();
    renderDialogue();
    await startAndPlayPartner();
    fireEvent.keyDown(mic(), { key: " " });
    fireEvent.keyDown(mic(), { key: " ", repeat: true });
    fireEvent.keyDown(mic(), { key: " ", repeat: true });
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.instances[0]!.started).toBe(1);
    fireEvent.keyUp(mic(), { key: " " });
    expect(FakeRecognition.instances[0]!.stopped).toBe(1);
    expect(draftBox().value).toBe("Goedemorgen, Dirk");
  });

  it("stops an in-progress capture when the dialogue unmounts", async () => {
    serve();
    const view = renderDialogue();
    await startAndPlayPartner();
    fireEvent.pointerDown(mic());
    expect(FakeRecognition.instances[0]!.started).toBe(1);
    view.unmount();
    expect(FakeRecognition.instances[0]!.aborted).toBe(1);
  });

  it("does not start a capture while partner audio is playing", async () => {
    serve();
    renderDialogue();
    fireEvent.click(screen.getByRole("button", { name: "Start dialogue" }));
    await waitFor(() => expect(players.length).toBeGreaterThan(0));
    expect(mic()).toBeDisabled();
    fireEvent.pointerDown(mic());
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("says Different from Sofia's line with the reference, never calls the Dutch wrong", async () => {
    serve({ correct: false, reference: "Goedemorgen, Dirk." });
    renderDialogue();
    await startAndPlayPartner();
    fireEvent.change(draftBox(), { target: { value: "Dag Dirk" } });
    fireEvent.click(sendButton());
    expect(await screen.findByText("Different from Sofia's line")).toBeInTheDocument();
    expect(screen.getByText("Sofia's line: Goedemorgen, Dirk.")).toBeInTheDocument();
    expect(screen.queryByText(/wrong/i)).not.toBeInTheDocument();
  });

  it("offers Finish and Back to lesson on the last turn, and Listen to Sofia plays her line", async () => {
    const calls = serve();
    const onContinue = vi.fn();
    renderDialogue({ onContinue, initialCursor: 1 });
    await startAndPlayPartner();
    fireEvent.change(draftBox(), { target: { value: "Goed, dank je." } });
    fireEvent.click(sendButton());
    await screen.findByText("Correct");
    expect(screen.getByRole("link", { name: "Back to lesson" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Listen to Sofia" }));
    await waitFor(() => expect(speechTurnIds(calls)).toContain(uid(4)));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
