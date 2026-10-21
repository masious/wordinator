import { MantineProvider } from "@mantine/core";
import type { LessonProgressResponse } from "@wordinator/contracts";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseDetailResponse, type CourseLesson, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LessonView } from "./CourseLessons";
import { CourseProgressTab, CourseTabs, validateCourseSearch } from "./CourseProgress";
import { practiceDraftKey } from "./PracticeBlock";

// The course page's Progress tab and the two reset entry points (C14c, docs/courses.md#lesson-progress-tab, #reset).
const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = (n: number) => `40000000-0000-4000-8000-00000000000${n}`;
const practiceId = "50000000-0000-4000-8000-000000000003";
const otherPracticeId = "50000000-0000-4000-8000-000000000009";
const editor = { id: accountId, displayName: "Ada" };
const course = (status: "published" | "archived" = "published") => ({
  id: courseId, slug: "dutch-foundations", groupId, title: "Dutch Foundations", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status,
  owner: { id: "10000000-0000-4000-8000-000000000009", displayName: "Bea", avatarUrl: null }, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: null,
  permissions: { edit: false, publish: false, archive: false, removeContent: false, contribute: false, requestContribution: false, leaveContribution: false, manageContributors: false },
});
const summary = (n: number) => ({
  id: lessonId(n), slug: `lesson-title-${n}`, position: n - 1, title: `Lesson title ${n}`, goal: null, published: true, publishedAt: 1, changed: false, updatedBy: editor, updatedAt: 1,
  wordCount: 0, practiceCount: 1, imageUrl: null,
});
const practice: LessonTopBlock = {
  id: practiceId, type: "practice",
  props: { data: JSON.stringify({ instruction: "Translate.", passage: null, items: [{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] }] }) }, children: [],
};
const lesson = (n: number): CourseLesson => ({
  ...summary(n), document: { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [practice] }, practiceProgress: {}, draft: null, speech: {}, draftSpeech: null, myShares: {},
});
const row = (n: number, state: LessonProgressResponse["lessons"][number]["state"], storylinePercent: number, ids: string[] = []) => ({
  lessonId: lessonId(n), slug: `lesson-title-${n}`, title: `Lesson title ${n}`, state, storylinePercent,
  practicesDone: n === 2 ? 1 : 0, practicesTotal: 1, wordsReviewed: n === 2 ? 3 : 0, wordsTotal: 5, aiPracticeCount: 0, practiceIds: ids,
});
const lessonProgress: LessonProgressResponse = {
  complete: false, publishedLessons: 3, completedLessons: 1, missedLessons: 1,
  lessons: [row(1, "missed", 0, [otherPracticeId]), row(2, "completed", 100, [practiceId]), row(3, "in_progress", 40)],
};
const courseProgress = { publishedLessons: 3, completedLessonIds: [], positions: [], practices: {}, participants: [] };
const detail = (status: "published" | "archived" = "published"): CourseDetailResponse => ({ course: course(status), outline: [1, 2, 3].map(summary), lessons: [lesson(2)] });

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function renderWithRouter(page: ReactNode, initial = "/courses/dutch-foundations") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => page });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [initial] }) });
  return { router, ...render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>) };
}
const resetCalls = () => vi.mocked(fetch).mock.calls.filter(([path, init]) => String(path).endsWith("/reset") && init?.method === "POST");
const draftKey = (id: string) => practiceDraftKey(accountId, groupId, "practice-answer", id);
const storeDraft = (id: string) => localStorage.setItem(draftKey(id), JSON.stringify({ version: 1, answers: ["Er is een tuin."] }));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith("/progress/lessons")) return response(lessonProgress);
    if (path.endsWith("/progress")) return response(courseProgress);
    if (path.endsWith("/reset") && init?.method === "POST") return response(courseProgress);
    const read = /\/lessons\/([^/]+)$/.exec(path)?.[1];
    if (read) return response({ lesson: lesson(Number(read.slice(-1))) });
    return response({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Course tabs", () => {
  it("keeps the tab in the URL and validates the search", async () => {
    expect(validateCourseSearch({ tab: "progress" })).toEqual({ tab: "progress" });
    expect(validateCourseSearch({ tab: "lessons" })).toEqual({});
    expect(validateCourseSearch({ tab: "other" })).toEqual({});
    const { router } = renderWithRouter(<CourseTabs courseSlug="dutch-foundations" tab="lessons" />);
    const lessons = await screen.findByRole("tab", { name: "Lessons" });
    expect(lessons).toHaveAttribute("aria-selected", "true");
    const progressTab = screen.getByRole("tab", { name: "Progress" });
    expect(progressTab).toHaveAttribute("aria-selected", "false");
    expect(progressTab).toHaveAttribute("href", "/courses/dutch-foundations?tab=progress");
    fireEvent.click(progressTab);
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "progress" }));
    expect(router.state.location.pathname).toBe("/courses/dutch-foundations");
  });
});

