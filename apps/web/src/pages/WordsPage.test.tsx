import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { resetRevealSound, setRevealSound, stopSpeech } from "../molecules/Speech";
import { setRecognizer } from "../molecules/speechRecognition";
import { validateWordDrillSearch } from "./WordDrillPage";
import { validateWordsSearch, WordsPage } from "./WordsPage";

// A stand-in for Microsoft's Speech SDK: the test decides what its next recognition returns.
const azure = vi.hoisted(() => ({ configs: [] as Array<{ token: string; region: string; speechRecognitionLanguage?: string }>, assessments: [] as unknown[], next: null as unknown,
  respond: null as ((result: unknown) => void) | null, written: 0, pushClosed: false }));
vi.mock("microsoft-cognitiveservices-speech-sdk", () => ({
  SpeechConfig: { fromAuthorizationToken: (token: string, region: string) => { const config = { token, region }; azure.configs.push(config); return config; } },
  AudioConfig: { fromDefaultMicrophoneInput: () => ({}), fromStreamInput: (input: unknown) => ({ input }) },
  AudioInputStream: { createPushStream: () => ({ write: (pcm: ArrayBuffer) => { azure.written += pcm.byteLength; }, close: () => { azure.pushClosed = true; } }) },
  AudioStreamFormat: { getWaveFormatPCM: () => ({}) },
  OutputFormat: { Detailed: 1 },
  ResultReason: { NoMatch: 0, Canceled: 1, RecognizedSpeech: 3 },
  CancellationErrorCode: { NoError: 0, AuthenticationFailure: 1, Forbidden: 8 },
  CancellationDetails: { fromResult: () => ({ ErrorCode: 4 }) },
  PropertyId: { SpeechServiceResponse_JsonResult: "json" },
  PronunciationAssessmentConfig: { fromJSON: (json: string) => ({ applyTo: () => { azure.assessments.push(JSON.parse(json)); } }) },
  // With `azure.next` set to "wait", recognition waits until the test calls `azure.respond`.
  SpeechRecognizer: class {
    sessionStarted?: () => void;
    recognizeOnceAsync(done: (result: unknown) => void) { this.sessionStarted?.(); if (azure.next === "wait") azure.respond = done; else done(azure.next); }
    close() {}
  },
}));

// jsdom has no layout, so the cards' page size is set here.
const fit = vi.hoisted(() => ({ value: { columns: 2, rows: 1 } }));
vi.mock("../organisms/WordRecap/fitGrid", async (importOriginal) => ({ ...await importOriginal<typeof import("../organisms/WordRecap/fitGrid")>(), measureFit: () => fit.value }));

const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const groupId = id(1); const userId = id(2); const courseId = id(3);
const session = { status: "signedIn", user: { id: userId, displayName: "Ada", avatarUrl: null, mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "nl", role: "member", icon: "🇳🇱", iconUrl: null }], requests: [], deletedGroups: [] };
const item = (n: number, lesson = id(40)) => ({
  word: { id: id(100 + n), lessonId: lesson, term: `woord ${n}`, meaning: `meaning ${n}`, forms: null, example: null, note: null, speech: { term: null, example: null } },
  course: { id: courseId, title: "Dutch foundations" }, lesson: { id: lesson, title: `Lesson ${lesson.slice(-2)}` }, bookmarkedAt: 1000 - n,
});
const listPath = `/api/groups/${groupId}/word-bookmarks?limit=100`;
const keysPath = `/api/groups/${groupId}/word-bookmarks/keys`;
const lessonsPath = `/api/groups/${groupId}/word-bookmarks/lessons`;
const lessonEntry = (lesson: string, count: number) => ({
  course: { id: courseId, slug: "dutch-foundations", title: "Dutch foundations" }, lesson: { id: lesson, slug: `lesson-${lesson.slice(-2)}`, title: `Lesson ${lesson.slice(-2)}` }, count,
});
let lessons: ReturnType<typeof lessonEntry>[];
let pages: Record<string, { items: unknown[]; nextCursor: string | null }>;
let keys: Array<{ lessonId: string; wordId: string }>;
const weakPath = `/api/groups/${groupId}/weak-words`;
const weakItem = (n: number, recent: string[] = ["got", "again"]) => ({
  word: { id: id(200 + n), lessonId: id(40), term: `zwak ${n}`, meaning: `weak meaning ${n}`, forms: null, example: null, note: null, speech: { term: null, example: null } },
  termKey: `zwak ${n}`, recent, course: { id: courseId, slug: "dutch-foundations", title: "Dutch foundations" }, lesson: { id: id(40), slug: "lesson-40", title: "Lesson 40" },
});
let weakPages: Record<string, { items: unknown[]; nextCursor: string | null; hasMemory: boolean }>;
let knownStatus: number;

