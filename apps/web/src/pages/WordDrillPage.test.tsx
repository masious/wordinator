import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { WordDrillCard } from "@wordinator/contracts/lesson-document";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { resetRevealSound, setRevealSound, stopSpeech } from "../molecules/Speech";
import { validateWordDrillSearch, WordDrillPage } from "./WordDrillPage";

const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const groupId = id(1); const courseId = id(3); const lessonId = id(40);
const session = { status: "signedIn", user: { id: id(2), displayName: "Ada", avatarUrl: null, mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "nl", role: "member", icon: "🇳🇱", iconUrl: null }], requests: [], deletedGroups: [] };
const clip = (name: string) => `https://media.example/speech/${name}.mp3`;
const card = (n: number, direction: WordDrillCard["direction"] = "understand", word: Partial<WordDrillCard["word"]> = {}): WordDrillCard => ({
  word: { id: id(100 + n), lessonId, term: `woord ${n}`, meaning: `meaning ${n}`, forms: null, example: null, note: null, speech: { term: clip(`woord${n}`), example: null }, ...word },
  direction, course: { id: courseId, slug: "dutch", title: "Dutch foundations" }, lesson: { id: lessonId, slug: "at-the-station", title: "At the station" },
});
const deckPath = `/api/groups/${groupId}/word-drill?source=weak&direction=mixed`;
const gradePath = (n: number, direction = "understand") => `/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId}/words/${id(100 + n)}/drill/${direction}`;
let decks: WordDrillCard[][];
let gradeStatus: number;

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
const fetchCalls = () => vi.mocked(fetch).mock.calls.map(([path, init]) => ({ path: String(path), method: init?.method ?? "GET", body: init?.body ? String(init.body) : null }));
const grades = () => fetchCalls().filter((call) => call.method === "PUT");

function renderPage(initial = "/words/drill?source=weak&direction=mixed") {
  const root = createRootRoute();
  const words = createRoute({ getParentRoute: () => root, path: "words", component: () => <p>Words tab</p> });
  const drill = createRoute({
    getParentRoute: () => root, path: "words/drill", validateSearch: validateWordDrillSearch,
    component: function Drill() {
      const settings = drill.useSearch(); const navigate = drill.useNavigate();
      return <WordDrillPage groupId={groupId} settings={settings} onBack={() => { void navigate({ to: "/words" }); }} />;
    },
  });
  const router = createRouter({ routeTree: root.addChildren([words, drill]), history: createMemoryHistory({ initialEntries: [initial] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
  return router;
}

const current = () => screen.getByRole("article", { name: "Drill card" });
const press = (key: string) => fireEvent.keyDown(document.body, { key });
const reveal = () => fireEvent.click(within(current()).getByRole("button", { name: "Show answer" }));
const gradeAs = (name: "Again" | "Got it") => fireEvent.click(within(current()).getByRole("button", { name }));
const shownTerm = () => within(current()).getAllByText(/^woord \d$/)[0]!.textContent;

beforeEach(() => {
  decks = [[card(1), card(2)]];
  gradeStatus = 200;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return response(session);
    if (path.includes("/word-drill?")) return response({ cards: decks.length > 1 ? decks.shift()! : decks[0]! });
    if (init?.method === "PUT" && path.includes("/drill/")) {
      if (gradeStatus === 200) return response({ recent: ["got"] });
      return response({ error: { code: gradeStatus === 404 ? "WORD_NOT_FOUND" : "INTERNAL", message: "No." } }, gradeStatus);
    }
    return response({ ok: true });
  }));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("playing")); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => { act(() => stopSpeech()); cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); resetRevealSound(); });

