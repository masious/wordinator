import { createTheme, MantineProvider } from "@mantine/core";
import type { Post, PostLessonShare } from "@wordinator/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import PostCard from "../PostCard/PostCard";

const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const blockId = "50000000-0000-4000-8000-000000000001";
const postId = "60000000-0000-4000-8000-000000000001";
const draftKey = `wordinator:draft:v1:${accountId}:${groupId}:share-answer:${postId}`;

const theme = createTheme({ components: { Menu: { defaultProps: { hideDetached: false, transitionProps: { duration: 0 } } } } });
const session = { status: "signedIn", user: { id: accountId, displayName: "Ada", username: "ada", avatarUrl: null, mustChangePassword: false, onboardingComplete: true }, groups: [], requests: [], deletedGroups: [] };
const source = { courseId, lessonId, blockId, linked: true, courseTitle: "Dutch Foundations", lessonTitle: "Mijn huis", lessonNumber: 3, courseSlug: "dutch", lessonSlug: "mijn-huis" };
const unlinked = { ...source, linked: false, lessonNumber: null, courseSlug: null, lessonSlug: null };

const example: PostLessonShare = {
  kind: "example", source, speechUrl: "https://media.test/speech/example.mp3",
  example: { content: [{ type: "text", text: "Er is ", styles: {} }, { type: "text", text: "een balkon", styles: { bold: true } }, { type: "text", text: ".", styles: {} }], translation: "There is a balcony.", note: "Er is = there is." },
};
const dialogue = (available: boolean): PostLessonShare => ({
  kind: "dialogue", source, available, turns: available ? [{ speaker: "A", text: "Is er een tuin?" }, { speaker: "B", text: "Nee." }] : null,
  speech: available ? { [`turn:${blockId}:0`]: "https://media.test/speech/a.mp3" } : {},
});
const question = (authorsVersion: (string | null)[] = ["Er is een tuin."], prompt = "There is a garden."): PostLessonShare => ({
  kind: "question", source, question: { instruction: "Translate.", prompt, authorsVersion, itemIndex: 0 },
});
const post = (lessonShare: PostLessonShare, extra: Partial<Post> = {}): Post => ({
  id: postId, groupId, type: "lesson_share", body: "", notes: null, course: null, lessonShare,
  author: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: Date.now() - 5 * 3_600_000, updatedAt: 1, edited: false, questions: [], expectedAnswers: [],
  commentCount: 0, reactionCount: 0, reactions: [], permissions: { edit: true, delete: true }, ...extra,
});

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
const requests = () => vi.mocked(fetch).mock.calls.map(([path, init]) => ({ path: String(path), method: init?.method ?? "GET", body: init?.body }));

function renderPost(value: Post, compact: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  queryClient.setQueryData(["session"], session);
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <PostCard post={value} groupId={groupId} compact={compact} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return render(<MantineProvider theme={theme}><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith(`/posts/${postId}`) && init?.method === "PATCH") return response({ post: post(example, { notes: "Nieuw" }) });
    // Settings stay unresolved: the reaction bar is not part of these tests.
    return new Promise<Response>(() => {});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Lesson share feed cards", () => {
  it("links the byline to the post and shows an example's formatted sentence and speech outside the link", async () => {
    renderPost(post(example, { notes: "Mijn notitie" }), true);
    const link = await screen.findByRole("link", { name: /Ada shared an example from lesson 3 of Dutch Foundations 5 hours ago/ });
    expect(link).toHaveAttribute("href", `/journal/${postId}`);
    const sentence = screen.getByText("een balkon");
    expect(sentence.tagName).toBe("STRONG");
    expect(link).not.toContainElement(sentence);
    const speaker = screen.getByRole("button", { name: "Play the example sentence" });
    expect(link).not.toContainElement(speaker);
    expect(screen.getByText("There is a balcony.")).toBeInTheDocument();
    expect(screen.getByText("Er is = there is.")).toBeInTheDocument();
    // The sharer's note is concealed on the post page and never shown on the card; the card has no lesson link.
    expect(screen.queryByText("Mijn notitie")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open the lesson/ })).not.toBeInTheDocument();
  });

  it("plays a dialogue's turns with the dialogue controls, or says it is no longer available", async () => {
    renderPost(post(dialogue(true)), true);
    expect(await screen.findByRole("link", { name: /shared a dialogue from lesson 3/ })).toBeInTheDocument();
    expect(screen.getByText("Is er een tuin?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play dialogue" })).toBeInTheDocument();
    cleanup();
    renderPost(post(dialogue(false)), true);
    expect(await screen.findByText("This dialogue is no longer available.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play dialogue" })).not.toBeInTheDocument();
  });

  it("shows a question's instruction and prompt with its blanks, without fields or the author's version", async () => {
    renderPost(post(question(["een", "tuin"], "Er is … … achter het huis.")), true);
    expect(await screen.findByText("Translate.")).toBeInTheDocument();
    expect(screen.getByText("Er is … … achter het huis.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/tuin$/)).not.toBeInTheDocument();
  });

  it("falls back to the saved lesson title when the viewer can no longer open the lesson", async () => {
    renderPost(post({ ...example, source: unlinked }), false);
    expect(await screen.findByText(/shared an example from “Mijn huis” in Dutch Foundations/)).toBeInTheDocument();
    expect(screen.getByText("een balkon")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open the lesson/ })).not.toBeInTheDocument();
  });
});

