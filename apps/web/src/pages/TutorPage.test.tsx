import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { TutorConversation, TutorMessage, TutorModelOption, TutorPart, TutorStreamEvent } from "@wordinator/contracts/tutor";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { learningClock } from "../learningTime";
import { stopSpeech } from "../molecules/Speech";
import { TutorSettings } from "../organisms/Tutor/TutorSettings";
import { resetOnDemandSpeech } from "../organisms/TutorComponents";
import { TutorPage } from "./TutorPage";

const groupId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const c1 = "30000000-0000-4000-8000-000000000001";
const c2 = "30000000-0000-4000-8000-000000000002";
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const session = () => ({
  status: "signedIn",
  user: { id: userId, displayName: "Ada", username: "ada", avatarUrl: null, mustChangePassword: false, onboardingComplete: true, isSuperuser: false },
  groups: [{ id: groupId, name: "Library", language: "nl", role: "member", icon: "🇳🇱", iconUrl: null }],
  deletedGroups: [], requests: [],
});
const conversation = (conversationId: string, title: string, archivedAt: number | null = null): TutorConversation => ({ id: conversationId, title, titleSource: "auto", archivedAt, provider: null, createdAt: 1, updatedAt: 2, tokens: 2_500 });
const message = (messageId: string, role: "user" | "assistant", parts: TutorPart[], status: TutorMessage["status"] = "complete"): TutorMessage =>
  ({ id: messageId, conversationId: c1, role, status, parts, provider: role === "assistant" ? "azure" : null, model: null, createdAt: Number(messageId.slice(-4)) });
const text = (value: string, spans: { start: number; end: number }[] = []): TutorPart => ({ type: "text", text: value, spans });

let conversations: TutorConversation[];
let archivedConversations: TutorConversation[];
let models: TutorModelOption[];
let messages: Record<string, TutorMessage[]>;
let turn: (path: string, body: unknown) => Response;
let speech: () => Response;

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

// A streamed turn. `hold` keeps the stream open after the given events, so a test can see the live render, then `push` the rest.
function sse(events: TutorStreamEvent[], hold = false) {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({ start(next) { controller = next; } });
  const push = (more: TutorStreamEvent[], close = true) => {
    const bytes = encoder.encode(more.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
    // Split mid-event to exercise the parser's buffering.
    const mid = Math.floor(bytes.length / 2);
    controller!.enqueue(bytes.slice(0, mid)); controller!.enqueue(bytes.slice(mid));
    if (close) controller!.close();
  };
  push(events, !hold);
  return { response: new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }), push };
}

