import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { stopSpeech } from "../../molecules/Speech";
import { SpeakFromEnglishActivity } from "./SpeakFromEnglishActivity";

const endpoint = "/api/courses/c/lessons/l/activities/a1";
const runId = "70000000-0000-4000-8000-000000000001";
const uid = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lines = [
  { id: uid(1), index: 0, speaker: "Dirk", englishText: "Good morning, Dirk.", dutchText: null },
  { id: uid(2), index: 1, speaker: "Dirk", englishText: "How are you?", dutchText: null },
];

type Call = { path: string; body: Record<string, unknown> | null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function serve() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    calls.push({ path, body });
    if (path.endsWith("/speech")) return json({ status: "ready", url: `https://media.test/${String(body?.lineId)}.mp3` });
    if (path.endsWith("/answers")) return json({ answerId: uid(900), itemId: body?.itemId, correct: false, reference: "Goedemorgen, Dirk.", explanation: null, pronunciation: null });
    return json({ error: { code: "NOT_STUBBED", message: path } }, 500);
  }));
  return calls;
}
const answers = (calls: Call[]) => calls.filter((call) => call.path.endsWith("/answers"));

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  started = 0; stopped = 0; aborted = 0;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started += 1; this.onaudiostart?.(); }
  stop() {
    this.stopped += 1;
    this.onresult?.({ results: [Object.assign([{ transcript: "Goedemorgen Dirk" }], { isFinal: true })] });
    this.onend?.();
  }
  abort() { this.aborted += 1; this.onend?.(); }
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}>
    <SpeakFromEnglishActivity groupId="20000000-0000-4000-8000-000000000001" language="nl" endpoint={endpoint} runId={runId} lines={lines} cursor={0}
      advancing={false} onContinue={() => undefined} backToLesson={<a href="/back">Back to lesson</a>} />
  </QueryClientProvider></MantineProvider>);
}
const mic = () => screen.getByRole("button", { name: "Hold to speak" });
const draftBox = () => screen.getByRole("textbox", { name: "Your reply" }) as HTMLTextAreaElement;

beforeEach(() => {
  FakeRecognition.instances = [];
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  localStorage.clear();
});
afterEach(() => { act(() => stopSpeech()); cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("SpeakFromEnglishActivity", () => {
  it("submits the held transcript only when Send is pressed", async () => {
    const calls = serve();
    mount();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic());
    expect(draftBox().value).toBe("Goedemorgen Dirk");
    expect(answers(calls)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Different from the original line");
    expect(answers(calls)).toHaveLength(1);
    expect(answers(calls)[0]!.body).toMatchObject({ runId, itemId: uid(1), answer: { kind: "text", text: "Goedemorgen Dirk" }, inputMode: "spoken" });
    expect(screen.getByText("Goedemorgen, Dirk.", { selector: "strong" })).toBeInTheDocument();
  });

  it("never submits when the hold is released without Send", async () => {
    const calls = serve();
    mount();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic()); fireEvent.blur(mic());
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(answers(calls)).toHaveLength(0);
    expect(screen.queryByText("Different from the original line")).not.toBeInTheDocument();
  });

  it("submits a typed sentence", async () => {
    const calls = serve();
    mount();
    fireEvent.change(draftBox(), { target: { value: "Goedemorgen, Dirk." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Different from the original line");
    expect(answers(calls)[0]!.body).toMatchObject({ inputMode: "typed", answer: { kind: "text", text: "Goedemorgen, Dirk." } });
  });

  it("does not restore typed or transcribed text after a remount", async () => {
    serve();
    const first = mount();
    fireEvent.pointerDown(mic()); fireEvent.pointerUp(mic());
    fireEvent.change(draftBox(), { target: { value: "Typed sentence" } });
    expect(Object.keys(localStorage)).toHaveLength(0);
    first.unmount();
    mount();
    await waitFor(() => expect(draftBox().value).toBe(""));
  });

  it("stops an in-progress capture on unmount", () => {
    serve();
    const view = mount();
    fireEvent.pointerDown(mic());
    expect(FakeRecognition.instances[0]!.started).toBe(1);
    view.unmount();
    expect(FakeRecognition.instances[0]!.aborted).toBe(1);
  });
});