function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }
// The page under a route that keeps the lesson filter in the URL, like the app's own `/words` route.
function renderPage(initial = "/words") {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root, path: "words", validateSearch: validateWordsSearch,
    component: function Words() {
      const { lesson, view } = route.useSearch(); const navigate = route.useNavigate();
      return <WordsPage groupId={groupId} view={view ?? "bookmarks"} lessonId={lesson ?? null} onView={(next) => { void navigate({ search: next === "weak" ? { view: "weak" } : {} }); }}
        onLesson={(next, replace = false) => { void navigate({ search: next ? { lesson: next } : {}, replace }); }}
        onDrill={(settings) => { void navigate({ to: "/words/drill", search: settings }); }} />;
    },
  });
  // Start lands on the drill route; its page has its own tests.
  const drill = createRoute({ getParentRoute: () => root, path: "words/drill", validateSearch: validateWordDrillSearch, component: () => <p>Drill page</p> });
  const router = createRouter({ routeTree: root.addChildren([route, drill]), history: createMemoryHistory({ initialEntries: [initial] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
  return router;
}

beforeEach(() => {
  weakPages = { [weakPath]: { items: [weakItem(1, ["again", "again", "got"]), weakItem(2, ["got", "got", "got", "got", "again"])], nextCursor: "next", hasMemory: true } };
  weakPages[`${weakPath}?cursor=next`] = { items: [weakItem(3, [])], nextCursor: null, hasMemory: true };
  knownStatus = 200;
  pages = { [listPath]: { items: [item(1), item(2), item(3, id(41))], nextCursor: null } };
  pages[`${listPath}&lessonId=${id(41)}`] = { items: [item(3, id(41))], nextCursor: null };
  lessons = [lessonEntry(id(40), 2), lessonEntry(id(41), 1)];
  keys = [item(1), item(2), item(3, id(41))].map((entry) => ({ lessonId: entry.lesson.id, wordId: entry.word.id }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return response(session);
    if (path === keysPath) return response({ keys });
    if (path === lessonsPath) return response({ lessons });
    if (path in pages) return response(pages[path]);
    if (path in weakPages) return response(weakPages[path]);
    if (path.endsWith("/known") && init?.method === "PUT") {
      return knownStatus === 200 ? response({ ok: true }) : new Response(JSON.stringify({ error: { code: "WORD_NOT_FOUND", message: "Gone." } }), { status: knownStatus, headers: { "content-type": "application/json" } });
    }
    if (path.endsWith("/bookmark") && init?.method === "DELETE") {
      // The server forgets the bookmark, so a refetched list leaves it out.
      const wordId = path.split("/words/")[1]!.split("/")[0];
      keys = keys.filter((key) => key.wordId !== wordId);
      pages[listPath] = { ...pages[listPath]!, items: pages[listPath]!.items.filter((entry) => (entry as ReturnType<typeof item>).word.id !== wordId) };
    }
    return response({ ok: true });
  }));
});
afterEach(() => { act(() => stopSpeech()); cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); fit.value = { columns: 2, rows: 1 }; localStorage.clear(); resetRevealSound(); });

// Mantine keeps a Select's options mounted; the open one is found through the listbox its combobox controls.
async function open(combobox: HTMLElement) {
  fireEvent.click(combobox);
  await waitFor(() => expect(combobox).toHaveAttribute("aria-expanded", "true"));
  return within(document.getElementById(combobox.getAttribute("aria-controls")!)!);
}
async function options(combobox: HTMLElement) {
  const names = (await open(combobox)).getAllByRole("option", { hidden: true }).map((option) => option.textContent);
  fireEvent.keyDown(combobox, { key: "Escape" });
  return names;
}
async function choose(combobox: HTMLElement, option: string) {
  fireEvent.click((await open(combobox)).getByRole("option", { name: option, hidden: true }));
}

describe("Words tab", () => {
  it("shows bookmarked words newest first with their course and lesson", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Your words" })).toBeInTheDocument();
    expect(await screen.findByText("Words 1–2 of 3")).toBeInTheDocument();
    const first = screen.getByRole("article", { name: "woord 1" });
    expect(first).toHaveTextContent("Dutch foundations · Lesson 40");
    // The Words tab's cards carry the shared reveal sound toggle.
    expect(screen.getByRole("button", { name: "Speak words when revealed" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual(["woord 1", "woord 2"]);
    // The last page has no done action.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("article", { name: "woord 3" })).toHaveTextContent("Lesson 41");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("keeps a card in place after its bookmark is removed, and lets it be bookmarked again", async () => {
    renderPage();
    const card = await screen.findByRole("article", { name: "woord 1" });
    const toggle = within(card).getByRole("button", { name: "Bookmark woord 1" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(toggle);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/words/${id(101)}/bookmark`), expect.objectContaining({ method: "DELETE" })));
    // The list refetches without the word, but its card stays where it was.
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path) === listPath).length).toBeGreaterThan(1));
    expect(screen.getAllByRole("article").map((entry) => entry.getAttribute("aria-label"))).toEqual(["woord 1", "woord 2"]);
    expect(within(screen.getByRole("article", { name: "woord 1" })).getByRole("button", { name: "Bookmark woord 1" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(screen.getByRole("article", { name: "woord 1" })).getByRole("button", { name: "Bookmark woord 1" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/words/${id(101)}/bookmark`), expect.objectContaining({ method: "PUT" })));
  });

  it("loads the next page before the reader reaches it, without a total until everything has loaded", async () => {
    fit.value = { columns: 1, rows: 1 };
    pages = {
      [listPath]: { items: [item(1), item(2)], nextCursor: "next" },
      [`${listPath}&cursor=next`]: { items: [item(3)], nextCursor: null },
    };
    renderPage();
    // Two words loaded and a page of one: the next page is a page away, so it loads at once.
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.map(([path]) => String(path))).toContain(`${listPath}&cursor=next`));
    await act(async () => {});
    expect(await screen.findByText("Word 1 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("article", { name: "woord 3" })).toBeInTheDocument();
  });

  it("explains how to bookmark when there is nothing yet, without a lesson filter", async () => {
    pages = { [listPath]: { items: [], nextCursor: null } }; lessons = [];
    renderPage();
    expect(await screen.findByText("No bookmarked words yet")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Lesson" })).not.toBeInTheDocument();
  });

  it("narrows the cards to one lesson through the filter and keeps it in the URL", async () => {
    const router = renderPage();
    await screen.findByRole("article", { name: "woord 1" });
    const filter = await screen.findByRole("combobox", { name: "Lesson" });
    expect(filter).toHaveValue("All lessons");
    // Lessons are grouped by course, each with its bookmark count.
    expect(await options(filter)).toEqual(["All lessons", "Lesson 40 (2)", "Lesson 41 (1)"]);
    await choose(filter, "Lesson 41 (1)");
    await waitFor(() => expect(router.state.location.search).toEqual({ lesson: id(41) }));
    expect(await screen.findByText("Word 1 of 1")).toBeInTheDocument();
    expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual(["woord 3"]);
    expect(fetch).toHaveBeenCalledWith(`${listPath}&lessonId=${id(41)}`, expect.anything());
    // Back to every lesson.
    await choose(screen.getByRole("combobox", { name: "Lesson" }), "All lessons");
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await screen.findByText("Words 1–2 of 3")).toBeInTheDocument();
  });

  it("keeps the chosen lesson and its card after its last bookmark is removed", async () => {
    const router = renderPage(`/words?lesson=${id(41)}`);
    const card = await screen.findByRole("article", { name: "woord 3" });
    const toggle = within(card).getByRole("button", { name: "Bookmark woord 3" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
    lessons = [lessonEntry(id(40), 2)]; pages[`${listPath}&lessonId=${id(41)}`] = { items: [], nextCursor: null };
    fireEvent.click(toggle);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path) === lessonsPath).length).toBeGreaterThan(1));
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
    expect(router.state.location.search).toEqual({ lesson: id(41) });
    expect(screen.getByRole("article", { name: "woord 3" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Lesson" })).toHaveValue("Lesson 41 (0)");
  });

  it("opens on the lesson named in the URL", async () => {
    renderPage(`/words?lesson=${id(41)}`);
    expect(await screen.findByRole("article", { name: "woord 3" })).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "Lesson" })).toHaveValue("Lesson 41 (1)");
  });

  it("falls back to every lesson when the URL names a lesson that is not available", async () => {
    const router = renderPage(`/words?lesson=${id(99)}`);
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await screen.findByText("Words 1–2 of 3")).toBeInTheDocument();
    // Anything that is not a lesson ID is dropped by the route.
    await router.navigate({ to: "/words", search: { lesson: "nonsense" } as never });
    expect(router.state.location.search).toEqual({});
  });
});