describe("Progress tab", () => {
  it("shows the course line and each published lesson's state, storyline, and counts", async () => {
    renderWithRouter(<CourseProgressTab groupId={groupId} courseId={courseId} accountId={accountId} courseSlug="dutch-foundations" outline={detail().outline} archived={false} />);
    expect(await screen.findByText("1 of 3 lessons completed")).toBeInTheDocument();
    expect(screen.getByText("1 lesson missed")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Missed")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Completed")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("In progress")).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("link", { name: /Lesson title 2/ })).toHaveAttribute("href", "/courses/dutch-foundations/lessons/lesson-title-2");
    expect(within(rows[2]!).getByRole("progressbar", { name: "Storyline progress for lesson 3" })).toHaveAttribute("aria-valuenow", "40");
    expect(within(rows[1]!).getByLabelText("1 of 1 practices done")).toHaveTextContent("Practices 1/1");
    expect(within(rows[1]!).getByLabelText("3 of 5 words reviewed")).toHaveTextContent("Words 3/5");
    expect(within(rows[1]!).getByLabelText("0 AI practices")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Reset lesson \d/ })).toHaveLength(3);
  });

  it("says when the course is complete and offers no reset in an archived course", async () => {
    vi.mocked(fetch).mockImplementation(async () => response({ ...lessonProgress, complete: true, completedLessons: 2 }));
    renderWithRouter(<CourseProgressTab groupId={groupId} courseId={courseId} accountId={accountId} courseSlug="dutch-foundations" outline={detail().outline} archived />);
    expect(await screen.findByText("Course complete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reset/ })).not.toBeInTheDocument();
  });

  it("confirms a reset listing what is deleted, cancels without a request, and clears that lesson's drafts", async () => {
    storeDraft(practiceId); storeDraft(otherPracticeId);
    renderWithRouter(<CourseProgressTab groupId={groupId} courseId={courseId} accountId={accountId} courseSlug="dutch-foundations" outline={detail().outline} archived={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset lesson 2: Lesson title 2" }));
    let dialog = await screen.findByRole("dialog", { name: "Reset this lesson?" });
    expect(within(dialog).getByText("Your place in the lesson and its completion")).toBeInTheDocument();
    expect(within(dialog).getByText(/Your word reviews and memory of this lesson’s words/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(resetCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Reset lesson 2: Lesson title 2" }));
    dialog = await screen.findByRole("dialog", { name: "Reset this lesson?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset lesson" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(resetCalls().map(([path]) => String(path))).toEqual([`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(2)}/reset`]);
    expect(localStorage.getItem(draftKey(practiceId))).toBeNull();
    // Another lesson's drafts stay.
    expect(localStorage.getItem(draftKey(otherPracticeId))).not.toBeNull();
    // The tab refreshes after the reset.
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/progress/lessons")).length).toBeGreaterThan(1));
  });
});

describe("Lesson page reset", () => {
  const renderLesson = (status: "published" | "archived" = "published") => renderWithRouter(
    <LessonView groupId={groupId} courseId={courseId} accountId={accountId} detail={detail(status)} lessonId={lessonId(2)} dataUpdatedAt={Date.now()} />,
    "/courses/dutch-foundations/lessons/lesson-title-2",
  );

  it("confirms, clears the lesson's drafts, and returns to the course's lesson list", async () => {
    storeDraft(practiceId);
    const { router } = renderLesson();
    fireEvent.click(await screen.findByRole("button", { name: "Reset lesson" }));
    let dialog = await screen.findByRole("dialog", { name: "Reset this lesson?" });
    expect(within(dialog).getByText("Start Lesson title 2 over. This permanently deletes:")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(resetCalls()).toHaveLength(0);
    expect(router.state.location.pathname).toBe("/courses/dutch-foundations/lessons/lesson-title-2");

    fireEvent.click(screen.getByRole("button", { name: "Reset lesson" }));
    dialog = await screen.findByRole("dialog", { name: "Reset this lesson?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset lesson" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/courses/dutch-foundations"));
    expect(router.state.location.search).toEqual({});
    expect(resetCalls()).toHaveLength(1);
    expect(localStorage.getItem(draftKey(practiceId))).toBeNull();
  });

  it("offers no reset in an archived course", async () => {
    renderLesson("archived");
    expect(await screen.findByRole("heading", { name: "Lesson title 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset lesson" })).not.toBeInTheDocument();
  });
});
