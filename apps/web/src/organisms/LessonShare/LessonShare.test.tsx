import { MantineProvider } from "@mantine/core";
import { lessonShareKey, type Post } from "@wordinator/contracts";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseDetailResponse, type CourseLesson, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LessonView } from "../CourseLessons/CourseLessons";
import { LessonPlayer } from "../CourseLessons/LessonPlayer";

const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const exampleId = "50000000-0000-4000-8000-000000000001";
const dialogueId = "50000000-0000-4000-8000-000000000002";
const practiceId = "50000000-0000-4000-8000-000000000003";
const postId = "60000000-0000-4000-8000-000000000001";
const editor = { id: accountId, displayName: "Ada" };

const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const example: LessonTopBlock = { id: exampleId, type: "example", props: { translation: "There is a balcony.", note: "Er is = there is." }, content: text("Er is een balkon."), children: [] };
const dialogue: LessonTopBlock = {
  id: dialogueId, type: "dialogue", props: { turns: JSON.stringify([{ speaker: "A", text: "Is er een tuin?" }, { speaker: "B", text: "Nee." }]) }, children: [],
};
const practice = (passage: boolean): LessonTopBlock => ({
  id: practiceId, type: "practice", children: [],
  props: { data: JSON.stringify({
    instruction: "Translate.", passage: passage ? { title: "Het huis", content: "Het huis is groot." } : null,
    items: [{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] }, { prompt: "No.", authorsVersion: [] }],
  }) },
});
const summary = (published: boolean) => ({
  id: lessonId, slug: "mijn-huis", position: 0, title: "Mijn huis", goal: null, published, publishedAt: published ? 1 : null, changed: false, updatedBy: editor, updatedAt: 1,
  wordCount: 0, practiceCount: 1, imageUrl: null,
});
const lesson = ({ published = true, preview = false, myShares = {}, passage = false }: { published?: boolean; preview?: boolean; myShares?: Record<string, string>; passage?: boolean } = {}): CourseLesson => {
  const document: LessonDocument = { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [example, dialogue, practice(passage)] };
  return {
    ...summary(published), document: preview ? null : document, practiceProgress: {}, draft: preview ? { document, version: 1 } : null,
    speech: { [`turn:${dialogueId}:0`]: "https://media.test/speech/a.mp3" }, draftSpeech: preview ? {} : null, myShares,
  };
};
const detail = (value: CourseLesson, { archived = false, owner = false } = {}): CourseDetailResponse => ({
  course: {
    id: courseId, slug: "dutch", groupId, title: "Dutch Foundations", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: archived ? "archived" : "published",
    owner: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: null,
    permissions: { edit: owner, publish: owner, archive: owner, removeContent: owner, contribute: owner, requestContribution: !owner, leaveContribution: false, manageContributors: owner },
  },
  outline: [summary(value.published)],
  lessons: [value],
});
const session = { status: "signedIn", user: { id: accountId, displayName: "Ada", username: "ada", avatarUrl: null, mustChangePassword: false, onboardingComplete: true }, groups: [], requests: [], deletedGroups: [] };
const sharedPost: Post = {
  id: postId, groupId, type: "lesson_share", body: "", notes: null, course: null,
  lessonShare: {
    kind: "example", example: { content: text("Er is een balkon."), translation: null, note: null }, speechUrl: null,
    source: { courseId, lessonId, blockId: exampleId, linked: true, courseTitle: "Dutch Foundations", lessonTitle: "Mijn huis", lessonNumber: 1, courseSlug: "dutch", lessonSlug: "mijn-huis" },
  },
  author: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, edited: false, questions: [], expectedAnswers: [],
  commentCount: 0, reactionCount: 0, reactions: [], permissions: { edit: true, delete: true },
};

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
let shareResponse: () => Response;
const shareRequests = () => vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/lesson-shares"));
const shareBody = (index = 0) => JSON.parse(String(shareRequests()[index]![1]!.body)) as Record<string, unknown>;

// Renders the lesson page the way the route does: the course read is in the cache before the lesson renders. `player` opens the
// lesson player on the lesson instead; the app no longer renders it, but the component stays.
function renderPage(value: CourseDetailResponse, page: "lesson" | "player" = "lesson") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  queryClient.setQueryData(["course", groupId, courseId], value);
  queryClient.setQueryData(["course-lesson", groupId, courseId, lessonId], { lesson: value.lessons[0] });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => page === "lesson"
    ? <LessonView groupId={groupId} courseId={courseId} accountId={accountId} detail={value} lessonId={lessonId} dataUpdatedAt={Date.now()} />
    : <LessonPlayer scope={{ groupId, courseId, accountId }} lessonId={lessonId} outline={value.outline} positions={[]} onChangeLesson={() => undefined} onClose={() => undefined} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/courses/dutch/lessons/mijn-huis"] }) });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