// A stand-in for the browser's SpeechRecognition: the test says what it heard, or which error it raised.
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = ""; interimResults = true; continuous = true; maxAlternatives = 1;
  onresult: ((event: { results: unknown }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { FakeRecognition.last = this; }
  start() {}
  stop() { this.onend?.(); }
  abort() { this.onerror?.({ error: "aborted" }); this.onend?.(); }
  hear(...alternatives: string[]) { act(() => { this.onresult?.({ results: [alternatives.map((transcript) => ({ transcript }))] }); this.onend?.(); }); }
  fail(error: string) { act(() => { this.onerror?.({ error }); this.onend?.(); }); }
  onaudiostart: (() => void) | null = null; onspeechstart: (() => void) | null = null;
  ready() { act(() => this.onaudiostart?.()); }
  partial(transcript: string) { act(() => { this.onspeechstart?.(); this.onresult?.({ results: [Object.assign([{ transcript }], { isFinal: false })] }); }); }
}

describe("Saying a word", () => {
  beforeEach(() => { FakeRecognition.last = null; vi.stubGlobal("webkitSpeechRecognition", FakeRecognition); });

  it("listens for the card's term and shows a passing verdict without flipping the card or saving anything", async () => {
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    expect(FakeRecognition.last!.lang).toBe("nl-NL");
    expect(within(first).getByRole("button", { name: "Stop listening" })).toHaveAttribute("aria-pressed", "true");
    const calls = vi.mocked(fetch).mock.calls.length;
    FakeRecognition.last!.hear("Woord 1");
    const verdict = within(first).getByRole("status");
    expect(verdict).toHaveTextContent("Matches!You said “Woord 1”");
    expect(within(first).getByRole("button", { name: "Show meaning" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    // Clicking dismisses it once its fade ends.
    fireEvent.click(verdict);
    fireEvent.animationEnd(verdict);
    expect(within(first).queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows what the microphone is doing over the card while it listens", async () => {
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    expect(first).toHaveTextContent("Starting the microphone…");
    FakeRecognition.last!.ready();
    expect(first).toHaveTextContent("Speak now · click to stop");
    FakeRecognition.last!.partial("woo");
    expect(first).toHaveTextContent("“woo…”");
    FakeRecognition.last!.hear("woord 1");
    expect(first).not.toHaveTextContent("“woo…”");
    expect(within(first).getByRole("status")).toHaveTextContent("Matches!");
  });

  it("shows a miss and a missed listen the same passing way", async () => {
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    FakeRecognition.last!.hear("woord 2");
    expect(within(first).getByRole("status")).toHaveTextContent("Not quiteYou said “woord 2”");
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    expect(within(first).queryByRole("status")).not.toBeInTheDocument();
    FakeRecognition.last!.fail("no-speech");
    expect(within(first).getByRole("status")).toHaveTextContent("Didn't catch that. Try again.");
  });

  it("speaks the term after a spoken answer, right or wrong, unless the reveal sound is off", async () => {
    pages[listPath] = { items: [{ ...item(1), word: { ...item(1).word, speech: { term: "https://media.example/woord1.mp3", example: null } } }], nextCursor: null };
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("playing")); return Promise.resolve(); });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    FakeRecognition.last!.hear("woord 1");
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    FakeRecognition.last!.hear("iets anders");
    expect(play).toHaveBeenCalledTimes(2);
    act(() => setRevealSound(false));
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    FakeRecognition.last!.hear("woord 1");
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("listens through Microsoft when chosen, with a token from the API", async () => {
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }));
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    setRecognizer("microsoft");
    const fetcher = vi.mocked(fetch);
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith("/speech-recognition/token")
      ? response({ token: "azure-token", region: "germanywestcentral", expiresAt: Date.now() + 60_000 }) : original(input, init));
    azure.configs = [];
    azure.next = { reason: 3, text: "Woord 1.", properties: { getProperty: () => JSON.stringify({ NBest: [{ Display: "Woord 1.", Lexical: "woord een" }] }) } };
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    expect(await within(first).findByRole("status")).toHaveTextContent("Matches!You said “Woord 1.”");
    expect(FakeRecognition.last).toBeNull();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    expect(azure.configs).toEqual([{ token: "azure-token", region: "germanywestcentral", speechRecognitionLanguage: "nl-NL", outputFormat: 1 }]);
    expect(fetcher.mock.calls.filter(([path]) => String(path).endsWith("/speech-recognition/token"))).toHaveLength(1);
    expect(fetcher.mock.calls.find(([path]) => String(path).endsWith("/speech-recognition/token"))![1]?.method).toBe("POST");
  });

  it("scores pronunciation with Microsoft and opens the details from the passing verdict", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } });
    setRecognizer("microsoft");
    const fetcher = vi.mocked(fetch);
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith("/speech-recognition/token")
      ? response({ token: "azure-token", region: "germanywestcentral", expiresAt: Date.now() + 60_000 }) : original(input, init));
    azure.assessments = [];
    azure.next = { reason: 3, text: "Woord 1.", properties: { getProperty: () => JSON.stringify({ NBest: [{
      Display: "Woord 1.", PronunciationAssessment: { AccuracyScore: 72, FluencyScore: 90, CompletenessScore: 100, PronScore: 78 },
      Words: [{ Word: "woord", PronunciationAssessment: { AccuracyScore: 58, ErrorType: "Mispronunciation" } }, { Word: "1", PronunciationAssessment: { AccuracyScore: 95, ErrorType: "None" } }],
    }] }) } };
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    const verdict = await within(first).findByRole("status");
    expect(azure.assessments).toEqual([{ referenceText: "woord 1", gradingSystem: "HundredMark", granularity: "Word", enableMiscue: true }]);
    expect(within(verdict).getByRole("img", { name: "Pronunciation score 78 of 100" })).toBeInTheDocument();
    // The assessment is stored once as a pronunciation attempt of the word card (docs/words.md#pronunciation-assessment).
    const stored = fetcher.mock.calls.filter(([path]) => String(path) === `/api/groups/${groupId}/pronunciation-attempts`);
    expect(stored).toHaveLength(1);
    expect(stored[0]![1]?.method).toBe("POST");
    expect(JSON.parse(String(stored[0]![1]?.body))).toEqual({
      surface: "word_card", referenceText: "woord 1", overall: 78, accuracy: 72, fluency: 90, completeness: 100, lessonId: id(40), wordId: id(101),
      words: [{ word: "woord", accuracy: 58, error: "mispronunciation" }, { word: "1", accuracy: 95, error: "none" }],
    });
    fireEvent.click(within(verdict).getByRole("button", { name: /Show pronunciation details/ }));
    const details = within(first).getByRole("dialog", { name: "Pronunciation details" });
    expect(details).toHaveTextContent("Accuracy72");
    expect(details).toHaveTextContent("woord58 · unclear");
    fireEvent.click(within(details).getByRole("button", { name: "Close pronunciation details" }));
    expect(within(first).queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("feeds Microsoft the app's own capture and keeps the word when finished early", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } });
    const ports: Array<{ onmessage: ((event: { data: Float32Array }) => void) | null; close: () => void }> = [];
    vi.stubGlobal("AudioWorkletNode", class { port = { onmessage: null, close: () => undefined }; constructor() { ports.push(this.port); } });
    vi.stubGlobal("AudioContext", class {
      sampleRate = 48_000;
      audioWorklet = { addModule: async () => undefined };
      createAnalyser() { return { fftSize: 0, getFloatTimeDomainData: () => undefined }; }
      createMediaStreamSource() { return { connect: () => undefined }; }
      close() { return Promise.resolve(); }
    });
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:tap", revokeObjectURL: () => undefined }));
    setRecognizer("microsoft");
    const fetcher = vi.mocked(fetch);
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith("/speech-recognition/token")
      ? response({ token: "azure-token", region: "germanywestcentral", expiresAt: Date.now() + 60_000 }) : original(input, init));
    azure.next = "wait"; azure.respond = null; azure.written = 0; azure.pushClosed = false;
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    await waitFor(() => expect(azure.respond).not.toBeNull());
    act(() => ports[0]!.onmessage?.({ data: new Float32Array(480).fill(0.2) }));
    expect(azure.written).toBe(320);
    fireEvent.click(within(first).getByRole("button", { name: "Stop listening" }));
    expect(azure.pushClosed).toBe(true);
    act(() => azure.respond!({ reason: 3, text: "woord 1", properties: { getProperty: () => JSON.stringify({ NBest: [{ Display: "woord 1" }] }) } }));
    expect(within(first).getByRole("status")).toHaveTextContent("Matches!You said “woord 1”");
  });

  it("says when Microsoft hears nothing or the microphone is blocked", async () => {
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [] }));
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    setRecognizer("microsoft");
    const fetcher = vi.mocked(fetch);
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith("/speech-recognition/token")
      ? response({ token: "azure-token", region: "germanywestcentral", expiresAt: Date.now() + 60_000 }) : original(input, init));
    azure.next = { reason: 0 };
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    expect(await within(first).findByRole("status")).toHaveTextContent("Didn't catch that. Try again.");
    getUserMedia.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    fireEvent.click(within(first).getByRole("button", { name: "Say woord 1" }));
    expect(await within(first).findByText(/The microphone is blocked/)).toBeInTheDocument();
  });

  it("offers no microphone where the browser cannot recognize speech", async () => {
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    renderPage();
    const first = await screen.findByRole("article", { name: "woord 1" });
    expect(within(first).queryByRole("button", { name: /Say/ })).not.toBeInTheDocument();
  });
});

