import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { TutorConversation, TutorMessage, TutorPart, TutorStreamEvent } from "@wordinator/contracts/tutor";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { stopSpeech } from "../molecules/Speech";
import { TutorCta } from "../organisms/Tutor/TutorCta";
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
const conversation = (conversationId: string, title: string, archivedAt: number | null = null): TutorConversation => ({ id: conversationId, title, archivedAt, createdAt: 1, updatedAt: 2 });
const message = (messageId: string, role: "user" | "assistant", parts: TutorPart[], status: TutorMessage["status"] = "complete"): TutorMessage =>
  ({ id: messageId, conversationId: c1, role, status, parts, provider: role === "assistant" ? "workers_ai" : null, model: null, createdAt: Number(messageId.slice(-4)) });
const text = (value: string, spans: { start: number; end: number }[] = []): TutorPart => ({ type: "text", text: value, spans });

let conversations: TutorConversation[];
let archivedConversations: TutorConversation[];
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

const posts = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST").map(([input, init]) => ({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) as unknown : null }));

beforeEach(() => {
  resetOnDemandSpeech();
  conversations = [conversation(c1, "What next?")];
  archivedConversations = [];
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
    if (path.startsWith("/api/ai/conversations?archived=")) return json({ items: path.includes("archived=true") ? archivedConversations : conversations, nextCursor: null });
    if (path === "/api/ai/conversations" && method === "POST") { const created = conversation(c2, ""); conversations = [created, ...conversations]; messages[c2] = []; return json({ conversation: created }, 201); }
    const match = /^\/api\/ai\/conversations\/([^/]+)(\/.*)?$/.exec(path);
    if (match) {
      const [, conversationId, rest = ""] = match;
      const all = [...conversations, ...archivedConversations];
      const found = all.find((entry) => entry.id === conversationId);
      if (!found) return json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Missing." } }, 404);
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
const sendText = (value: string) => { fireEvent.change(composer(), { target: { value } }); fireEvent.click(screen.getByRole("button", { name: "Send" })); };

describe("Tutor page", () => {
  it("lists conversations, shows the privacy notice, and renders a stored conversation", async () => {
    messages[c1]!.push(message(id(2), "assistant", [text("## Grammar\nUse **de** here.")]));
    renderPage();
    expect(await screen.findByRole("link", { name: /What next\?/ })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("What next?", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/processed by external AI providers/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grammar" })).toBeInTheDocument();
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
        { type: "tool_call", part: { type: "tool_call", toolCallId: id(20), name: "get_lesson", arguments: { lessonId: "next" } } }], true);
      return stream.response;
    };
    renderPage();
    await screen.findByText("What next?", { selector: "p" });
    sendText("Teach me");
    expect(await screen.findByText("Teach me", { selector: "p" })).toBeInTheDocument();
    expect(await screen.findByText("Looking up a lesson…")).toBeInTheDocument();
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

  it("shows tool chips as running, done, and failed", async () => {
    messages[c1]!.push(message(id(2), "assistant", [
      { type: "tool_call", toolCallId: id(21), name: "get_weak_words", arguments: {} },
      { type: "tool_result", toolCallId: id(21), name: "get_weak_words", ok: true, error: null, detail: { count: 3 } },
      { type: "tool_call", toolCallId: id(22), name: "search_words", arguments: {} },
      { type: "tool_result", toolCallId: id(22), name: "search_words", ok: false, error: "INVALID_ARGUMENTS", detail: {} },
    ]));
    renderPage();
    const done = (await screen.findByText("Checked your weak words")).closest("[data-status]");
    expect(done).toHaveAttribute("data-status", "done");
    const failed = screen.getByText(/Searched words for/).closest("[data-status]");
    expect(failed).toHaveAttribute("data-status", "failed");
    fireEvent.click(within(failed as HTMLElement).getByRole("button"));
    expect(screen.getByText("Error: INVALID_ARGUMENTS")).toBeInTheDocument();
  });

  it("answers a confirmation card, streams the resumed turn, and collapses the card", async () => {
    const card: Extract<TutorPart, { type: "confirmation" }> = { type: "confirmation", toolCallId: id(40), answer: null, outcome: null, answeredAt: null,
      summary: { action: "reset_lesson", course: { id: id(50), title: "Basics" }, lesson: { id: id(51), title: "Lesson 6" }, deletes: { position: true, completion: false, practiceProgress: 2, attempts: 5, reviews: 1 } } };
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

  it("answers a component through the respond route", async () => {
    const component: Extract<TutorPart, { type: "component" }> = { type: "component", toolCallId: id(42), kind: "choice", answer: null, grade: null, answeredAt: null,
      view: { kind: "choice", question: "Huis means?", options: ["house", "tree", "car"] } };
    messages[c1]!.push(message(id(2), "assistant", [component], "awaiting_user"));
    const graded = { ...component, answer: { kind: "choice" as const, choice: 0 }, answeredAt: 9,
      grade: { correct: true, matched: true, verdict: null, note: null, reference: "house", items: [], score: null } };
    turn = () => sse([{ type: "answered", messageId: id(2), part: graded }, { type: "start", messageId: id(3) }, { type: "done", message: message(id(3), "assistant", [text("Right!")]) }]).response;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /house/ }));
    expect(await screen.findByText("Matches!")).toBeInTheDocument();
    expect(posts().find((entry) => entry.path.endsWith("/respond"))?.body).toEqual({ type: "component", answer: { kind: "choice", choice: 0 } });
  });

  it("skips a waiting component, which collapses to a muted line and frees the composer", async () => {
    const component: Extract<TutorPart, { type: "component" }> = { type: "component", toolCallId: id(43), kind: "choice", answer: null, grade: null, answeredAt: null,
      view: { kind: "choice", question: "Huis means?", options: ["house", "tree"] } };
    messages[c1]!.push(message(id(2), "assistant", [component], "awaiting_user"));
    turn = () => sse([{ type: "answered", messageId: id(2), part: { ...component, answeredAt: 9, skipped: true } }, { type: "start", messageId: id(3) },
      { type: "done", message: message(id(3), "assistant", [text("Let's move on.")]) }]).response;
    renderPage();
    expect(await screen.findByText("Huis means?")).toBeInTheDocument();
    expect(composer()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Skip this question" }));
    expect(await screen.findByText("Let's move on.")).toBeInTheDocument();
    expect(screen.getByText("Skipped · Multiple choice")).toBeInTheDocument();
    expect(screen.queryByText("Huis means?")).toBeNull();
    expect(posts().find((entry) => entry.path.endsWith("/respond"))?.body).toEqual({ type: "component", skip: true });
    expect(composer()).toBeEnabled();
  });

  it("disables the composer at the daily limit and says when it resets", async () => {
    turn = () => json({ error: { code: "AI_DAILY_LIMIT", message: "Limit.", resetsAt: Date.UTC(2026, 9, 17) } }, 429);
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

  it("archives and unarchives a conversation; an archived one cannot be continued", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Archive What next?" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: /What next\?/ })).toBeNull());
    expect(await screen.findByText("This conversation is archived. Unarchive it to continue.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unarchive What next?" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Unarchive What next?" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(await screen.findByRole("link", { name: /What next\?/ })).toBeInTheDocument();
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
  it("links the courses call to action to /ai", async () => {
    renderWithRouter(() => <TutorCta />);
    expect(await screen.findByRole("link", { name: /Ask your tutor/ })).toHaveAttribute("href", "/ai");
  });

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