function renderPage(initial: string | null = c1) {
  const root = createRootRoute();
  const ai = createRoute({
    getParentRoute: () => root, path: "/ai",
    validateSearch: (search: Record<string, unknown>) => typeof search.conversation === "string" ? { conversation: search.conversation } : {},
    component: function Harness() {
      const search = ai.useSearch(); const navigate = ai.useNavigate();
      return <TutorPage groupId={groupId} conversationId={search.conversation ?? null} onOpen={(next) => { void navigate({ search: next ? { conversation: next } : {} }); }} />;
    },
  });
  const router = createRouter({ routeTree: root.addChildren([ai]), history: createMemoryHistory({ initialEntries: [initial ? `/ai?conversation=${initial}` : "/ai"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
  return router;
}

const patches = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PATCH").map(([input, init]) => ({ path: String(input), body: JSON.parse(String(init!.body)) as unknown }));
const posts = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST").map(([input, init]) => ({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) as unknown : null }));

beforeEach(() => {
  localStorage.clear();
  resetOnDemandSpeech();
  conversations = [conversation(c1, "What next?")];
  archivedConversations = [];
  models = [{ provider: "openrouter", model: "openai/gpt-oss-120b:free" }, { provider: "azure", model: "gpt-4.1-mini" }];
  messages = { [c1]: [message(id(1), "user", [text("What next?")])] };
  turn = () => json({ error: { code: "UNEXPECTED", message: "No turn scripted." } }, 500);
  speech = () => json({ url: "https://media.test/clip.mp3" });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("playing")); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as unknown : null;
    if (path === "/api/session") return json(session());
    if (path === "/api/ai/models") return json({ items: models });
    if (path.startsWith("/api/ai/usage")) return json({
      today: { tokensIn: 12_000, tokensOut: 3_400, turns: 7, turnCap: 40, resetsAt: Date.UTC(2026, 9, 17) },
      conversation: path.includes("conversationId=") ? { tokensIn: 2_000, tokensOut: 500 } : null,
    });
    if (path.startsWith("/api/ai/conversations?archived=")) return json({ items: path.includes("archived=true") ? archivedConversations : conversations, nextCursor: null });
    if (path === "/api/ai/conversations" && method === "POST") { const created = conversation(c2, ""); conversations = [created, ...conversations]; messages[c2] = []; return json({ conversation: created }, 201); }
    const match = /^\/api\/ai\/conversations\/([^/]+)(\/.*)?$/.exec(path);
    if (match) {
      const [, conversationId, rest = ""] = match;
      const all = [...conversations, ...archivedConversations];
      const found = all.find((entry) => entry.id === conversationId);
      if (!found) return json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Missing." } }, 404);
      if (rest === "" && method === "PATCH") {
        const change = body as { provider?: TutorConversation["provider"]; title?: string };
        const changed = { ...found, ...(change.provider !== undefined ? { provider: change.provider } : {}), ...(change.title !== undefined ? { title: change.title, titleSource: "user" as const } : {}) };
        conversations = conversations.map((entry) => entry.id === found.id ? changed : entry);
        return json({ conversation: changed });
      }
      if (rest === "") return json({ conversation: found });
      if (rest === "/messages" && method === "GET") return json({ items: [...(messages[conversationId!] ?? [])].reverse(), nextCursor: null });
      if (rest === "/archive" || rest === "/unarchive") {
        const moved = { ...found, archivedAt: rest === "/archive" ? 5 : null };
        conversations = rest === "/archive" ? conversations.filter((entry) => entry.id !== found.id) : [moved, ...conversations];
        archivedConversations = rest === "/archive" ? [moved, ...archivedConversations] : archivedConversations.filter((entry) => entry.id !== found.id);
        return json({ conversation: moved });
      }
      if (rest.endsWith("/speech")) return speech();
      if (method === "POST") return turn(path, body);
    }
    return json({ ok: true });
  }));
});

afterEach(() => { act(() => stopSpeech()); cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const composer = () => screen.getByRole("textbox", { name: "Message your tutor" });
// Every Select keeps its options mounted; the open one is found through the listbox its combobox controls.
async function choose(combobox: HTMLElement, option: string | RegExp) {
  fireEvent.click(combobox);
  await waitFor(() => expect(combobox).toHaveAttribute("aria-expanded", "true"));
  fireEvent.click(within(document.getElementById(combobox.getAttribute("aria-controls")!)!).getByRole("option", { name: option, hidden: true }));
}
const sendText = (value: string) => { fireEvent.change(composer(), { target: { value } }); fireEvent.click(screen.getByRole("button", { name: "Send" })); };

describe("Tutor page", () => {
  it("renames the open conversation from its details dialog and keeps the learner's title", async () => {
    renderPage(c1);
    fireEvent.click(await screen.findByRole("button", { name: "Conversation details" }));
    const dialog = await screen.findByRole("dialog", { name: "Conversation details" });
    const field = within(dialog).getByRole("textbox", { name: "Conversation title" });
    expect(field).toHaveValue("What next?");
    fireEvent.change(field, { target: { value: "  Separable   verbs " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: "Separable verbs", level: 2 })).toBeInTheDocument();
    expect(patches()).toEqual([{ path: `/api/ai/conversations/${c1}`, body: { title: "Separable verbs" } }]);
  });

  it("shows each row's tokens and marks a title the tutor chose", async () => {
    conversations = [{ ...conversation(c1, "Greetings practice"), titleSource: "tutor", updatedAt: Date.now() - 20 * 60 * 1_000 }, { ...conversation(c2, "Untouched"), tokens: 0 }];
    renderPage(c1);
    const row = await screen.findByRole("link", { name: /Greetings practice/ });
    expect(row).toHaveTextContent("20 minutes ago");
    expect(row).toHaveTextContent("2.5K tokens");
    expect(within(row).getByLabelText("Named by your tutor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Untouched/ })).not.toHaveTextContent("tokens");
    expect(screen.getAllByLabelText("Named by your tutor")).toHaveLength(2);
  });

  it("opens the summary from a conversation row's actions", async () => {
    renderPage(c1);
    fireEvent.click(await screen.findByRole("button", { name: "Actions for What next?" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Show summary" }));
    const dialog = await screen.findByRole("dialog", { name: "Conversation details" });
    expect(within(dialog).getByText(/You started by asking: What next\?/)).toBeInTheDocument();
  });

  it("opens title editing from a conversation row's actions", async () => {
    renderPage(c1);
    fireEvent.click(await screen.findByRole("button", { name: "Actions for What next?" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change title" }));
    const dialog = await screen.findByRole("dialog", { name: "Conversation details" });
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Conversation title" })).toHaveFocus());
  });

  it("shows the privacy notice in full once per account and browser, then as one line that opens", async () => {
    renderPage(c1);
    expect(await screen.findByText(/which may keep them/)).toBeVisible();
    expect(screen.queryByText("Processed by external AI providers")).toBeNull();
    cleanup();
    renderPage(c1);
    const summary = await screen.findByText("Processed by external AI providers");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
  });

  it("shows today's usage and the open conversation's tokens in conversation details", async () => {
    renderPage(c1);
    fireEvent.click(await screen.findByRole("button", { name: "Conversation details" }));
    const dialog = await screen.findByRole("dialog", { name: "Conversation details" });
    expect(await within(dialog).findByText("15.4K tokens")).toBeInTheDocument();
    expect(within(dialog).getByText("2.5K tokens")).toBeInTheDocument();
    expect(within(dialog).getByText("7 of 40 turns")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input) === `/api/ai/usage?conversationId=${c1}`)).toBe(true);
  });

  it("lists conversations, shows the privacy notice, and renders a stored conversation", async () => {
    messages[c1]!.push(message(id(2), "assistant", [
      { type: "tool_call", toolCallId: id(20), name: "get_lesson", arguments: { lessonId: id(30) } },
      { type: "tool_result", toolCallId: id(20), name: "get_lesson", ok: true, error: null, detail: { lessonTitle: "Lesson 6", courseTitle: "Basics", lessonId: id(30) } },
      text("## Grammar\nUse **de** here."),
    ]));
    renderPage();
    expect(await screen.findByRole("link", { name: /What next\?/ })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("What next?", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/processed by external AI providers/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grammar" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Your avatar" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tutor avatar" })).toBeInTheDocument();
    const response = screen.getByRole("article", { name: "Tutor response" });
    expect(within(response).getByText("Tutor")).toBeInTheDocument();
    expect(within(response).getByText("AI")).toBeInTheDocument();
    expect(within(response).getByLabelText("Lesson source: Basics · Lesson 6")).toBeInTheDocument();
  });

  it("shows the send hint and preserves Enter, Shift+Enter, and IME keyboard behavior", async () => {
    const user = message(id(10), "user", [text("Teach me")]);
    const assistant = message(id(11), "assistant", [text("Let’s begin.")]);
    turn = () => sse([
      { type: "user_message", message: user },
      { type: "start", messageId: assistant.id },
      { type: "done", message: assistant },
    ]).response;
    renderPage();
    const field = await screen.findByRole("textbox", { name: "Message your tutor" });
    expect(screen.getByText("Enter to send")).toBeVisible();
    fireEvent.change(field, { target: { value: "Teach me" } });
    expect(fireEvent.keyDown(field, { key: "Enter", shiftKey: true })).toBe(true);
    fireEvent.change(field, { target: { value: "Teach me\n" } });
    expect(field).toHaveValue("Teach me\n");
    expect(fireEvent.keyDown(field, { key: "Enter", isComposing: true })).toBe(true);
    expect(posts().filter((entry) => entry.path.endsWith("/messages"))).toHaveLength(0);
    expect(field).toHaveValue("Teach me\n");
    expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(false);
    await waitFor(() => expect(posts().filter((entry) => entry.path.endsWith("/messages"))).toHaveLength(1));
    expect(await screen.findByText("Let’s begin.")).toBeInTheDocument();
    expect(posts().find((entry) => entry.path.endsWith("/messages"))?.body).toEqual({ text: "Teach me" });
  });

  it("streams a turn live into sections, then replaces it with the stored message", async () => {
    const user = message(id(10), "user", [text("Teach me")]);
    const assistantId = id(11);
    const stored = message(assistantId, "assistant", [
      { type: "tool_call", toolCallId: id(20), name: "get_lesson", arguments: { lessonId: "next" } },
      { type: "tool_result", toolCallId: id(20), name: "get_lesson", ok: true, error: null, detail: { lessonTitle: "Lesson 6", courseTitle: "Basics", lessonId: id(30), next: true } },
      text("## Words\nSay Goedemorgen.", [{ start: 13, end: 24 }]),
    ]);
    let stream: ReturnType<typeof sse> | null = null;
    turn = () => {
      stream = sse([{ type: "user_message", message: user }, { type: "start", messageId: assistantId },
        { type: "tool_call", part: { type: "tool_call", toolCallId: id(20), name: "get_lesson", arguments: { lessonId: "next", summary: "Finding your next lesson" } } }], true);
      return stream.response;
    };
    renderPage();
    await screen.findByText("What next?", { selector: "p" });
    sendText("Teach me");
    expect(await screen.findByText("Teach me", { selector: "p" })).toBeInTheDocument();
    const runningStep = await screen.findByRole("button", { name: "Finding your next lesson" });
    fireEvent.click(runningStep);
    expect(await screen.findByText("What it did")).toBeInTheDocument();
    await act(async () => { stream!.push([
      { type: "tool_result", part: { type: "tool_result", toolCallId: id(20), name: "get_lesson", ok: true, error: null, detail: { lessonTitle: "Lesson 6", courseTitle: "Basics", lessonId: id(30), next: true } } },
      { type: "text", delta: "## Words\nSay [[Goede" }], false); });
    expect(await screen.findByText("Looked up Lesson 6")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Words" })).toBeInTheDocument();
    // Streaming text has no speaker buttons yet.
    expect(screen.queryByRole("button", { name: /Play “/ })).toBeNull();
    await act(async () => { stream!.push([{ type: "text", delta: "morgen]]." }, { type: "done", message: stored }]); });
    expect(await screen.findByRole("button", { name: "Play “Goedemorgen”" })).toBeInTheDocument();
    expect(screen.getAllByText("Looked up Lesson 6")).toHaveLength(1);
    // The chip opens its detail.
    fireEvent.click(screen.getByRole("button", { name: /Looked up Lesson 6/ }));
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(posts().find((entry) => entry.path.endsWith("/messages"))?.body).toEqual({ text: "Teach me" });
  });

  it("requests on-demand speech for a span by its index across the message's parts", async () => {
    messages[c1]!.push(message(id(2), "assistant", [text("[x] one", [{ start: 1, end: 2 }]), { type: "tool_call", toolCallId: id(21), name: "get_weak_words", arguments: {} },
      text("Then hallo.", [{ start: 5, end: 10 }])]));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Play “hallo”" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(posts().find((entry) => entry.path.endsWith("/speech"))).toEqual({ path: `/api/ai/conversations/${c1}/messages/${id(2)}/speech`, body: { spanIndex: 1 } });
  });

  it("describes recent tool calls by the tutor's summary, and older ones without a summary by the tool's label", async () => {
    messages[c1]!.push(message(id(2), "assistant", [
      { type: "tool_call", toolCallId: id(21), name: "get_weak_words", arguments: {} },
      { type: "tool_result", toolCallId: id(21), name: "get_weak_words", ok: true, error: null, detail: { count: 3 } },
      { type: "tool_call", toolCallId: id(22), name: "get_lesson", arguments: {} },
      { type: "tool_result", toolCallId: id(22), name: "get_lesson", ok: true, error: null, detail: { lessonTitle: "Boodschappen", summary: "Reading lesson 3: Boodschappen" } },
      text("Here we go."),
    ]));
    renderPage(c1);
    fireEvent.click(await screen.findByRole("button", { name: "Conversation details" }));
    const dialog = await screen.findByRole("dialog", { name: "Conversation details" });
    expect(await within(dialog).findByText("Reading lesson 3: Boodschappen")).toBeInTheDocument();
    expect(within(dialog).getByText("Checked your weak words")).toBeInTheDocument();
  });

  it("folds consecutive tool chips into one closed group that opens to done and failed steps", async () => {
    messages[c1]!.push(message(id(2), "assistant", [
      { type: "tool_call", toolCallId: id(21), name: "get_weak_words", arguments: {} },
      { type: "tool_result", toolCallId: id(21), name: "get_weak_words", ok: true, error: null, detail: { count: 3 } },
      { type: "tool_call", toolCallId: id(22), name: "get_lesson", arguments: {} },
      { type: "tool_result", toolCallId: id(22), name: "get_lesson", ok: false, error: "LESSON_NOT_FOUND", detail: {} },
      text("Here we go."),
      { type: "tool_call", toolCallId: id(23), name: "get_recent_words", arguments: {} },
      { type: "tool_result", toolCallId: id(23), name: "get_recent_words", ok: true, error: null, detail: { count: 1 } },
    ]));
    renderPage();
    const group = await screen.findByRole("button", { name: /Used 2 tools/ });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(group).toHaveTextContent("· 1 failed");
    expect(screen.queryByText("Checked your weak words")).toBeNull();
    // A single step outside the group stays a plain chip.
    expect(screen.getByText("Checked your recent words")).toBeInTheDocument();
    fireEvent.click(group);
    expect(screen.getByText("Checked your weak words").closest("[data-status]")).toHaveAttribute("data-status", "done");
    const failed = screen.getByText("Couldn’t open that lesson").closest("[data-status]");
    expect(failed).toHaveAttribute("data-status", "failed");
    expect(screen.queryByText(/\{\{lessonTitle\}\}/)).toBeNull();
    fireEvent.click(within(failed as HTMLElement).getByRole("button"));
    expect(screen.getByText("Error: LESSON_NOT_FOUND")).toBeInTheDocument();
  });

  it("answers a confirmation card, streams the resumed turn, and collapses the card", async () => {
    const card: Extract<TutorPart, { type: "confirmation" }> = { type: "confirmation", toolCallId: id(40), answer: null, outcome: null, answeredAt: null,
      summary: { action: "reset_lesson", course: { id: id(50), title: "Basics" }, lesson: { id: id(51), title: "Lesson 6" }, deletes: { position: true, completion: false, practiceProgress: 2, attempts: 5, reviews: 1, pronunciations: 3, bookmarks: 0 } } };
    messages[c1]!.push(message(id(2), "assistant", [text("Shall I?"), card], "awaiting_user"));
    turn = (path) => {
      expect(path).toBe(`/api/ai/conversations/${c1}/tool-calls/${id(40)}/respond`);
      return sse([{ type: "answered", messageId: id(2), part: { ...card, answer: "confirmed", outcome: { ok: true, error: null }, answeredAt: 9 } },
        { type: "start", messageId: id(3) }, { type: "text", delta: "Done." }, { type: "done", message: message(id(3), "assistant", [text("Done.")]) }]).response;
    };
    renderPage();
    expect(await screen.findByText("Start Lesson 6 in Basics over? This deletes:")).toBeInTheDocument();
    expect(screen.getByText("5 answers")).toBeInTheDocument();
    // The composer waits for the card.
    expect(composer()).toBeDisabled();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm.className).toMatch(/danger/);
    fireEvent.click(confirm);
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(screen.getByText(/Confirmed · Start Lesson 6/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(posts().find((entry) => entry.path.endsWith("/respond"))?.body).toEqual({ type: "confirmation", confirmed: true });
    expect(composer()).toBeEnabled();
  });

  it("shows the focus of a saved AI practice on its confirmation card", async () => {
    const card: Extract<TutorPart, { type: "confirmation" }> = { type: "confirmation", toolCallId: id(43), answer: null, outcome: null, answeredAt: null,
      summary: { action: "save_ai_practice", focus: "listening", view: { kind: "dictation", translation: null }, lessons: [{ course: { id: id(50), title: "Basics" }, lesson: { id: id(51), title: "Lesson 6" }, afterBlockId: id(60) }] } };
    messages[c1]!.push(message(id(2), "assistant", [card], "awaiting_user"));
    renderPage();
    expect(await screen.findByText("Focus: Listening")).toBeInTheDocument();
  });

  it("counts an open conversation as tutor time", async () => {
    renderPage();
    await waitFor(() => expect(learningClock().running).toBe(true));
    cleanup();
    expect(learningClock().running).toBe(false);
  });

it("cancels a card and shows an answered card as a muted line", async () => {
    const card: Extract<TutorPart, { type: "confirmation" }> = { type: "confirmation", toolCallId: id(41), answer: null, outcome: null, answeredAt: null,
      summary: { action: "complete_lesson", course: { id: id(50), title: "Basics" }, lesson: { id: id(51), title: "Lesson 6" } } };
    messages[c1]!.push(message(id(2), "assistant", [card], "awaiting_user"));
    turn = () => sse([{ type: "answered", messageId: id(2), part: { ...card, answer: "cancelled", answeredAt: 9 } }, { type: "start", messageId: id(3) },
      { type: "done", message: message(id(3), "assistant", [text("Okay, later.")]) }]).response;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText(/Cancelled · Mark Lesson 6 in Basics as complete\?/)).toBeInTheDocument();
    expect(posts().find((entry) => entry.path.endsWith("/respond"))?.body).toEqual({ type: "confirmation", confirmed: false });
  });

  it("answers a lone question in the dock, which replaces the composer, and sends it with the set route", async () => {
    const component: Extract<TutorPart, { type: "component" }> = { type: "component", toolCallId: id(42), kind: "choice", answer: null, grade: null, answeredAt: null,
      view: { kind: "choice", question: "Huis means?", options: ["house", "tree", "car"] } };
    messages[c1]!.push(message(id(2), "assistant", [component], "awaiting_user"));
    const graded = { ...component, answer: { kind: "choice" as const, choice: 0 }, answeredAt: 9,
      grade: { correct: true, matched: true, verdict: null, note: null, reference: "house", items: [], score: null } };
    turn = () => sse([{ type: "answered", messageId: id(2), part: graded }, { type: "start", messageId: id(3) }, { type: "done", message: message(id(3), "assistant", [text("Right!")]) }]).response;
    renderPage();
    const dock = await screen.findByRole("region", { name: "Your tutor’s questions" });
    expect(screen.queryByRole("textbox", { name: "Message your tutor" })).toBeNull();
    expect(screen.getByText("Answer the question below.")).toBeInTheDocument();
    fireEvent.click(within(dock).getByRole("button", { name: /house/ }));
    expect(within(dock).getByRole("button", { name: /house/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dock).getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Matches!")).toBeInTheDocument();
    expect(posts().find((entry) => entry.path.endsWith("/answers"))).toEqual({
      path: `/api/ai/conversations/${c1}/messages/${id(2)}/answers`, body: { answers: [{ toolCallId: id(42), answer: { kind: "choice", choice: 0 } }] },
    });
    expect(await screen.findByRole("textbox", { name: "Message your tutor" })).toBeEnabled();
  });

  it("moves through a practice set with Next and Previous, keeps drafts editable, and checks the whole set at once", async () => {
    const choice: Extract<TutorPart, { type: "component" }> = { type: "component", toolCallId: id(44), kind: "choice", answer: null, grade: null, answeredAt: null,
      view: { kind: "choice", question: "What does [[het huis]] mean?", options: ["house", "tree", "car"] } };
    const translate: Extract<TutorPart, { type: "component" }> = { type: "component", toolCallId: id(45), kind: "translate", answer: null, grade: null, answeredAt: null,
      view: { kind: "translate", source: "I live in a house." } };
    const order: Extract<TutorPart, { type: "component" }> = { type: "component", toolCallId: id(46), kind: "word_order", answer: null, grade: null, answeredAt: null,
      view: { kind: "word_order", chunks: ["groot", "Het huis", "is"], translation: "The house is big." } };
    messages[c1]!.push(message(id(2), "assistant", [choice, translate, order], "awaiting_user"));
    turn = () => sse([{ type: "start", messageId: id(3) }, { type: "done", message: message(id(3), "assistant", [text("Checked.")]) }]).response;
    renderPage();
    const dock = await screen.findByRole("region", { name: "Your tutor’s questions" });
    // The marks become an emphasised span, not literal brackets.
    expect(within(dock).getByText("het huis")).toBeInTheDocument();
    expect(screen.queryByText(/\[\[/)).toBeNull();
    expect(within(dock).getByText(/Question 1 of 3/)).toBeInTheDocument();
    expect(within(dock).queryByRole("textbox", { name: "Your translation" })).toBeNull();

    // Picking an option saves it and moves on; Previous goes back with the pick kept, and it can change.
    fireEvent.click(within(dock).getByRole("button", { name: /house/ }));
    expect(await within(dock).findByText(/Question 2 of 3/)).toBeInTheDocument();
    fireEvent.change(within(dock).getByRole("textbox", { name: "Your translation" }), { target: { value: "Ik woon in een huis." } });
    fireEvent.click(within(dock).getByRole("button", { name: "Previous" }));
    expect(within(dock).getByRole("button", { name: /house/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dock).getByRole("button", { name: /tree/ }));
    expect(within(dock).getByRole("button", { name: "Question 2, answered" })).toBeInTheDocument();

    // Minimizing keeps only the head, and the questions stay mounted; a pip brings them back where they were.
    fireEvent.click(within(dock).getByRole("button", { name: "Minimize questions" }));
    expect(dock).toHaveAttribute("data-minimized");
    expect(within(dock).getByRole("button", { name: "Show questions" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(within(dock).getByRole("button", { name: "Question 2, answered" }));
    expect(dock).not.toHaveAttribute("data-minimized");
    expect(within(dock).getByRole("button", { name: "Minimize questions" })).toHaveAttribute("aria-expanded", "true");

    // The typed translation survived; Next on the last question becomes Check answers, and the unanswered one goes as a skip.
    expect(within(dock).getByRole("textbox", { name: "Your translation" })).toHaveValue("Ik woon in een huis.");
    fireEvent.click(within(dock).getByRole("button", { name: "Next" }));
    expect(within(dock).getByText(/Question 3 of 3/)).toBeInTheDocument();
    expect(within(dock).queryByRole("button", { name: "Next" })).toBeNull();
    expect(within(dock).getByText("1 question without an answer will be skipped.")).toBeInTheDocument();
    expect(posts().some((entry) => entry.path.endsWith("/answers"))).toBe(false);
    fireEvent.click(within(dock).getByRole("button", { name: "Check answers" }));
    expect(await screen.findByText("Checked.")).toBeInTheDocument();
    expect(posts().find((entry) => entry.path.endsWith("/answers"))?.body).toEqual({ answers: [
      { toolCallId: id(44), answer: { kind: "choice", choice: 1 } },
      { toolCallId: id(45), answer: { kind: "translate", text: "Ik woon in een huis." } },
      { toolCallId: id(46), skip: true },
    ] });
  });

  it("skips a lone question from the dock, which collapses to a muted line and frees the composer", async () => {
    const component: Extract<TutorPart, { type: "component" }> = { type: "component", toolCallId: id(43), kind: "choice", answer: null, grade: null, answeredAt: null,
      view: { kind: "choice", question: "Huis means?", options: ["house", "tree"] } };
    messages[c1]!.push(message(id(2), "assistant", [component], "awaiting_user"));
    turn = () => sse([{ type: "answered", messageId: id(2), part: { ...component, answeredAt: 9, skipped: true } }, { type: "start", messageId: id(3) },
      { type: "done", message: message(id(3), "assistant", [text("Let's move on.")]) }]).response;
    renderPage();
    const dock = await screen.findByRole("region", { name: "Your tutor’s questions" });
    expect(within(dock).getByText("Huis means?")).toBeInTheDocument();
    fireEvent.click(within(dock).getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Let's move on.")).toBeInTheDocument();
    // The skipped question leaves the tutor's card for the learner's answers.
    const answers = screen.getByRole("region", { name: "Your answers" });
    expect(within(answers).getByText("Your answers · Multiple choice")).toBeInTheDocument();
    expect(within(answers).getByText("Skipped")).toBeInTheDocument();
    expect(within(answers).getByText("0 of 1 right")).toBeInTheDocument();
    expect(screen.queryByText("Huis means?")).toBeNull();
    expect(posts().find((entry) => entry.path.endsWith("/answers"))?.body).toEqual({ answers: [{ toolCallId: id(43), skip: true }] });
    expect(composer()).toBeEnabled();
  });

  it("disables the composer at the daily limit and says when it resets", async () => {
    turn = () => json({ error: { code: "AI_DAILY_LIMIT", message: "Limit.", resetsAt: Date.now() + 60_000 } }, 429);
    renderPage();
    await screen.findByText("What next?", { selector: "p" });
    sendText("One more");
    expect(await screen.findByText(/reached today’s tutor limit/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message your tutor" })).toBeNull();
  });

  it("shows an in-stream error with Try again, which resends the last message", async () => {
    turn = () => sse([{ type: "user_message", message: message(id(10), "user", [text("Hello")]) }, { type: "start", messageId: id(11) },
      { type: "error", code: "AI_UNAVAILABLE", message: "No provider." },
      { type: "done", message: message(id(11), "assistant", [{ type: "error", code: "AI_UNAVAILABLE", message: "No provider." }], "error") }]).response;
    renderPage();
    await screen.findByText("What next?", { selector: "p" });
    sendText("Hello");
    expect(await screen.findByText("The tutor is not available right now. Try again later.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(posts().filter((entry) => entry.path.endsWith("/messages"))).toHaveLength(2));
    expect(posts().filter((entry) => entry.path.endsWith("/messages"))[1]!.body).toEqual({ text: "Hello" });
  });

  it("shows a pre-stream refusal", async () => {
    turn = () => json({ error: { code: "TURN_IN_PROGRESS", message: "Answer first." } }, 409);
    renderPage();
    await screen.findByText("What next?", { selector: "p" });
    sendText("Hi");
    expect(await screen.findByText("Answer the open question or card first.")).toBeInTheDocument();
    expect(composer()).toHaveValue("Hi");
  });

  it("creates a conversation on the first message of a new one", async () => {
    turn = () => sse([{ type: "user_message", message: { ...message(id(10), "user", [text("Start")]), conversationId: c2 } }, { type: "start", messageId: id(11) },
      { type: "text", delta: "Welcome." }, { type: "done", message: { ...message(id(11), "assistant", [text("Welcome.")]), conversationId: c2 } }]).response;
    const router = renderPage(null);
    expect(await screen.findByText(/processed by external AI providers/)).toBeInTheDocument();
    sendText("Start");
    expect(await screen.findByText("Welcome.")).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ conversation: c2 });
    expect(posts().map((entry) => entry.path)).toEqual(["/api/ai/conversations", `/api/ai/conversations/${c2}/messages`]);
  });

  it("changes an open conversation's model, and back to the default", async () => {
    renderPage();
    const picker = await screen.findByRole("combobox", { name: "Model for this conversation" });
    // Closed, the picker shows short model names; the open list names Default or the provider above each.
    expect(picker).toHaveValue("gpt-oss-120b · Default");
    await choose(picker, /^Azure/);
    await waitFor(() => expect(picker).toHaveValue("gpt-4.1-mini"));
    await choose(picker, /^Default/);
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()).toEqual([
      { path: `/api/ai/conversations/${c1}`, body: { provider: "azure" } },
      { path: `/api/ai/conversations/${c1}`, body: { provider: null } },
    ]);
  });

  it("keeps a new conversation's model until its first message creates it, and hides the picker with one model", async () => {
    turn = () => sse([{ type: "start", messageId: id(11) }, { type: "done", message: { ...message(id(11), "assistant", [text("Hoi.")]), conversationId: c2 } }]).response;
    renderPage(null);
    const picker = await screen.findByRole("combobox", { name: "Model for this conversation" });
    await choose(picker, /^Azure/);
    expect(patches()).toEqual([]);
    sendText("Start");
    expect(await screen.findByText("Hoi.")).toBeInTheDocument();
    expect(patches()).toEqual([{ path: `/api/ai/conversations/${c2}`, body: { provider: "azure" } }]);
    expect(posts().map((entry) => entry.path)).toEqual(["/api/ai/conversations", `/api/ai/conversations/${c2}/messages`]);
    cleanup();
    models = models.slice(0, 1);
    renderPage();
    expect(await screen.findByText("What next?", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model for this conversation" })).toBeNull();
  });

  it("archives and unarchives a conversation; an archived one cannot be continued", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Actions for What next?" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: /What next\?/ })).toBeNull());
    expect(await screen.findByText("This conversation is archived. Unarchive it to continue.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Include archived" }));
    const archivedRow = await screen.findByRole("link", { name: /What next\?/ });
    expect(archivedRow).toHaveTextContent("Archived");
    fireEvent.click(screen.getByRole("button", { name: "Actions for What next?" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Unarchive" }));
    await waitFor(() => expect(screen.getByRole("link", { name: /What next\?/ })).not.toHaveTextContent("Archived"));
    expect(await screen.findByRole("textbox", { name: "Message your tutor" })).toBeEnabled();
  });
});

function renderWithRouter(element: () => React.ReactNode) {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "$", component: element });
  const ai = createRoute({ getParentRoute: () => root, path: "/ai", component: () => null });
  const router = createRouter({ routeTree: root.addChildren([page, ai]), history: createMemoryHistory({ initialEntries: ["/courses"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

describe("Tutor entry and settings", () => {
  it("edits the tutor profile, shows the notes, and clears them after confirming", async () => {
    let profile = { nativeLanguage: "en", replyLanguage: "native", goals: null as string | null, notes: "Mixes up de and het." as string | null, updatedAt: null as number | null };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === "/api/ai/profile" && init?.method === "PUT") { const body = JSON.parse(String(init.body)) as typeof profile; profile = { ...profile, ...body, updatedAt: 5 }; return json({ profile }); }
      if (path === "/api/ai/profile/notes" && init?.method === "DELETE") { profile = { ...profile, notes: null }; return json({ profile }); }
      if (path === "/api/ai/profile") return json({ profile });
      return json({ ok: true });
    });
    renderWithRouter(() => <TutorSettings />);
    expect(await screen.findByText("Mixes up de and het.")).toBeInTheDocument();
    expect(screen.getByText(/processed by external AI providers/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Goals/ }), { target: { value: "  Speaking  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save tutor settings" }));
    expect(await screen.findByText("Saved.", { exact: false })).toBeInTheDocument();
    const put = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ nativeLanguage: "en", replyLanguage: "native", goals: "Speaking" });
    fireEvent.click(screen.getByRole("button", { name: "Clear notes" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear notes" }));
    expect(await screen.findByText("Your tutor has not written any notes about you yet.")).toBeInTheDocument();
  });
});
