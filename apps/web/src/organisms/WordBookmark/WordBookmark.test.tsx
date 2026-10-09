import { MantineProvider } from "@mantine/core";
import { flattenToSteps, LESSON_DOCUMENT_SCHEMA_VERSION, lessonDocumentSchema, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LessonWords } from "../CourseLessons/LessonWords";
import { NewWords } from "../LessonDocument/LessonDocument";
import { WordRecap } from "../WordRecap/WordRecap";
import { useLessonBookmarkTarget, WordBookmarkScope, WordBookmarkToggle } from "./WordBookmark";

const id = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const groupId = id(1); const courseId = id(2); const lessonId = id(3);
const hund = { id: id(10), term: "der Hund", meaning: "the dog" };
const katze = { id: id(11), term: "die Katze", meaning: "the cat" };
const published: LessonDocument = lessonDocumentSchema.parse({
  schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION,
  blocks: [{ id: id(20), type: "example", props: { translation: "", note: "" }, content: [{ type: "text", text: "Der Hund bellt.", styles: {} }], children: [] },
    { id: id(21), type: "vocabulary", props: { data: JSON.stringify({ words: [hund, katze] }) }, children: [] }],
});
const keysPath = `/api/groups/${groupId}/word-bookmarks/keys`;
const bookmarkPath = (wordId: string) => `/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId}/words/${wordId}/bookmark`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function LessonScope({ document, children }: { document: LessonDocument | null; children: ReactNode }) {
  const resolve = useLessonBookmarkTarget(groupId, courseId, lessonId, document);
  return <WordBookmarkScope resolve={resolve}>{children}</WordBookmarkScope>;
}
function renderWith(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={client}>{node}</QueryClientProvider></MantineProvider>);
}
let respond: (path: string, init?: RequestInit) => Response;

beforeEach(() => {
  respond = (path) => path === keysPath ? json({ keys: [{ lessonId, wordId: hund.id }] }) : json({ ok: true });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => respond(String(input), init)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Word bookmarks", () => {
  it("shows each word's state and toggles it optimistically", async () => {
    renderWith(<LessonScope document={published}><NewWords words={[hund, katze]} /></LessonScope>);
    const dog = screen.getByRole("button", { name: "Bookmark der Hund" }); const cat = screen.getByRole("button", { name: "Bookmark die Katze" });
    await waitFor(() => expect(dog).toHaveAttribute("aria-pressed", "true"));
    expect(cat).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(cat);
    await waitFor(() => expect(cat).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(bookmarkPath(katze.id), expect.objectContaining({ method: "PUT" })));
    fireEvent.click(dog);
    await waitFor(() => expect(dog).toHaveAttribute("aria-pressed", "false"));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(bookmarkPath(hund.id), expect.objectContaining({ method: "DELETE" })));
  });

  it("puts the state back and says why when saving fails", async () => {
    renderWith(<LessonScope document={published}><NewWords words={[katze]} /></LessonScope>);
    const cat = screen.getByRole("button", { name: "Bookmark die Katze" });
    await waitFor(() => expect(cat).toBeEnabled());
    respond = (path) => path === keysPath ? json({ keys: [] }) : json({ error: { code: "WORD_BOOKMARKS_FULL", message: "You can keep up to 2000 bookmarked words in a group." } }, 409);
    fireEvent.click(cat);
    expect(await screen.findByRole("alert")).toHaveTextContent("You can keep up to 2000 bookmarked words in a group.");
    expect(cat).toHaveAttribute("aria-pressed", "false");
    respond = (path) => path === keysPath ? json({ keys: [] }) : json({ error: { code: "INTERNAL", message: "boom" } }, 500);
    fireEvent.click(cat);
    expect(await screen.findByRole("alert")).toHaveTextContent("The bookmark could not be saved. Try again.");
    expect(cat).toHaveAttribute("aria-pressed", "false");
  });

  it("offers no toggle for a draft preview, an unpublished word, or outside a scope", () => {
    const { unmount } = renderWith(<LessonScope document={null}><NewWords words={[hund]} /></LessonScope>);
    expect(screen.queryByRole("button", { name: /^Bookmark/ })).not.toBeInTheDocument();
    unmount();
    const draftOnly = { id: id(12), term: "das Haus", meaning: "the house" };
    renderWith(<LessonScope document={published}><NewWords words={[draftOnly]} /><WordBookmarkToggle wordId={hund.id} term="der Hund" /></LessonScope>);
    expect(screen.queryByRole("button", { name: "Bookmark das Haus" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bookmark der Hund" })).toBeInTheDocument();
    cleanup();
    renderWith(<NewWords words={[hund]} />);
    expect(screen.queryByRole("button", { name: /^Bookmark/ })).not.toBeInTheDocument();
  });

  it("toggles on recap cards and in the lesson page panel without changing the highlight", async () => {
    const steps = flattenToSteps(published);
    renderWith(<LessonScope document={published}>
      <LessonWords steps={steps} active={new Set([hund.id])} panelRef={{ current: null }} />
      <WordRecap words={[{ ...katze, forms: null, example: null, note: null }]} />
    </LessonScope>);
    const panel = screen.getByRole("complementary", { name: "New words" });
    const current = within(panel).getAllByRole("listitem").find((item) => item.getAttribute("aria-current"));
    expect(current).toHaveTextContent("der Hund");
    const dog = within(panel).getByRole("button", { name: "Bookmark der Hund" });
    await waitFor(() => expect(dog).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(dog);
    await waitFor(() => expect(dog).toHaveAttribute("aria-pressed", "false"));
    expect(within(panel).getAllByRole("listitem").find((item) => item.getAttribute("aria-current"))).toBe(current);

    const card = screen.getByRole("article", { name: "die Katze" });
    fireEvent.click(within(card).getByRole("button", { name: "Bookmark die Katze" }));
    // The panel's toggle for the same word follows the card's.
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Bookmark die Katze" })).toHaveAttribute("aria-pressed", "true"));
  });
});