describe("Lesson share post page", () => {
  it("links to the lesson while it is available and keeps the note concealed until shown", async () => {
    renderPost(post(example, { notes: "Mijn notitie" }), false);
    expect(await screen.findByRole("link", { name: /Open the lesson/ })).toHaveAttribute("href", "/courses/dutch/lessons/mijn-huis");
    expect(screen.queryByText("Mijn notitie")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show notes" }));
    expect(screen.getByText("Mijn notitie")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("checks an answer on this device: a match is confirmed and nothing is sent", async () => {
    renderPost(post(question()), false);
    const field = await screen.findByRole("textbox", { name: "Your answer" });
    fireEvent.change(field, { target: { value: "er is een TUIN" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(await screen.findByText("Matches the author’s version")).toBeInTheDocument();
    expect(screen.queryByText("Author’s version")).not.toBeInTheDocument();
    expect(requests().filter((request) => request.method !== "GET")).toEqual([]);
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual({ version: 1, answers: ["er is een TUIN"] });
  });

  it("shows the author's version as a reference on a miss, and keeps the answer across visits", async () => {
    localStorage.setItem(draftKey, JSON.stringify({ version: 1, answers: ["Er is een huis."] }));
    renderPost(post(question()), false);
    expect(await screen.findByRole("textbox", { name: "Your answer" })).toHaveValue("Er is een huis.");
    expect(screen.queryByText("Er is een tuin.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Author’s version")).toBeInTheDocument();
    expect(screen.getByText("Er is een tuin.")).toBeInTheDocument();
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
  });

  it("checks fill-in questions blank by blank", async () => {
    renderPost(post(question(["een", "tuin"], "Er is … … achter het huis.")), false);
    const first = await screen.findByRole("textbox", { name: "Blank 1" });
    fireEvent.change(first, { target: { value: "een" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Blank 2" }), { target: { value: "tuin" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Blank 2" }), { key: "Enter" });
    expect(await screen.findByText("Matches the author’s version")).toBeInTheDocument();
  });

  it("offers no check for a question without an author's version", async () => {
    renderPost(post(question([])), false);
    expect(await screen.findByText("This question has no author’s version to check against.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("edits only the note", async () => {
    renderPost(post(example, { notes: "Oud" }), false);
    fireEvent.click(await screen.findByRole("button", { name: "More Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });
    expect(within(dialog).queryByRole("textbox", { name: "Post type" })).not.toBeInTheDocument();
    const note = within(dialog).getByRole("textbox", { name: /Your note/ });
    expect(note).toHaveValue("Oud");
    fireEvent.change(note, { target: { value: "Nieuw" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(requests().find((request) => request.method === "PATCH")).toBeDefined());
    const patch = requests().find((request) => request.method === "PATCH")!;
    expect(patch.path).toBe(`/api/groups/${groupId}/posts/${postId}`);
    expect(JSON.parse(String(patch.body))).toEqual({ type: "lesson_share", notes: "Nieuw" });
  });
});