describe("Drill card", () => {
  it("asks for the meaning on an Understand front and reveals the full word with its sound", async () => {
    decks = [[card(1, "understand", { forms: "woorden", example: "Een woord 1 hier.", note: "A note." })]];
    renderPage();
    const front = await screen.findByRole("article", { name: "Drill card" });
    expect(front).toHaveTextContent("What does it mean?");
    expect(front).toHaveTextContent("woord 1");
    expect(front).toHaveTextContent("woorden");
    expect(within(front).getByRole("button", { name: "Play pronunciation of woord 1" })).toBeInTheDocument();
    expect(front).not.toHaveTextContent("meaning 1");
    expect(screen.getByText("0 of 1 done")).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    reveal();
    expect(current()).toHaveTextContent("meaning 1");
    expect(current()).toHaveTextContent("Een woord 1 hier.");
    expect(current()).toHaveTextContent("A note.");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(within(current()).getByRole("button", { name: "Again" })).toBeInTheDocument();
    expect(within(current()).getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("leaves an example off a Produce front when the term cannot be found in it", async () => {
    decks = [[card(1, "produce", { term: "bellen", forms: "belt · belde · gebeld", meaning: "to call", example: "Ik bel mijn moeder." })]];
    renderPage();
    const front = await screen.findByRole("article", { name: "Drill card" });
    expect(front).toHaveTextContent("to call");
    expect(front).not.toHaveTextContent("Ik bel mijn moeder.");
    expect(within(front).queryByRole("img", { name: "blank" })).not.toBeInTheDocument();
    reveal();
    expect(current()).toHaveTextContent("Ik bel mijn moeder.");
  });

  it("asks for the term on a Produce front, with the lesson as context and the term blanked in the example", async () => {
    decks = [[card(1, "produce", { term: "het kaartje", forms: "kaartjes", meaning: "the ticket", example: "Ik koop een Kaartje.", speech: { term: clip("kaartje"), example: clip("example") } })]];
    renderPage();
    const front = await screen.findByRole("article", { name: "Drill card" });
    expect(front).toHaveTextContent("How do you say it in Dutch?");
    expect(front).toHaveTextContent("the ticket");
    expect(front).toHaveTextContent("Dutch foundations · At the station");
    expect(front).toHaveTextContent("Ik koop een .");
    expect(within(front).getByRole("img", { name: "blank" })).toBeInTheDocument();
    expect(front).not.toHaveTextContent("kaartje");
    expect(within(front).queryByRole("button", { name: /Play/ })).not.toBeInTheDocument();
    reveal();
    // The answer shows the whole word, and revealing speaks the term in this direction too.
    expect(current()).toHaveTextContent("het kaartje");
    expect(current()).toHaveTextContent("kaartjes");
    expect(current()).toHaveTextContent("Ik koop een Kaartje.");
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
  });

  it("stays silent on reveal with the reveal sound off", async () => {
    setRevealSound(false);
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    expect(screen.getByRole("button", { name: "Speak words when revealed" })).toHaveAttribute("aria-pressed", "false");
    reveal();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});

// A stand-in for the browser's SpeechRecognition: the test says what it heard, or which error it raised.
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = ""; interimResults = true; continuous = true; maxAlternatives = 1;
  onresult: ((event: { results: string[][] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null; onspeechstart: (() => void) | null = null; onspeechend: (() => void) | null = null;
  started = false;
  constructor() { FakeRecognition.last = this; }
  start() { this.started = true; }
  // A real stop() asks for a final result from the audio so far; the test then says what was heard.
  stopRequested = false;
  stop() { this.stopRequested = true; }
  abort() { this.onerror?.({ error: "aborted" }); this.onend?.(); }
  hear(...alternatives: string[]) { act(() => { this.onresult?.({ results: [alternatives.map((transcript) => ({ transcript }))] as never }); this.onend?.(); }); }
  fail(error: string) { act(() => { this.onerror?.({ error }); this.onend?.(); }); }
  ready() { act(() => this.onaudiostart?.()); }
  partial(transcript: string) { act(() => { this.onspeechstart?.(); this.onresult?.({ results: [Object.assign([{ transcript }], { isFinal: false })] as never }); }); }
  done() { act(() => this.onspeechend?.()); }
}
const produceCard = () => card(1, "produce", { term: "het kaartje", meaning: "the ticket" });
const sayIt = () => fireEvent.click(within(current()).getByRole("button", { name: /Say it/ }));

describe("Spoken answers", () => {
  beforeEach(() => { FakeRecognition.last = null; vi.stubGlobal("webkitSpeechRecognition", FakeRecognition); });

  it("listens in the library's locale and reveals a matching answer with what was heard", async () => {
    decks = [[produceCard()]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    sayIt();
    const recognition = FakeRecognition.last!;
    expect(recognition.started).toBe(true);
    expect(recognition.lang).toBe("nl-NL");
    expect(recognition.interimResults).toBe(true);
    // Each phase names itself on the button and explains itself below it.
    const button = () => within(current()).getByRole("button", { pressed: true });
    expect(button()).toHaveTextContent("Getting ready…");
    expect(button()).toHaveAccessibleDescription("Starting the microphone…");
    recognition.ready();
    expect(button()).toHaveTextContent("Listening…");
    expect(button()).toHaveAccessibleDescription("Speak now · click to stop");
    recognition.partial("Kaar");
    expect(button()).toHaveTextContent("Hearing you…");
    expect(button()).toHaveAccessibleDescription("“Kaar…”");
    recognition.done();
    expect(button()).toHaveTextContent("Checking…");
    expect(button()).toHaveAccessibleDescription("Working out what you said…");
    recognition.hear("Kaartje", "kaart je");
    expect(current()).toHaveTextContent("Matches!You said “Kaartje”");
    expect(current()).toHaveTextContent("the ticket");
    expect(grades()).toEqual([]);
    gradeAs("Got it");
    await waitFor(() => expect(grades()).toHaveLength(1));
  });

  it("follows the microphone's level and nudges when it hears nothing for a while", async () => {
    let level = 0; let now = 1_000_000;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } });
    vi.stubGlobal("AudioContext", class {
      createAnalyser() { return { fftSize: 0, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(level) }; }
      createMediaStreamSource() { return { connect: () => undefined }; }
      close() { return Promise.resolve(); }
    });
    const frame = () => act(() => { frames.shift()?.(0); });
    decks = [[produceCard()]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    sayIt();
    await act(async () => undefined);
    const recognition = FakeRecognition.last!;
    recognition.ready();
    const button = () => within(current()).getByRole("button", { pressed: true });
    frame();
    expect(button()).toHaveAccessibleDescription("Speak now · click to stop");
    now += 3100; frame();
    expect(button()).toHaveAccessibleDescription("Can't hear anything yet. Is the right microphone on?");
    level = 0.1; frame();
    expect(button()).toHaveAccessibleDescription("Speak now · click to stop");
    expect(Number(button().parentElement!.style.getPropertyValue("--level"))).toBeGreaterThan(0.4);
    recognition.hear("kaartje");
    expect(within(current()).getByRole("button", { name: "Again" })).toBeInTheDocument();
    expect(within(current()).queryByRole("button", { name: /Say it|Listening|Hearing|Checking/ })).not.toBeInTheDocument();
  });

  it("finishes the answer when pressed again while hearing, keeping what was said", async () => {
    decks = [[produceCard()]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    sayIt();
    const recognition = FakeRecognition.last!;
    recognition.ready(); recognition.partial("kaar");
    fireEvent.click(within(current()).getByRole("button", { pressed: true }));
    expect(recognition.stopRequested).toBe(true);
    expect(within(current()).getByRole("button", { pressed: true })).toHaveTextContent("Checking…");
    recognition.hear("kaartje");
    expect(current()).toHaveTextContent("Matches!You said “kaartje”");
  });

  it("ends the answer itself after a short silence, or at the latest after the time limit, whatever the background noise", async () => {
    let level = 0; let now = 1_000_000;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } });
    vi.stubGlobal("AudioContext", class {
      createAnalyser() { return { fftSize: 0, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(level) }; }
      createMediaStreamSource() { return { connect: () => undefined }; }
      close() { return Promise.resolve(); }
    });
    const frame = () => act(() => { frames.shift()?.(0); });
    decks = [[produceCard(), card(2, "produce", { term: "de trein", meaning: "the train" })]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    // A quiet room: speech, then silence for END_SILENCE_MS.
    sayIt();
    await act(async () => undefined);
    let recognition = FakeRecognition.last!;
    recognition.ready();
    level = 0.001; frame();
    level = 0.1; frame();
    now += 500; frame();
    level = 0.001; frame();
    expect(recognition.stopRequested).toBe(false);
    now += 950; frame();
    expect(recognition.stopRequested).toBe(true);
    recognition.hear("kaartje");
    gradeAs("Got it");
    // Steady noise from a speaker never falls silent, so the time limit ends it.
    frames.splice(0);
    sayIt();
    await act(async () => undefined);
    recognition = FakeRecognition.last!;
    recognition.ready();
    level = 0.002; frame();
    level = 0.1; frame();
    for (let step = 0; step < 11; step++) { now += 500; frame(); }
    expect(recognition.stopRequested).toBe(false);
    now += 600; frame();
    expect(recognition.stopRequested).toBe(true);
  });

  it("reveals a miss as not matching and still lets the learner grade it", async () => {
    decks = [[produceCard()]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    press("m");
    FakeRecognition.last!.hear("kaart");
    expect(current()).toHaveTextContent("Not quiteYou said “kaart”");
    expect(within(current()).getByRole("button", { name: "Again" })).toBeInTheDocument();
  });

  it("keeps the front when nothing was heard or the microphone is blocked", async () => {
    decks = [[produceCard()]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    sayIt();
    FakeRecognition.last!.fail("no-speech");
    expect(screen.getByRole("status")).toHaveTextContent("Didn't catch that");
    expect(within(current()).getByRole("button", { name: "Show answer" })).toBeInTheDocument();
    sayIt();
    FakeRecognition.last!.fail("not-allowed");
    expect(screen.getByRole("status")).toHaveTextContent("The microphone is blocked");
  });

  it("offers no microphone on Understand cards or without browser support", async () => {
    decks = [[card(1, "understand")]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    expect(within(current()).queryByRole("button", { name: /Say it/ })).not.toBeInTheDocument();
    cleanup();
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    decks = [[produceCard()]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    expect(within(current()).queryByRole("button", { name: /Say it/ })).not.toBeInTheDocument();
    press("m");
    expect(FakeRecognition.last).toBeNull();
  });
});

describe("Drill session", () => {
  it("requeues a card three to five cards later after Again and sends only its first grade", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    decks = [[1, 2, 3, 4, 5].map((n) => card(n))];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    expect(shownTerm()).toBe("woord 1");
    reveal(); gradeAs("Again");
    const seen: Array<string | null> = [];
    for (let step = 0; step < 3; step += 1) { seen.push(shownTerm()); reveal(); gradeAs("Got it"); }
    expect(seen).toEqual(["woord 2", "woord 3", "woord 4"]);
    // Three cards later the word comes back; Got it now only retires it.
    expect(shownTerm()).toBe("woord 1");
    expect(screen.getByText("3 of 5 done")).toBeInTheDocument();
    reveal(); gradeAs("Got it");
    expect(screen.getByText("4 of 5 done")).toBeInTheDocument();
    await waitFor(() => expect(grades()).toHaveLength(4));
    expect(grades().filter((call) => call.path === gradePath(1))).toEqual([{ path: gradePath(1), method: "PUT", body: JSON.stringify({ result: "again" }) }]);
    expect(grades().find((call) => call.path === gradePath(2))?.body).toBe(JSON.stringify({ result: "got" }));
  });

  it("puts a card at the end when fewer cards remain", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    reveal(); gradeAs("Again");
    expect(shownTerm()).toBe("woord 2");
    reveal(); gradeAs("Got it");
    expect(shownTerm()).toBe("woord 1");
    // The card is shown front up again.
    expect(within(current()).getByRole("button", { name: "Show answer" })).toBeInTheDocument();
  });

  it("reveals with Space and grades with 1 and 2", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    // Grades wait for the answer.
    press("2");
    expect(grades()).toHaveLength(0);
    press(" ");
    expect(current()).toHaveTextContent("meaning 1");
    press("1");
    expect(shownTerm()).toBe("woord 2");
    press(" "); press("2");
    expect(shownTerm()).toBe("woord 1");
    press(" "); press("2");
    expect(await screen.findByRole("heading", { name: "Session done" })).toBeInTheDocument();
    await waitFor(() => expect(grades().map((call) => call.body)).toEqual([JSON.stringify({ result: "again" }), JSON.stringify({ result: "got" })]));
  });

  it("summarises the first tries and starts a fresh deck with Drill again", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    decks = [[card(1), card(2)], [card(3)]];
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    reveal(); gradeAs("Again");
    reveal(); gradeAs("Got it");
    reveal(); gradeAs("Got it");
    const summary = await screen.findByRole("heading", { name: "Session done" });
    const counts = summary.parentElement!;
    expect(within(counts).getByText("Got it on the first try").nextSibling).toHaveTextContent("1");
    expect(within(counts).getByText("Needed Again").nextSibling).toHaveTextContent("1");
    expect(counts).not.toHaveTextContent("%");
    fireEvent.click(screen.getByRole("button", { name: "Drill again" }));
    expect(await screen.findByText("0 of 1 done")).toBeInTheDocument();
    expect(shownTerm()).toBe("woord 3");
    expect(fetchCalls().filter((call) => call.path === deckPath)).toHaveLength(2);
  });

  it("goes back to the Words tab", async () => {
    const router = renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    fireEvent.click(screen.getByRole("button", { name: "Back to words" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/words"));
  });

  it("says quietly when a grade cannot be saved and retries it", async () => {
    gradeStatus = 500;
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    reveal(); gradeAs("Got it");
    expect(await screen.findByText("1 answer could not be saved.")).toBeInTheDocument();
    // The session carries on.
    expect(shownTerm()).toBe("woord 2");
    gradeStatus = 200;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("1 answer could not be saved.")).not.toBeInTheDocument());
    expect(grades().filter((call) => call.path === gradePath(1))).toHaveLength(2);
  });

  it("finishes a word that is gone from the session's copy and ignores its grade", async () => {
    gradeStatus = 404;
    renderPage();
    await screen.findByRole("article", { name: "Drill card" });
    reveal(); gradeAs("Got it");
    await waitFor(() => expect(grades()).toHaveLength(1));
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    expect(screen.queryByText(/could not be saved/)).not.toBeInTheDocument();
  });

  it("explains an empty deck", async () => {
    decks = [[]];
    renderPage();
    expect(await screen.findByText("Nothing to drill")).toBeInTheDocument();
    expect(screen.getByText("Bookmark words in a lesson, then drill them here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to words" })).toBeInTheDocument();
  });

  it("fetches the deck once for the session", async () => {
    renderPage(`/words/drill?source=lesson&lesson=${lessonId}&direction=produce`);
    await screen.findByRole("article", { name: "Drill card" });
    act(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
    reveal(); gradeAs("Got it");
    await waitFor(() => expect(grades()).toHaveLength(1));
    expect(fetchCalls().filter((call) => call.path.includes("/word-drill?")).map((call) => call.path))
      .toEqual([`/api/groups/${groupId}/word-drill?source=lesson&lessonId=${lessonId}&direction=produce`]);
  });
});

describe("Drill route search", () => {
  it("falls back to the defaults and drops a lesson that does not belong", () => {
    expect(validateWordDrillSearch({})).toEqual({ source: "weak", direction: "mixed" });
    expect(validateWordDrillSearch({ source: "lesson", direction: "sideways" })).toEqual({ source: "weak", direction: "mixed" });
    expect(validateWordDrillSearch({ source: "weak", lesson: lessonId, direction: "understand" })).toEqual({ source: "weak", direction: "understand" });
    expect(validateWordDrillSearch({ source: "lesson", lesson: lessonId, direction: "produce" })).toEqual({ source: "lesson", lesson: lessonId, direction: "produce" });
  });

  it("keeps a course drill only with a valid course", () => {
    const courseId = crypto.randomUUID();
    expect(validateWordDrillSearch({ source: "course", course: courseId })).toEqual({ source: "course", course: courseId, direction: "mixed" });
    expect(validateWordDrillSearch({ source: "course" })).toEqual({ source: "weak", direction: "mixed" });
    expect(validateWordDrillSearch({ source: "course", lesson: lessonId })).toEqual({ source: "weak", direction: "mixed" });
    expect(validateWordDrillSearch({ source: "lesson", lesson: lessonId, course: courseId })).toEqual({ source: "lesson", lesson: lessonId, direction: "mixed" });
  });
});
