import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseDetailResponse, type CourseLesson, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import type { LessonAiPractice } from "@wordinator/contracts/tutor";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { stopSpeech } from "../../molecules/Speech";
import { resetOnDemandSpeech } from "../TutorComponents";
import { LessonView } from "./CourseLessons";

// AI practices on the lesson page (docs/courses.md#lesson-pages, C14h).
const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const block = (n: number) => `50000000-0000-4000-8000-00000000000${n}`;
const practiceId = (n: number) => `60000000-0000-4000-8000-00000000000${n}`;
const base = `/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId}/ai-practices`;
const editor = { id: accountId, displayName: "Ada" };
const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const paragraph = (id: string, value: string): LessonTopBlock => ({ id, type: "paragraph", props: { textColor: "default", backgroundColor: "default" }, content: text(value), children: [] });
const blocks: LessonTopBlock[] = [
  paragraph(block(1), "Eerste alinea."),
  { id: block(2), type: "example", props: { translation: "", note: "" }, content: text("Ik woon hier."), children: [] },
  paragraph(block(3), "Laatste alinea."),
];
const course = {
  id: courseId, slug: "dutch-foundations", groupId, title: "Dutch Foundations", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: "published" as const,
  owner: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: null,
  permissions: { edit: false, publish: false, archive: false, removeContent: false, contribute: false, requestContribution: false, leaveContribution: false, manageContributors: false },
};
const summary = (published: boolean) => ({
  id: lessonId, slug: "lesson-one", position: 0, title: "Lesson one", goal: null, published, publishedAt: published ? 1 : null, changed: false, updatedBy: editor, updatedAt: 1,
  wordCount: 0, practiceCount: 0, imageUrl: null,
});
const lesson = (aiPracticeCount: number, { published = true } = {}): CourseLesson => ({
  ...summary(published), document: published ? { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks } : null, practiceProgress: {},
  draft: published ? null : { document: { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks }, version: 1 }, speech: {}, draftSpeech: published ? null : {}, myShares: {},
  aiPracticeCount,
});
const practices: LessonAiPractice[] = [
  { id: practiceId(1), kind: "choice", afterBlockId: block(1), view: { kind: "choice", question: "What does huis mean?", options: ["house", "tree"] }, createdAt: 1 },
  { id: practiceId(2), kind: "dictation", afterBlockId: block(2), view: { kind: "dictation", translation: null }, createdAt: 2 },
  { id: practiceId(3), kind: "fill_in", afterBlockId: null, view: { kind: "fill_in", prompt: "Ik … hier.", blanks: 1, translation: null }, createdAt: 3 },
];

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
let canRemove = false;
let listed: LessonAiPractice[] = [];
const calls = () => vi.mocked(fetch).mock.calls.map(([input, init]) => ({ path: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) as unknown : null }));
const practiceCalls = () => calls().filter((entry) => entry.path.startsWith(base));

function renderLesson(current: CourseLesson) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  const detail: CourseDetailResponse = { course, outline: [summary(current.published)], lessons: [current] };
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () =>
    <LessonView groupId={groupId} courseId={courseId} accountId={accountId} detail={detail} lessonId={lessonId} dataUpdatedAt={Date.now()} language="nl" /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/courses/dutch-foundations/lessons/lesson-one"] }) });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
// Whether `first` comes before `second` in the page.
const before = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
const cards = () => screen.queryAllByRole("region", { name: "AI practice" });