describe("Drill setup", () => {
  it("starts a mixed Weak words drill by default, with directions named after the library language", async () => {
    const router = renderPage();
    await screen.findByRole("article", { name: "woord 1" });
    fireEvent.click(screen.getByRole("button", { name: "Drill" }));
    const dialog = await screen.findByRole("dialog", { name: "Drill words" });
    expect(within(dialog).getByRole("radio", { name: "Weak words" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "Mixed" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "Understand Dutch" })).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "Produce Dutch" })).toBeInTheDocument();
    // The lesson select shows only for a lesson drill.
    expect(within(dialog).queryByRole("combobox", { name: "Lesson to drill" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/words/drill"));
    expect(router.state.location.search).toEqual({ source: "weak", direction: "mixed" });
    expect(await screen.findByText("Drill page")).toBeInTheDocument();
  });

  it("drills the filter's lesson by default, in the chosen direction", async () => {
    const router = renderPage(`/words?lesson=${id(41)}`);
    await screen.findByRole("article", { name: "woord 3" });
    fireEvent.click(screen.getByRole("button", { name: "Drill" }));
    const dialog = await screen.findByRole("dialog", { name: "Drill words" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Lesson" }));
    const select = within(dialog).getByRole("combobox", { name: "Lesson to drill" });
    expect(select).toHaveValue("Lesson 41");
    await choose(select, "Lesson 40");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Produce Dutch" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/words/drill"));
    expect(router.state.location.search).toEqual({ source: "lesson", lesson: id(40), direction: "produce" });
  });

  it("disables Weak words with an explanation while there are no visible bookmarks", async () => {
    pages = { [listPath]: { items: [], nextCursor: null } }; lessons = [];
    weakPages = { [weakPath]: { items: [], nextCursor: null, hasMemory: false } };
    renderPage();
    await screen.findByText("No bookmarked words yet");
    fireEvent.click(screen.getByRole("button", { name: "Drill" }));
    const dialog = await screen.findByRole("dialog", { name: "Drill words" });
    expect(within(dialog).getByRole("radio", { name: "Weak words" })).toBeDisabled();
    expect(within(dialog).getByRole("radio", { name: "Lesson" })).toBeDisabled();
    expect(dialog).toHaveTextContent("Bookmark words in a lesson or drill a lesson first; your weak words come from your bookmarks and drills.");
    expect(within(dialog).getByRole("button", { name: "Start" })).toBeDisabled();
  });
});