const block = (name: "Example" | "Dialogue") => screen.findByRole("group", { name: new RegExp(`^${name}\\.`) });

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  shareResponse = () => response({ post: sharedPost }, 201);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === "/api/session") return response(session);
    if (path.endsWith("/lesson-shares")) return shareResponse();
    if (path.endsWith("/progress")) return response({ publishedLessons: 1, completedLessonIds: [], positions: [], practices: {}, participants: [] });
    if (path.endsWith("/words")) return response({ words: [] });
    return response({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Lesson shares", () => {
  it("reveals a block's Share button when the block is clicked, and clears it with Escape or a click elsewhere", async () => {
    renderPage(detail(lesson()));
    const exampleBlock = await block("Example");
    expect(screen.queryByRole("button", { name: "Share this example" })).not.toBeInTheDocument();
    fireEvent.click(within(exampleBlock).getByText("Er is een balkon."));
    expect(within(exampleBlock).getByRole("button", { name: "Share this example" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Share this example" })).not.toBeInTheDocument();
    // Selecting another block moves the selection; pressing outside clears it.
    fireEvent.click(exampleBlock);
    fireEvent.click(within(await block("Dialogue")).getByText("Nee."));
    expect(screen.queryByRole("button", { name: "Share this example" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share this dialogue" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("heading", { name: "Mijn huis", level: 1 }));
    expect(screen.queryByRole("button", { name: "Share this dialogue" })).not.toBeInTheDocument();
  });

  it("does not select a block through its own controls, and selects it with Enter from the keyboard", async () => {
    renderPage(detail(lesson()));
    const dialogueBlock = await block("Dialogue");
    fireEvent.click(within(dialogueBlock).getByRole("button", { name: "Play dialogue" }));
    expect(screen.queryByRole("button", { name: "Share this dialogue" })).not.toBeInTheDocument();
    expect(dialogueBlock).toHaveAttribute("tabindex", "0");
    dialogueBlock.focus();
    fireEvent.keyDown(dialogueBlock, { key: "Enter" });
    expect(within(dialogueBlock).getByRole("button", { name: "Share this dialogue" })).toBeInTheDocument();
  });

  it("offers no share in an editor's draft preview or in an archived course", async () => {
    renderPage(detail(lesson({ published: false, preview: true }), { owner: true }));
    expect(await screen.findByText("Er is een balkon.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /^Example\./ })).not.toBeInTheDocument();
    cleanup();
    renderPage(detail(lesson(), { archived: true }));
    fireEvent.click(await screen.findByText("Er is een balkon."));
    expect(screen.queryByRole("group", { name: /^Example\./ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share this example" })).not.toBeInTheDocument();
  });

  it("previews an example with its note prefilled, shares the edited note, and then shows Already shared", async () => {
    renderPage(detail(lesson()));
    fireEvent.click(await block("Example"));
    fireEvent.click(screen.getByRole("button", { name: "Share this example" }));
    const dialog = await screen.findByRole("dialog", { name: "Share an example" });
    expect(await within(dialog).findByText((_, element) => element?.tagName === "P" && element.textContent === "Ada shared an example from lesson 1 of Dutch Foundations just now.")).toBeInTheDocument();
    expect(within(dialog).getByText("Er is een balkon.")).toBeInTheDocument();
    const note = within(dialog).getByRole("textbox", { name: "Your note" });
    expect(note).toHaveValue("Er is = there is.");
    fireEvent.change(note, { target: { value: "Handy for the house tour." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Share" }));
    const already = await screen.findByRole("link", { name: "Already shared. Open the post" });
    expect(already).toHaveAttribute("href", `/journal/${postId}`);
    expect(shareRequests()).toHaveLength(1);
    expect(shareBody()).toEqual({ courseId, lessonId, blockId: exampleId, note: "Handy for the house tour." });
    expect(screen.queryByRole("dialog", { name: "Share an example" })).not.toBeInTheDocument();
  });

  it("starts a dialogue's note empty and sends no note when it stays empty", async () => {
    renderPage(detail(lesson()));
    fireEvent.click(await block("Dialogue"));
    fireEvent.click(screen.getByRole("button", { name: "Share this dialogue" }));
    const dialog = await screen.findByRole("dialog", { name: "Share a dialogue" });
    expect(within(dialog).getByText("Is er een tuin?")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Your note" })).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Share" }));
    await screen.findByRole("link", { name: "Already shared. Open the post" });
    expect(shareBody()).toEqual({ courseId, lessonId, blockId: dialogueId, note: null });
  });

  it("cancels without sending anything", async () => {
    renderPage(detail(lesson()));
    fireEvent.click(await block("Example"));
    fireEvent.click(screen.getByRole("button", { name: "Share this example" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Share an example" })).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Share an example" })).not.toBeInTheDocument());
    expect(shareRequests()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Share this example" })).toBeInTheDocument();
  });

  it("shows Already shared for pieces the viewer has shared, linking to the post", async () => {
    renderPage(detail(lesson({ myShares: { [exampleId]: postId, [lessonShareKey({ blockId: practiceId, prompt: "There is a garden." })]: postId } })));
    fireEvent.click(await block("Example"));
    expect(screen.getByRole("link", { name: "Already shared. Open the post" })).toHaveAttribute("href", `/journal/${postId}`);
    expect(screen.queryByRole("button", { name: "Share this example" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    const answers = await screen.findByRole("region", { name: "Answer the practice" });
    // Only the first question shows until it is answered; it was shared, so it links to the post, and the second is not there yet.
    expect(within(answers).getAllByRole("link", { name: "Already shared. Open the post" })).toHaveLength(1);
    expect(within(answers).queryByRole("button", { name: "Share question 1" })).not.toBeInTheDocument();
    expect(within(answers).queryByRole("button", { name: "Share question 2" })).not.toBeInTheDocument();
  });

  it("links to the existing post when the piece was already shared elsewhere", async () => {
    shareResponse = () => response({ error: { code: "LESSON_SHARE_EXISTS", message: "Already shared." }, postId }, 409);
    renderPage(detail(lesson()));
    fireEvent.click(await block("Example"));
    fireEvent.click(screen.getByRole("button", { name: "Share this example" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Share an example" })).getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("link", { name: "Already shared. Open the post" })).toHaveAttribute("href", `/journal/${postId}`);
  });

  it("shares one question from the Answer dialog without closing it, never prefilling the note or showing the author's version", async () => {
    renderPage(detail(lesson()));
    fireEvent.click(await screen.findByRole("button", { name: "Answer" }));
    const answers = await screen.findByRole("region", { name: "Answer the practice" });
    fireEvent.click(within(answers).getByRole("button", { name: "Share question 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Share a question" });
    expect(within(dialog).getByText("Translate.")).toBeInTheDocument();
    expect(within(dialog).getByText("There is a garden.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Er is een tuin.")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Your note" })).toHaveValue("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Share" }));
    await within(answers).findByRole("link", { name: "Already shared. Open the post" });
    expect(shareBody()).toEqual({ courseId, lessonId, blockId: practiceId, itemIndex: 0, note: null });
    expect(screen.getByRole("region", { name: "Answer the practice" })).toBeInTheDocument();
  });

  it("disables sharing the questions of a reading practice and says why", async () => {
    renderPage(detail(lesson({ passage: true })));
    fireEvent.click(await screen.findByRole("button", { name: "Answer" }));
    const answers = await screen.findByRole("region", { name: "Answer the practice" });
    // The second question shows once the first one matches, so only the first one's share is there for now.
    const buttons = within(answers).getAllByRole("button", { name: "Share" });
    expect(buttons).toHaveLength(1);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription("Questions of a reading practice can’t be shared.");
    }
  });

  it("offers Share on the player's example, dialogue, and question steps", async () => {
    renderPage(detail(lesson()), "player");
    const player = await screen.findByRole("dialog", { name: "Lesson 1 · Mijn huis" });
    expect(await within(player).findByRole("button", { name: "Share this example" })).toBeInTheDocument();
    fireEvent.click(within(player).getByRole("button", { name: "Next" }));
    expect(within(player).getByRole("button", { name: "Share this dialogue" })).toBeInTheDocument();
    fireEvent.click(within(player).getByRole("button", { name: "Next" }));
    fireEvent.click(within(player).getByRole("button", { name: "Next" }));
    expect(within(player).getByRole("button", { name: "Share question 1" })).toBeInTheDocument();
    fireEvent.click(within(player).getByRole("button", { name: "Share question 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Share a question" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Share" }));
    await within(player).findByRole("link", { name: "Already shared. Open the post" });
    expect(shareBody()).toEqual({ courseId, lessonId, blockId: practiceId, itemIndex: 0, note: null });
  });
});