beforeEach(() => {
  canRemove = false; listed = practices; resetOnDemandSpeech();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("playing")); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? "GET";
    if (path === base && method === "GET") return response({ practices: listed, canRemove });
    if (path.endsWith("/answer")) return response({ grade: { correct: true, matched: true, verdict: null, note: null, reference: "house", items: [], score: null }, recorded: true });
    if (path.endsWith("/speech")) return response({ url: "https://media.test/dictation.mp3" });
    if (path.startsWith(base) && method === "DELETE") { listed = listed.filter((entry) => !path.endsWith(entry.id)); return response({ ok: true }); }
    if (path.endsWith("/progress")) return response({ publishedLessons: 1, completedLessonIds: [], positions: [], practices: {}, participants: [] });
    return response({ ok: true });
  }));
});
afterEach(() => { act(() => stopSpeech()); cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("AI practices on the lesson page", () => {
  it("shows the count, reads nothing until expanded, places each practice after its anchor and the rest at the end, and hides them", async () => {
    renderLesson(lesson(3));
    const show = await screen.findByRole("button", { name: "Show AI practices (3)" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(practiceCalls()).toEqual([]);
    expect(cards()).toHaveLength(0);
    fireEvent.click(show);
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(practiceCalls()).toEqual([{ path: base, method: "GET", body: null }]);
    const [choice, dictation, fillIn] = cards() as [HTMLElement, HTMLElement, HTMLElement];
    const first = screen.getByText("Eerste alinea."); const example = screen.getByText("Ik woon hier."); const last = screen.getByText("Laatste alinea.");
    expect(within(choice).getByText("What does huis mean?")).toBeInTheDocument();
    expect(before(first, choice) && before(choice, example)).toBe(true);
    expect(within(dictation).getByText("Dictation")).toBeInTheDocument();
    expect(before(example, dictation) && before(dictation, last)).toBe(true);
    // A practice without an anchor comes after the whole lesson.
    expect(within(fillIn).getByText("Fill in the blank")).toBeInTheDocument();
    expect(before(last, fillIn)).toBe(true);
    // Readers are not offered removal; the practices are not attributed.
    expect(screen.queryByRole("button", { name: "Remove from this lesson" })).toBeNull();
    expect(within(choice).queryByText("Ada")).toBeNull();

    const hide = screen.getByRole("button", { name: "Hide AI practices" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(hide);
    expect(cards()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Show AI practices (3)" })).toBeInTheDocument();
  });

  it("posts an answer once and shows the returned grade", async () => {
    renderLesson(lesson(3));
    fireEvent.click(await screen.findByRole("button", { name: "Show AI practices (3)" }));
    const [choice] = await screen.findAllByRole("region", { name: "AI practice" }) as [HTMLElement];
    fireEvent.click(within(choice).getByRole("button", { name: /house/ }));
    expect(await within(choice).findByText("Matches!")).toBeInTheDocument();
    fireEvent.click(within(choice).getByRole("button", { name: /tree/ }));
    const answers = practiceCalls().filter((entry) => entry.path.endsWith("/answer"));
    expect(answers).toEqual([{ path: `${base}/${practiceId(1)}/answer`, method: "POST", body: { answer: { kind: "choice", choice: 0 } } }]);
  });

  it("plays a dictation through the practice's speech route", async () => {
    renderLesson(lesson(3));
    fireEvent.click(await screen.findByRole("button", { name: "Show AI practices (3)" }));
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.click(within(cards()[1]!).getByRole("button", { name: "Play the sentence" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(practiceCalls().filter((entry) => entry.path.endsWith("/speech"))).toEqual([{ path: `${base}/${practiceId(2)}/speech`, method: "POST", body: null }]);
  });

  it("lets owners and contributors remove a practice after confirming, and updates the count", async () => {
    canRemove = true;
    renderLesson(lesson(3));
    fireEvent.click(await screen.findByRole("button", { name: "Show AI practices (3)" }));
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.click(within(cards()[0]!).getByRole("button", { name: "Remove from this lesson" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove this AI practice from the lesson?" });
    // Nothing is removed before the confirmation.
    expect(practiceCalls().some((entry) => entry.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from this lesson" }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.queryByText("What does huis mean?")).toBeNull();
    expect(practiceCalls().filter((entry) => entry.method === "DELETE")).toEqual([{ path: `${base}/${practiceId(1)}`, method: "DELETE", body: null }]);
    fireEvent.click(screen.getByRole("button", { name: "Hide AI practices" }));
    expect(screen.getByRole("button", { name: "Show AI practices (2)" })).toBeInTheDocument();
  });

  it("offers nothing for a lesson without AI practices or for a draft preview", async () => {
    const { unmount } = renderLesson(lesson(0));
    expect(await screen.findByText("Eerste alinea.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AI practices/ })).toBeNull();
    unmount();
    renderLesson(lesson(2, { published: false }));
    expect(await screen.findByText("Draft preview: readers cannot see this lesson until it is published.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AI practices/ })).toBeNull();
    expect(practiceCalls()).toEqual([]);
  });
});
