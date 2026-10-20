import { MantineProvider } from "@mantine/core";
import { flattenToSteps, LESSON_DOCUMENT_SCHEMA_VERSION, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { useState } from "react";
import { SpeechScope } from "../../molecules/Speech";
import { LessonWords, useWordsCollapsed } from "./LessonWords";

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
    <LessonWords steps={steps} active={new Set([id(2)])} groupId={withLibrary ? groupId : undefined} collapsed={false} onToggle={() => undefined} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/courses/dutch/lessons/one"] }) });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
// The lesson page's own wiring: the collapsed state lives with the page and is remembered on the device.
function CollapsiblePanel() {
  const [collapsed, toggle] = useWordsCollapsed();
  const [active] = useState(() => new Set([id(2), id(3)]));
  return <LessonWords steps={steps} active={active} collapsed={collapsed} onToggle={toggle} />;
}
const shownTerms = (panel: HTMLElement) => within(panel).queryAllByRole("listitem").map((item) => item.querySelector("p")?.textContent);

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
    expect(within(panel).queryByRole("button", { name: "Search the library" })).not.toBeInTheDocument();
  });

  it("collapses the rail panel to a slim column with Show new words and the compact footer", () => {
    const toggle = vi.fn();
    const footer = (compact: boolean) => <p>{compact ? "Compact actions" : "Footer actions"}</p>;
    const panel = (collapsed: boolean) => <MantineProvider><LessonWords steps={steps} active={new Set([id(2)])} placement="rail" collapsed={collapsed} onToggle={toggle} footer={footer} /></MantineProvider>;
    const { rerender } = render(panel(false));
    expect(screen.getByText("Footer actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New words/ })).toHaveAttribute("aria-expanded", "true");
    rerender(panel(true));
    const aside = screen.getByRole("complementary", { name: "New words" });
    expect(aside).toHaveAttribute("data-rail-slim");
    expect(within(aside).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(aside).getByLabelText("1 highlighted")).toHaveTextContent("1");
    expect(within(aside).getByText("Compact actions")).toBeInTheDocument();
    fireEvent.click(within(aside).getByRole("button", { name: "Show new words" }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("keeps the rail panel open where it cannot collapse, and gives the sheet no title or collapse of its own", () => {
    const { unmount } = render(<MantineProvider><LessonWords steps={steps} active={new Set()} placement="rail" collapsible={false} collapsed onToggle={() => undefined} /></MantineProvider>);
    let aside = screen.getByRole("complementary", { name: "New words" });
    expect(aside).not.toHaveAttribute("data-rail-slim");
    expect(within(aside).queryByRole("button", { name: /New words/ })).not.toBeInTheDocument();
    expect(within(aside).getByRole("searchbox")).toBeInTheDocument();
    unmount();
    render(<MantineProvider><LessonWords steps={steps} active={new Set()} placement="sheet" collapsed onToggle={() => undefined} /></MantineProvider>);
    aside = screen.getByRole("complementary", { name: "New words" });
    expect(within(aside).queryByText("New words")).not.toBeInTheDocument();
    expect(within(aside).getByRole("searchbox")).toBeInTheDocument();
    expect(within(aside).getAllByRole("listitem")).toHaveLength(3);
  });

  it("searches the library after typing pauses and links each match to the lesson that introduced it", async () => {
    fetchMock.mockImplementation(async (path: string) => path.endsWith("/word-bookmarks/keys") ? json({ keys: [] }) : path.includes("cursor=")
      ? json({ items: [result(3, "der Hundekuchen")], nextCursor: null })
      : json({ items: [result(1, "der Hund"), result(2, "hundert")], nextCursor: "next-page" }));
    renderPanel();
    const panel = await screen.findByRole("complementary", { name: "New words" });
    const toggle = within(panel).getByRole("button", { name: "Search the library" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByText("Type a word or a meaning to search every published lesson.")).toBeInTheDocument();
    const box = within(panel).getByRole("searchbox", { name: "Search words in the library" });
    fireEvent.change(box, { target: { value: "h" } });
    fireEvent.change(box, { target: { value: "hu" } });
    fireEvent.change(box, { target: { value: "hund" } });
    const results = await within(panel).findByRole("list", { name: "Library matches" });
    // Typing quickly sends one search request, for the last query (the bookmark toggles read the bookmark keys beside it).
    const searches = () => fetchMock.mock.calls.map(([path]) => String(path)).filter((path) => path.includes("/word-search"));
    expect(searches()).toEqual([`/api/groups/${groupId}/word-search?q=hund`]);
    expect(within(results).getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent)).toEqual(["der Hund", "hundert"]);
    // The lesson that introduced a match shows only once the match is opened; the bookmark sits in the row's button stack.
    expect(within(results).queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(within(results).getByRole("button", { name: "Show more about der Hund" }));
    expect(within(results).getByRole("link", { name: "Learnt in Animals (German basics)" })).toHaveAttribute("href", "/courses/german-basics/lessons/animals");
    // A match can be bookmarked in the lesson that introduced it.
    expect(await within(results).findByRole("button", { name: "Bookmark der Hund" })).toHaveAttribute("aria-pressed", "false");
    // The lesson's own words are not shown while searching the library.
    expect(within(panel).queryByText("de kat")).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Show more matches" }));
    await waitFor(() => expect(within(results).getAllByRole("listitem")).toHaveLength(3));
    expect(fetchMock.mock.calls.map(([path]) => path)).toContain(`/api/groups/${groupId}/word-search?q=hund&cursor=next-page`);
    expect(within(panel).queryByRole("button", { name: "Show more matches" })).not.toBeInTheDocument();

    // Back to the lesson, the same query filters its own words.
    fireEvent.click(within(panel).getByRole("button", { name: "Search the library" }));
    expect(within(panel).getByRole("status")).toHaveTextContent("No word in this lesson matches your search.");
  });

  it("says when the library has no match or cannot be searched", async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(json({ error: { code: "INTERNAL", message: "Down" } }, 500));
    renderPanel();
    const panel = await screen.findByRole("complementary", { name: "New words" });
    fireEvent.click(within(panel).getByRole("button", { name: "Search the library" }));
    const box = within(panel).getByRole("searchbox", { name: "Search words in the library" });
    fireEvent.change(box, { target: { value: "zebra" } });
    expect(await within(panel).findByText("No word in the library matches your search.")).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "giraffe" } });
    expect(await within(panel).findByRole("alert")).toHaveTextContent("The library could not be searched. Try again.");
  });
});

describe("New words panel rows", () => {
  it("shows the term, meaning, and pronunciation, and opens the forms, example, and note with the chevron", async () => {
    const withDetails = flattenToSteps({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [{ ...vocabulary, props: { data: JSON.stringify({ words: [
      { id: id(2), term: "de hond", meaning: "the dog", forms: "honden", example: "De hond slaapt.", note: "A common pet." },
    ] }) } }] });
    render(<MantineProvider><LessonWords steps={withDetails} active={new Set()} collapsed={false} onToggle={() => undefined} /></MantineProvider>);
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("de hond");
    expect(row).toHaveTextContent("the dog");
    expect(row).not.toHaveTextContent("honden");
    expect(row).not.toHaveTextContent("De hond slaapt.");
    const chevron = within(row).getByRole("button", { name: "Show more about de hond" });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    expect(chevron).toHaveAccessibleName("Show less about de hond");
    expect(row).toHaveTextContent("honden");
    expect(row).toHaveTextContent("De hond slaapt.");
    expect(row).toHaveTextContent("A common pet.");
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(chevron);
    expect(row).not.toHaveTextContent("honden");
  });

  it("stacks Speak only for words with a clip, then Expand, at the row's end", () => {
    const steps = flattenToSteps({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [{ ...vocabulary, props: { data: JSON.stringify({ words: [
      { id: id(1), term: "de hond", meaning: "the dog" }, { id: id(2), term: "de kat", meaning: "the cat" },
    ] }) } }] });
    const resolve = (key: string) => key === `word:${id(1)}` ? "https://media.test/hond.mp3" : null;
    render(<MantineProvider><SpeechScope resolve={resolve}><LessonWords steps={steps} active={new Set()} collapsed={false} onToggle={() => undefined} /></SpeechScope></MantineProvider>);
    const [hond, kat] = screen.getAllByRole("listitem");
    expect(within(hond!).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Play pronunciation of de hond", "Show more about de hond"]);
    expect(within(kat!).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Show more about de kat"]);
  });
});

describe("New words panel collapse", () => {
  afterEach(() => localStorage.clear());

  it("collapses to its title, counts the highlighted words there, and stays collapsed on this device", async () => {
    const view = render(<MantineProvider><CollapsiblePanel /></MantineProvider>);
    const panel = screen.getByRole("complementary", { name: "New words" });
    const toggle = within(panel).getByRole("button", { name: "New words" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByRole("searchbox")).toBeInTheDocument();
    expect(within(panel).queryByText("2 highlighted")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(panel).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("list")).not.toBeInTheDocument();
    expect(toggle).toHaveTextContent("2 highlighted");

    // Opening the lesson again keeps the panel collapsed.
    view.unmount();
    render(<MantineProvider><CollapsiblePanel /></MantineProvider>);
    const again = within(screen.getByRole("complementary", { name: "New words" })).getByRole("button", { name: /^New words/ });
    expect(again).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(again);
    expect(again).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem("wordinator:ui:v1:lesson-words-collapsed")).toBeNull();
  });

  it("stays open when the device's storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<MantineProvider><CollapsiblePanel /></MantineProvider>);
    expect(screen.getByRole("button", { name: "New words" })).toHaveAttribute("aria-expanded", "true");
    vi.restoreAllMocks();
  });
});
