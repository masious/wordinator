import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseDetailResponse, type CourseLesson, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LessonView } from "./CourseLessons";

const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const blockId = (n: number) => `50000000-0000-4000-8000-00000000000${n}`;
const user = { id: accountId, displayName: "Ada", avatarUrl: null };
const course = (status: "published" | "archived" = "published", edit = false) => ({
  id: courseId, slug: "dutch", groupId, title: "Dutch", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status,
  owner: user, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: null,
  permissions: { edit, publish: edit, archive: edit, removeContent: edit, contribute: edit, requestContribution: false, leaveContribution: false, manageContributors: edit },
});
const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const example = (n: number): LessonTopBlock => ({ id: blockId(n), type: "example", props: { translation: "", note: "" }, content: text(`Zin ${n}.`), children: [] });
// Four examples, one step each, laid out 900px apart on a 4000px page seen through a 1000px window.
const blocks = [1, 2, 3, 4].map(example);
const layout = new Map(blocks.map((block, index) => [block.id, index * 900]));
const document: LessonDocument = { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks };
const summary = (published: boolean) => ({
  id: lessonId, slug: "lesson-1", position: 0, title: "Lesson 1", goal: null, published, publishedAt: published ? 1 : null, changed: false, updatedBy: user, updatedAt: 1, wordCount: 0, practiceCount: 0, imageUrl: null,
});
const lesson = (published = true): CourseLesson => ({
  ...summary(published), document: published ? document : null, practiceProgress: {}, draft: published ? null : { document, version: 1 }, speech: {}, draftSpeech: published ? null : {},
});
const position = (n: number) => ({ lessonId, stepKey: blockId(n), stepIndex: n - 1, passedSteps: n - 1, totalSteps: 4, updatedAt: 1 });
const progress = (completed: string[] = [], positions: unknown[] = []) => ({ publishedLessons: 1, completedLessonIds: completed, positions, participants: [{ user, completedLessons: completed.length, percent: 0 }] });

function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }
let served = progress();
function renderLesson(detail: CourseDetailResponse) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 } } });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <LessonView groupId={groupId} courseId={courseId} accountId={accountId} detail={detail} lessonId={lessonId} dataUpdatedAt={Date.now()} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/lesson"] }) });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
const detail = (entry: CourseLesson, status: "published" | "archived" = "published", edit = false): CourseDetailResponse =>
  ({ course: course(status, edit), outline: [summary(entry.published)], lessons: [entry] });

let scrollY = 0;
const scrollTo = async (y: number) => {
  scrollY = y;
  await act(async () => { window.dispatchEvent(new Event("wheel")); window.dispatchEvent(new Event("scroll")); await new Promise((resolve) => setTimeout(resolve, 5)); });
};
const saved = () => vi.mocked(fetch).mock.calls.filter(([path, init]) => String(path).endsWith("/position") && init?.method === "PUT").map(([, init]) => JSON.parse(String(init?.body)).stepKey);
const bar = () => screen.getByRole("progressbar", { name: "Lesson progress" });

beforeEach(() => {
  scrollY = 0; served = progress();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  Object.defineProperty(globalThis.document.documentElement, "scrollHeight", { configurable: true, value: 4000 });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = (layout.get(this.dataset.blockId ?? "") ?? 0) - scrollY;
    return { top, bottom: top + 200, height: 200, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith("/progress")) return response(served);
    if (path.endsWith("/words")) return response({ words: [] });
    if (path.endsWith("/position") && init?.method === "PUT") {
      const stepKey = JSON.parse(String(init.body)).stepKey as string;
      return response({ position: { ...position(1), stepKey, stepIndex: blocks.findIndex((block) => block.id === stepKey) } });
    }
    return response({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Saves wait for the reader to pause, so these tests run on real timers for a few seconds each.
describe("Lesson page reading progress", { timeout: 15_000 }, () => {
  it("moves the bar step by step with the scroll and saves the furthest step reached once the reader pauses", async () => {
    renderLesson(detail(lesson()));
    expect(await screen.findByText("Zin 1.")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/progress$/), expect.anything()));
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
    // The third block's top (1800 - 1200 = 600) is above the reading line at 750px; the fourth (1500) is not.
    await scrollTo(1200);
    // Step 3 of 4, in the player's unit.
    expect(bar()).toHaveAttribute("aria-valuenow", "75");
    // Saves wait for a pause, so several scroll events send one request.
    await scrollTo(1250);
    expect(saved()).toEqual([]);
    await waitFor(() => expect(saved()).toEqual([blockId(3)]), { timeout: 3000 });
    expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId}/position`, expect.objectContaining({ method: "PUT" }));
    // Scrolling back never moves the position back.
    await scrollTo(0);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(saved()).toEqual([blockId(3)]);
    expect(bar()).toHaveAttribute("aria-valuenow", "75");
    // The bottom of the page reaches the last step and fills the bar.
    await scrollTo(3000);
    expect(bar()).toHaveAttribute("aria-valuenow", "100");
    await waitFor(() => expect(saved()).toEqual([blockId(3), blockId(4)]), { timeout: 3000 });
  });

  it("saves nothing when the page is only opened, or before the saved position", async () => {
    served = progress([], [position(3)]);
    renderLesson(detail(lesson()));
    expect(await screen.findByText("Step 3 of 4")).toBeInTheDocument();
    // The bar starts from the saved position, as the player does.
    expect(bar()).toHaveAttribute("aria-valuenow", "75");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(saved()).toEqual([]);
    // The reader passes the second block only: the saved third step stays.
    await scrollTo(400);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(saved()).toEqual([]);
    await scrollTo(2100);
    await waitFor(() => expect(saved()).toEqual([blockId(4)]), { timeout: 3000 });
  });

  it("saves nothing for a scroll the reader did not make, such as the router resetting it on navigation", async () => {
    renderLesson(detail(lesson()));
    expect(await screen.findByText("Zin 1.")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/progress$/), expect.anything()));
    scrollY = 3000;
    await act(async () => { window.dispatchEvent(new Event("scroll")); await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(bar()).toHaveAttribute("aria-valuenow", "0");
    // Ordinary keys and clicks inside the page are not scrolling intent either.
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); window.dispatchEvent(new Event("scroll")); });
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(saved()).toEqual([]);
  });

  it("never saves on a finished lesson, a draft preview, or an archived course, but still fills the bar", async () => {
    for (const [entry, status, edit, completed] of [[lesson(), "published", false, [lessonId]], [lesson(false), "published", true, []], [lesson(), "archived", false, []]] as const) {
      served = progress([...completed]);
      renderLesson(detail(entry, status, edit));
      expect(await screen.findByText("Zin 1.")).toBeInTheDocument();
      await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/progress$/), expect.anything()));
      // A finished lesson shows full before any scrolling.
      if (completed.length) expect(bar()).toHaveAttribute("aria-valuenow", "100");
      await scrollTo(3000);
      expect(bar()).toHaveAttribute("aria-valuenow", "100");
      cleanup(); scrollY = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(saved()).toEqual([]);
  });
});
