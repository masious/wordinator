import { MantineProvider } from "@mantine/core";
import { flattenToSteps, LESSON_DOCUMENT_SCHEMA_VERSION, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LessonWords } from "./LessonWords";

const groupId = "20000000-0000-4000-8000-000000000001";
const id = (n: number) => `60000000-0000-4000-8000-00000000000${n}`;
const vocabulary: LessonTopBlock = {
  id: "50000000-0000-4000-8000-000000000021", type: "vocabulary", children: [],
  props: { data: JSON.stringify({ words: [
    { id: id(1), term: "Über", meaning: "over" }, { id: id(2), term: "de hond", meaning: "the dog", forms: "honden" }, { id: id(3), term: "de kat", meaning: "the cat" },
  ] }) },
};
const steps = flattenToSteps({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [vocabulary] });
const result = (n: number, term: string) => ({
  word: { id: id(n), lessonId: "40000000-0000-4000-8000-000000000009", term, meaning: `meaning of ${term}`, forms: null, example: null, note: null, speech: { term: null, example: null } },
  course: { id: "30000000-0000-4000-8000-000000000009", slug: "german-basics", title: "German basics" },
  lesson: { id: "40000000-0000-4000-8000-000000000009", slug: "animals", title: "Animals" },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderPanel(withLibrary = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () =>
    <LessonWords steps={steps} active={new Set([id(2)])} panelRef={createRef<HTMLElement>()} groupId={withLibrary ? groupId : undefined} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/courses/dutch/lessons/one"] }) });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
const shownTerms = (panel: HTMLElement) => within(panel).queryAllByRole("listitem").map((item) => item.querySelector("span")?.textContent);

describe("New words search", () => {
  it("filters the lesson's words by term, forms, or meaning, ignoring case and diacritics", async () => {
    renderPanel();
    const panel = await screen.findByRole("complementary", { name: "New words" });
    expect(shownTerms(panel)).toEqual(["Über", "de hond", "de kat"]);
    const box = within(panel).getByRole("searchbox", { name: "Search this lesson's words" });
    fireEvent.change(box, { target: { value: "UBER" } });
    expect(shownTerms(panel)).toEqual(["Über"]);
    fireEvent.change(box, { target: { value: "honden" } });
    expect(shownTerms(panel)).toEqual(["de hond"]);
    // The highlighted word keeps its highlight while filtered.
    expect(within(panel).getByRole("listitem")).toHaveAttribute("aria-current", "true");
    fireEvent.change(box, { target: { value: "cat" } });
    expect(shownTerms(panel)).toEqual(["de kat"]);
    fireEvent.change(box, { target: { value: "giraffe" } });
    expect(shownTerms(panel)).toEqual([]);
    expect(within(panel).getByRole("status")).toHaveTextContent("No word in this lesson matches your search.");
    fireEvent.change(box, { target: { value: "" } });
    expect(shownTerms(panel)).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers no library switch without a library", async () => {
    renderPanel(false);
    const panel = await screen.findByRole("complementary", { name: "New words" });
    expect(within(panel).queryByRole("radio", { name: "Library" })).not.toBeInTheDocument();
  });

  it("searches the library after typing pauses and links each match to the lesson that introduced it", async () => {
    fetchMock.mockImplementation(async (path: string) => path.includes("cursor=")
      ? json({ items: [result(3, "der Hundekuchen")], nextCursor: null })
      : json({ items: [result(1, "der Hund"), result(2, "hundert")], nextCursor: "next-page" }));
    renderPanel();
    const panel = await screen.findByRole("complementary", { name: "New words" });
    fireEvent.click(within(panel).getByRole("radio", { name: "Library" }));
    expect(within(panel).getByText("Type a word or a meaning to search every published lesson.")).toBeInTheDocument();
    const box = within(panel).getByRole("searchbox", { name: "Search words in the library" });
    fireEvent.change(box, { target: { value: "h" } });
    fireEvent.change(box, { target: { value: "hu" } });
    fireEvent.change(box, { target: { value: "hund" } });
    const results = await within(panel).findByRole("list", { name: "Library matches" });
    // Typing quickly sends one request, for the last query.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/groups/${groupId}/word-search?q=hund`);
    expect(within(results).getAllByRole("listitem").map((item) => item.querySelector("span")?.textContent)).toEqual(["der Hund", "hundert"]);
    const source = within(results).getAllByRole("link", { name: "Introduced in Animals (German basics). Open the lesson" })[0]!;
    expect(source).toHaveAttribute("href", "/courses/german-basics/lessons/animals");
    fireEvent.focus(source);
    expect(await screen.findByText("German basics · Animals")).toBeInTheDocument();
    // The lesson's own words are not shown while searching the library.
    expect(within(panel).queryByText("de kat")).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Show more matches" }));
    await waitFor(() => expect(within(results).getAllByRole("listitem")).toHaveLength(3));
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/groups/${groupId}/word-search?q=hund&cursor=next-page`);
    expect(within(panel).queryByRole("button", { name: "Show more matches" })).not.toBeInTheDocument();

    // Back to the lesson, the same query filters its own words.
    fireEvent.click(within(panel).getByRole("radio", { name: "This lesson" }));
    expect(within(panel).getByRole("status")).toHaveTextContent("No word in this lesson matches your search.");
  });

  it("says when the library has no match or cannot be searched", async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(json({ error: { code: "INTERNAL", message: "Down" } }, 500));
    renderPanel();
    const panel = await screen.findByRole("complementary", { name: "New words" });
    fireEvent.click(within(panel).getByRole("radio", { name: "Library" }));
    const box = within(panel).getByRole("searchbox", { name: "Search words in the library" });
    fireEvent.change(box, { target: { value: "zebra" } });
    expect(await within(panel).findByText("No word in the library matches your search.")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "giraffe" } });
    expect(await within(panel).findByRole("alert")).toHaveTextContent("The library could not be searched. Try again.");
  });
});
