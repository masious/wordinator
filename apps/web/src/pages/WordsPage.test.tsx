import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { validateWordDrillSearch } from "./WordDrillPage";
import { validateWordsSearch, WordsPage } from "./WordsPage";

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

function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }
// The page under a route that keeps the lesson filter in the URL, like the app's own `/words` route.
function renderPage(initial = "/words") {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root, path: "words", validateSearch: validateWordsSearch,
    component: function Words() {
      const { lesson } = route.useSearch(); const navigate = route.useNavigate();
      return <WordsPage groupId={groupId} lessonId={lesson ?? null} onLesson={(next, replace = false) => { void navigate({ search: next ? { lesson: next } : {}, replace }); }}
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
    if (path.endsWith("/bookmark") && init?.method === "DELETE") {
      // The server forgets the bookmark, so a refetched list leaves it out.
      const wordId = path.split("/words/")[1]!.split("/")[0];
      keys = keys.filter((key) => key.wordId !== wordId);
      pages[listPath] = { ...pages[listPath]!, items: pages[listPath]!.items.filter((entry) => (entry as ReturnType<typeof item>).word.id !== wordId) };
    }
    return response({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fit.value = { columns: 2, rows: 1 }; });

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
    renderPage();
    await screen.findByText("No bookmarked words yet");
    fireEvent.click(screen.getByRole("button", { name: "Drill" }));
    const dialog = await screen.findByRole("dialog", { name: "Drill words" });
    expect(within(dialog).getByRole("radio", { name: "Weak words" })).toBeDisabled();
    expect(within(dialog).getByRole("radio", { name: "Lesson" })).toBeDisabled();
    expect(dialog).toHaveTextContent("Bookmark words in a lesson first; your weak words come from your bookmarks.");
    expect(within(dialog).getByRole("button", { name: "Start" })).toBeDisabled();
  });
});