describe("Weak words view", () => {
  it("switches views in the URL, dropping the lesson filter", async () => {
    const router = renderPage(`/words?lesson=${id(41)}`);
    await screen.findByRole("article", { name: "woord 3" });
    fireEvent.click(within(screen.getByRole("group", { name: "Show" })).getByText("Weak words"));
    await waitFor(() => expect(router.state.location.search).toEqual({ view: "weak" }));
    expect(await screen.findByRole("listitem", { name: "zwak 1" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Lesson" })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Show" })).getByText("Bookmarks"));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await screen.findByRole("article", { name: "woord 1" })).toBeInTheDocument();
    // Unknown views fall back to Bookmarks, and a weak view keeps no lesson.
    expect(validateWordsSearch({ view: "other", lesson: id(41) })).toEqual({ lesson: id(41) });
    expect(validateWordsSearch({ view: "weak", lesson: id(41) })).toEqual({ view: "weak" });
  });

  it("shows each word with its place and five dots labelled in words, loading more pages", async () => {
    renderPage("/words?view=weak");
    const row = await screen.findByRole("listitem", { name: "zwak 1" });
    expect(row).toHaveTextContent("weak meaning 1");
    expect(row).toHaveTextContent("Dutch foundations · Lesson 40");
    const dots = within(row).getByRole("img", { name: "Last 3 results, oldest first: Again, Again, Got it" });
    expect([...dots.children].map((dot) => dot.getAttribute("data-result"))).toEqual(["again", "again", "got", "empty", "empty"]);
    expect(within(row).getByRole("button", { name: "Bookmark zwak 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show more words" }));
    const third = await screen.findByRole("listitem", { name: "zwak 3" });
    expect(within(third).getByRole("img", { name: "No results yet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more words" })).not.toBeInTheDocument();
  });

  it("removes a word marked known at once, and puts it back when that fails", async () => {
    renderPage("/words?view=weak");
    fireEvent.click(within(await screen.findByRole("listitem", { name: "zwak 1" })).getByRole("button", { name: "I know zwak 1" }));
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "zwak 1" })).not.toBeInTheDocument());
    const calls = vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/known"));
    expect(calls.map(([path, init]) => [String(path), init?.method])).toEqual([[`/api/groups/${groupId}/word-memory/zwak%201/known`, "PUT"]]);
    knownStatus = 404;
    fireEvent.click(within(screen.getByRole("listitem", { name: "zwak 2" })).getByRole("button", { name: "I know zwak 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That word could not be marked as known. Try again.");
    expect(screen.getByRole("listitem", { name: "zwak 2" })).toBeInTheDocument();
  });

  it("explains where weak words come from while there are none", async () => {
    weakPages = { [weakPath]: { items: [], nextCursor: null, hasMemory: false } };
    renderPage("/words?view=weak");
    expect(await screen.findByText("No weak words yet")).toBeInTheDocument();
    expect(screen.getByText("Words appear here after you drill them or practise them with the tutor.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drill these words" })).toBeDisabled();
  });

  it("starts a Weak words drill from the list", async () => {
    const router = renderPage("/words?view=weak");
    await screen.findByRole("listitem", { name: "zwak 1" });
    fireEvent.click(screen.getByRole("button", { name: "Drill these words" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/words/drill"));
    expect(router.state.location.search).toEqual({ source: "weak", direction: "mixed" });
  });

  it("enables a Weak words drill from memory alone, without bookmarks", async () => {
    pages = { [listPath]: { items: [], nextCursor: null } }; lessons = [];
    weakPages = { [weakPath]: { items: [], nextCursor: null, hasMemory: true } };
    const router = renderPage();
    await screen.findByText("No bookmarked words yet");
    fireEvent.click(screen.getByRole("button", { name: "Drill" }));
    const dialog = await screen.findByRole("dialog", { name: "Drill words" });
    expect(within(dialog).getByRole("radio", { name: "Weak words" })).toBeEnabled();
    expect(within(dialog).getByRole("radio", { name: "Weak words" })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ source: "weak", direction: "mixed" }));
  });
});
