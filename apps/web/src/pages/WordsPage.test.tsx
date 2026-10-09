import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { WordsPage } from "./WordsPage";

// jsdom has no layout, so the cards' page size is set here.
const fit = vi.hoisted(() => ({ value: { columns: 2, rows: 1 } }));
vi.mock("../organisms/WordRecap/fitGrid", async (importOriginal) => ({ ...await importOriginal<typeof import("../organisms/WordRecap/fitGrid")>(), measureFit: () => fit.value }));

const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const groupId = id(1); const userId = id(2); const courseId = id(3);
const session = { status: "signedIn", user: { id: userId, displayName: "Ada", avatarUrl: null, mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "nl", role: "member", icon: "🇳🇱", iconUrl: null }], requests: [], deletedGroups: [] };
const item = (n: number, lesson = id(40)) => ({
  word: { id: id(100 + n), lessonId: lesson, term: `woord ${n}`, meaning: `meaning ${n}`, forms: null, example: null, note: null },
  course: { id: courseId, title: "Dutch foundations" }, lesson: { id: lesson, title: `Lesson ${lesson.slice(-2)}` }, bookmarkedAt: 1000 - n,
});
const listPath = `/api/groups/${groupId}/word-bookmarks?limit=100`;
const keysPath = `/api/groups/${groupId}/word-bookmarks/keys`;
let pages: Record<string, { items: unknown[]; nextCursor: string | null }>;
let keys: Array<{ lessonId: string; wordId: string }>;

function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }
function renderPage() {
  const root = createRootRoute(); const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <WordsPage groupId={groupId} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/groups/${groupId}/words`] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  pages = { [listPath]: { items: [item(1), item(2), item(3, id(41))], nextCursor: null } };
  keys = [item(1), item(2), item(3, id(41))].map((entry) => ({ lessonId: entry.lesson.id, wordId: entry.word.id }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return response(session);
    if (path === keysPath) return response({ keys });
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

describe("Words tab", () => {
  it("shows bookmarked words newest first with their course and lesson", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Your words" })).toBeInTheDocument();
    expect(screen.getByText("Words 1–2 of 3")).toBeInTheDocument();
    const first = screen.getByRole("article", { name: "woord 1" });
    expect(first).toHaveTextContent("Dutch foundations · Lesson 40");
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

  it("explains how to bookmark when there is nothing yet", async () => {
    pages = { [listPath]: { items: [], nextCursor: null } };
    renderPage();
    expect(await screen.findByText("No bookmarked words yet")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
