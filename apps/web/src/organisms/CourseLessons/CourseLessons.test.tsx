import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseDetailResponse, type CourseLesson, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { CourseLessons, LessonView } from "./CourseLessons";
import { CourseResume } from "./CourseResume";

const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = (n: number) => `40000000-0000-4000-8000-00000000000${n}`;
const editor = { id: accountId, displayName: "Ada" };
const course = (edit: boolean, contribute = edit) => ({
  id: courseId, slug: "dutch-foundations", groupId, title: "Dutch Foundations", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: "published" as const,
  owner: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: !edit && contribute ? "active" as const : null,
  permissions: { edit, publish: edit, archive: edit, removeContent: edit, contribute, requestContribution: false, leaveContribution: !edit && contribute, manageContributors: edit },
});
const summary = (n: number, published = true, counts: { wordCount?: number; practiceCount?: number; imageUrl?: string | null } = {}) => ({
  id: lessonId(n), slug: `lesson-title-${n}`, position: n - 1, title: `Lesson title ${n}`, goal: null, published, publishedAt: published ? 1 : null, changed: false, updatedBy: editor, updatedAt: 1,
  wordCount: 0, practiceCount: 0, imageUrl: null, ...counts,
});
const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const example = (id: string, sentence: string, translation = ""): LessonTopBlock =>
  ({ id, type: "example", props: { translation, note: "" }, content: text(sentence), children: [] });
const dialogue: LessonTopBlock = {
  id: "50000000-0000-4000-8000-000000000002", type: "dialogue", props: { turns: JSON.stringify([{ speaker: "A", text: "Is er een tuin?" }, { speaker: "B", text: "Nee." }]) }, children: [],
};
const practice: LessonTopBlock = {
  id: "50000000-0000-4000-8000-000000000003", type: "practice",
  props: { data: JSON.stringify({ instruction: "Translate.", passage: null, items: [{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] }, { prompt: "No.", authorsVersion: [] }] }) },
  children: [],
};
const doc = (blocks: LessonTopBlock[]): LessonDocument => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks });
// Readers receive the published document only; editors also receive the draft.
const lesson = (n: number, blocks: LessonTopBlock[] = [], { published = true, editing = false } = {}): CourseLesson => ({
  ...summary(n, published), document: published ? doc(blocks) : null, practiceProgress: {}, draft: editing ? { document: doc(blocks), version: 1 } : null, speech: {}, draftSpeech: editing ? {} : null,
});
const progress = (completedLessonIds: string[], positions: unknown[] = []) => ({
  publishedLessons: 4, completedLessonIds, positions,
  participants: [{ user: { id: accountId, displayName: "Ada", avatarUrl: null }, completedLessons: completedLessonIds.length, percent: completedLessonIds.length * 25 }],
});

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function renderWithRouter(page: ReactNode) {
  // Mirrors the application's stale time, so preloaded lessons are not refetched on mount.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => page });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/groups/${groupId}/courses/${courseId}`] }) });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
// The course page renders the resume action above the lesson list; both read the same progress query.
let served: CourseLesson[] = [];
const renderLessons = (detail: CourseDetailResponse) => { served = detail.lessons; return renderWithRouter(<>
  <CourseResume groupId={groupId} courseId={courseId} accountId={accountId} outline={detail.outline} />
  <CourseLessons groupId={groupId} courseId={courseId} accountId={accountId} detail={detail} />
</>); };
const renderLesson = (detail: CourseDetailResponse, id = lessonId(1)) =>
  renderWithRouter(<LessonView groupId={groupId} courseId={courseId} accountId={accountId} detail={detail} lessonId={id} dataUpdatedAt={Date.now()} />);

const lessonFour = lesson(4, [example("50000000-0000-4000-8000-000000000004", "Ik stap over.")]);

beforeEach(() => {
  localStorage.clear(); served = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith("/progress")) return response(progress([]));
    if (path.endsWith("/words")) return response({ words: [] });
    if (path.endsWith("/completion") && init?.method === "PUT") return response(progress([lessonId(1)]));
    if (path.endsWith("/position") && init?.method === "PUT") {
      return response({ position: { lessonId: lessonId(1), stepKey: JSON.parse(String(init.body)).stepKey, stepIndex: 0, passedSteps: 0, totalSteps: 1, updatedAt: 1 } });
    }
    // The player and the lesson page read a lesson by ID: lesson four, or one the rendered course read preloaded.
    const read = /\/lessons\/([^/]+)$/.exec(path)?.[1];
    if (read) { const found = read === lessonId(4) ? lessonFour : served.find((entry) => entry.id === read); if (found) return response({ lesson: found }); }
    return response({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Course lessons", () => {
  it("lists every lesson as a link to its own page without rendering lesson content", async () => {
    const detail = { course: course(false), outline: [1, 2, 3, 4].map((n) => summary(n)), lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.")]), lesson(2), lesson(3)] };
    renderLessons(detail);
    const link = await screen.findByRole("link", { name: "Open lesson 1: Lesson title 1" });
    expect(link).toHaveAttribute("href", "/courses/dutch-foundations/lessons/lesson-title-1");
    expect(screen.getByRole("link", { name: "Open lesson 4: Lesson title 4" })).toBeInTheDocument();
    expect(screen.queryByText("Er is een balkon.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    // The list loads no lesson; only the viewer's progress and course recap.
    await waitFor(() => expect(vi.mocked(fetch).mock.results).toHaveLength(2));
    expect(vi.mocked(fetch).mock.calls.map(([path]) => String(path)).sort()).toEqual([`/api/groups/${groupId}/courses/${courseId}/progress`, `/api/groups/${groupId}/courses/${courseId}/words`]);
    // A viewer with no finished words is not offered a recap.
    expect(screen.queryByRole("button", { name: "Review words" })).not.toBeInTheDocument();
  });

  it("shows a lesson's first image beside it, inside its link, and nothing for a lesson without one", async () => {
    const imageUrl = "https://media.test/courses/c/lessons/l/garden.png";
    renderLessons({ course: course(false), outline: [summary(1, true, { imageUrl }), summary(2)], lessons: [lesson(1), lesson(2)] });
    const link = await screen.findByRole("link", { name: "Open lesson 1: Lesson title 1" });
    // The link's label names the lesson, so the image is decorative.
    const image = link.querySelector("img");
    expect(image).toHaveAttribute("src", imageUrl);
    expect(image).toHaveAttribute("alt", "");
    expect(screen.getByRole("link", { name: "Open lesson 2: Lesson title 2" }).querySelector("img")).toBeNull();
  });

  it("renders one lesson's published document on its page with links to its neighbours", async () => {
    const detail = { course: course(false), outline: [1, 2, 3].map((n) => summary(n)), lessons: [lesson(1), lesson(2, [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.", "There is a balcony."), dialogue]), lesson(3)] };
    renderLesson(detail, lessonId(2));
    expect(await screen.findByRole("heading", { name: "Lesson title 2", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Er is een balkon.")).toBeInTheDocument();
    expect(screen.getByText("There is a balcony.")).toBeInTheDocument();
    expect(screen.getByText("Is er een tuin?")).toBeInTheDocument();
    expect(screen.queryByText("Lesson title 1", { selector: "h1" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous: Lesson title 1" })).toHaveAttribute("href", "/courses/dutch-foundations/lessons/lesson-title-1");
    expect(screen.getByRole("link", { name: "Next: Lesson title 3" })).toHaveAttribute("href", "/courses/dutch-foundations/lessons/lesson-title-3");
    // A preloaded lesson is not fetched again.
    expect(fetch).not.toHaveBeenCalledWith(expect.stringMatching(/\/lessons\/[^/]+$/), expect.anything());
  });

  it("loads a lesson that the course read did not preload by ID", async () => {
    renderLesson({ course: course(false), outline: [1, 2, 3, 4].map((n) => summary(n)), lessons: [lesson(1), lesson(2), lesson(3)] }, lessonId(4));
    expect(await screen.findByText("Ik stap over.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(4)}`, expect.anything());
    expect(screen.queryByRole("link", { name: /^Next:/ })).not.toBeInTheDocument();
  });

  it("lists the lesson's new words beside the text and highlights the words of blocks on screen", async () => {
    const word = (n: number, term: string) => ({ id: `70000000-0000-4000-8000-00000000000${n}`, term, meaning: `meaning of ${term}` });
    const vocabulary = (n: number, ...words: unknown[]): LessonTopBlock => ({ id: `50000000-0000-4000-8000-00000000002${n}`, type: "vocabulary", props: { data: JSON.stringify({ words }) }, children: [] });
    const first = example("50000000-0000-4000-8000-000000000011", "De hond blaft.");
    const second = example("50000000-0000-4000-8000-000000000012", "De kat slaapt.");
    // Only the first example is on screen.
    const observed: Element[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) { observed.push(target); this.callback([{ target, isIntersecting: target.getAttribute("data-block-id") === first.id } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
      disconnect() { /* nothing to release */ }
    });
    renderLesson({ course: course(false), outline: [summary(1)], lessons: [lesson(1, [first, vocabulary(1, word(1, "de hond")), second, vocabulary(2, word(2, "de kat"))])] });
    const panel = await screen.findByRole("complementary", { name: "New words" });
    expect(within(panel).getByText("de hond")).toBeInTheDocument();
    expect(within(panel).getByText("meaning of de kat")).toBeInTheDocument();
    // The text itself carries no New words boxes.
    expect(screen.queryAllByRole("region", { name: "New words" }).filter((region) => !panel.contains(region))).toHaveLength(0);
    await waitFor(() => expect(within(panel).getByText("de hond").closest("li")).toHaveAttribute("aria-current", "true"));
    expect(within(panel).getByText("de kat").closest("li")).not.toHaveAttribute("aria-current");
    expect(observed.map((element) => element.getAttribute("data-block-id"))).toEqual([first.id, second.id]);
  });

  it("shows a lesson outside the course outline as unavailable", async () => {
    renderLesson({ course: course(false), outline: [summary(1)], lessons: [lesson(1)] }, lessonId(4));
    expect(await screen.findByText("This lesson is not available.")).toBeInTheDocument();
  });

  it("shows editors the draft of an unpublished lesson as a preview", async () => {
    renderLesson({ course: course(true), outline: [summary(1, false)], lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Een concept.")], { published: false, editing: true })] });
    expect(await screen.findByText("Een concept.")).toBeInTheDocument();
    expect(screen.getAllByText("Unpublished").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Edit lesson 1" })).toBeInTheDocument();
  });

  it("lets a contributor edit content but not reorder or change details of a published lesson", async () => {
    const detail = { course: course(false, true), outline: [summary(1)], lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.")], { editing: true })] };
    renderLesson(detail);
    expect(await screen.findByRole("button", { name: "Edit lesson 1" })).toBeInTheDocument();
    cleanup();
    renderLessons(detail);
    expect(await screen.findByRole("link", { name: "Open lesson 1: Lesson title 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move lesson 1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
  });

  it("steps through a lesson one sentence and question at a time and records completion", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith(`/blocks/${practice.id}/progress`)) return response({ progress: { done: 0, started: 1, answered: 1 } });
      return original(input, init);
    });
    const progress = () => vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith(`/blocks/${practice.id}/progress`)).map(([, init]) => [init?.method, JSON.parse(String(init?.body))]);
    const first = lesson(1, [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.", "There is a balcony."), dialogue, practice]);
    const withAnswers = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith(`/lessons/${lessonId(1)}`) ? response({ lesson: first }) : withAnswers(input, init));
    renderLessons({ course: course(false), outline: [1, 2, 3, 4].map((n) => summary(n)), lessons: [first, lesson(2), lesson(3)] });
    fireEvent.click(await screen.findByRole("button", { name: "Start lesson 1" }));
    const dialog = await screen.findByRole("dialog");
    const meter = () => within(dialog).getByRole("progressbar", { name: "Lesson progress" });
    expect(within(dialog).getByText("Step 1 of 5")).toBeInTheDocument();
    expect(meter()).toHaveAttribute("aria-valuenow", "0");
    expect(within(dialog).getByText("Er is een balkon.")).toBeInTheDocument();
    // The translation shows with the sentence.
    expect(within(dialog).getByText("There is a balcony.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("region", { name: "New words" })).not.toBeInTheDocument();

    // Next starts focused, and Enter outside a field acts as Next. Dialogue lines arrive one after another.
    expect(within(dialog).getByRole("button", { name: "Next" })).toHaveFocus();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(within(dialog).getByText("Is er een tuin?")).toBeInTheDocument();
    expect(within(dialog).queryByText("Nee.")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText("Nee.")).toBeInTheDocument();
    expect(meter()).toHaveAttribute("aria-valuenow", "40");
    // Each move saves the step now shown, keyed by its block and line.
    const saved = () => vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/position")).map(([, init]) => JSON.parse(String(init?.body)).stepKey);
    await waitFor(() => expect(saved()).toEqual([`${dialogue.id}:0`, `${dialogue.id}:1`]));

    // Practice items are asked one by one and share the practice draft. Nothing is saved before an answer exists.
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText("Question 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByText("There is a garden.")).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar", { name: "Practice progress" })).toHaveAttribute("aria-valuenow", "50");
    fireEvent.change(within(dialog).getByLabelText("Your answer"), { target: { value: "Er is een boom." } });
    expect(JSON.parse(localStorage.getItem(`wordinator:draft:v1:${accountId}:${groupId}:practice-answer:${practice.id}`)!)).toEqual({ version: 1, answers: ["Er is een boom.", ""] });
    // Next on a filled answer that misses checks it on the device, shows the author's version, and stays.
    expect(within(dialog).queryByText("Er is een tuin.")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText("Er is een tuin.")).toBeInTheDocument();
    expect(within(dialog).getByText("Question 1 of 2")).toBeInTheDocument();
    // Enter on a matching answer moves on at once, and focus follows to the next question's field.
    const field = within(dialog).getByLabelText("Your answer");
    fireEvent.change(field, { target: { value: "er is een TUIN" } });
    field.focus();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(within(dialog).getByText("Question 2 of 2")).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar", { name: "Practice progress" })).toHaveAttribute("aria-valuenow", "100");
    await waitFor(() => expect(within(dialog).getByLabelText("Your answer")).toHaveFocus());
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).includes("/check"))).toHaveLength(0);
    // Leaving a question saves only how many of the practice's questions are answered, never the answers.
    await waitFor(() => expect(progress()).toEqual([["PUT", { answered: 1 }]]));
    expect(within(dialog).queryByRole("button", { name: /share/i })).not.toBeInTheDocument();

    // An empty answer is never checked: Next moves straight on.
    fireEvent.click(within(dialog).getByRole("button", { name: "Finish lesson" }));
    expect(await within(dialog).findByText("You have finished 1 of 4 lessons (25%).")).toBeInTheDocument();
    expect(meter()).toHaveAttribute("aria-valuenow", "100");
    await waitFor(() => expect(progress().length).toBe(2));
    expect(progress().every(([method, body]) => method === "PUT" && JSON.stringify(body) === JSON.stringify({ answered: 1 }))).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(1)}/completion`, expect.objectContaining({ method: "PUT" }));
    expect(within(dialog).getByRole("button", { name: "Next: Lesson title 2" })).toBeInTheDocument();
    // A run without words offers no recap.
    expect(within(dialog).queryByRole("button", { name: "Review words" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("img", { name: "Finished" }).length).toBeGreaterThan(0));
  });

  it("shows each step's new words in a panel and reviews the run's words after finishing", async () => {
    const word = (n: number, term: string) => ({ id: `70000000-0000-4000-8000-00000000000${n}`, term, meaning: `meaning of ${term}` });
    const vocabulary = (n: number, ...words: unknown[]): LessonTopBlock => ({ id: `50000000-0000-4000-8000-00000000002${n}`, type: "vocabulary", props: { data: JSON.stringify({ words }) }, children: [] });
    const blocks: LessonTopBlock[] = [
      { id: "50000000-0000-4000-8000-000000000010", type: "paragraph", props: { textColor: "default", backgroundColor: "default" }, content: text("Dieren."), children: [] },
      vocabulary(1, word(1, "de hond")),
      example("50000000-0000-4000-8000-000000000011", "De kat slaapt."), vocabulary(2, word(2, "de kat")),
      dialogue, vocabulary(3, word(3, "de tuin")),
      practice, vocabulary(4, word(4, "vertalen")),
      { id: "50000000-0000-4000-8000-000000000012", type: "heading", props: { textColor: "default", backgroundColor: "default", level: 2 }, content: text("Woorden"), children: [] },
      vocabulary(5, word(5, "het huis")),
    ];
    const first = lesson(1, blocks);
    renderLessons({ course: course(false), outline: [summary(1)], lessons: [first] });
    fireEvent.click(await screen.findByRole("button", { name: "Start lesson 1" }));
    const dialog = await screen.findByRole("dialog");
    const panel = () => within(dialog).getByRole("region", { name: "New words" });
    const next = () => fireEvent.click(within(dialog).getByRole("button", { name: /^(Next|Finish lesson)$/ }));
    // Prose, example, both dialogue lines (only the line that uses a word shows it), both practice items, and a words-only section.
    const expected = ["de hond", "de kat", "de tuin", null, "vertalen", "vertalen", "het huis"];
    for (const [index, term] of expected.entries()) {
      expect(within(dialog).getByText(`Step ${index + 1} of 7`)).toBeInTheDocument();
      if (term) {
        expect(panel()).toHaveTextContent(term);
        expect(panel()).toHaveTextContent(`meaning of ${term}`);
        expect(within(dialog).getAllByRole("region", { name: "New words" })).toHaveLength(1);
      } else {
        expect(within(dialog).queryByRole("region", { name: "New words" })).not.toBeInTheDocument();
      }
      next();
    }
    expect(await within(dialog).findByText("You have finished 1 of 4 lessons (25%).")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Review words" }));
    expect(within(dialog).getByText("Word 1 of 5")).toBeInTheDocument();
    expect(within(dialog).getByRole("article", { name: "de hond" })).toBeInTheDocument();
    expect(within(dialog).queryByText("You have finished 1 of 4 lessons (25%).")).not.toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Show meaning" }));
    expect(within(dialog).getByText("meaning of de hond")).toBeVisible();
    for (let card = 1; card < 5; card += 1) fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByRole("article", { name: "het huis" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to the summary" }));
    expect(within(dialog).getByText("You have finished 1 of 4 lessons (25%).")).toBeVisible();
    // The completion screen stayed mounted, so the lesson was recorded once.
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/completion"))).toHaveLength(1);
  });

  it("offers the course recap when the viewer has finished lessons with words", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    const words = [
      { id: "70000000-0000-4000-8000-000000000001", lessonId: lessonId(1), term: "de hond", meaning: "the dog", forms: "de honden", example: null, note: null, speech: { term: null, example: null } },
      { id: "70000000-0000-4000-8000-000000000002", lessonId: lessonId(1), term: "de kat", meaning: "the cat", forms: null, example: null, note: null, speech: { term: null, example: null } },
    ];
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith("/words") ? response({ words }) : original(input, init));
    renderLessons({ course: course(false), outline: [summary(1)], lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.")])] });
    expect(await screen.findByText("2 words from the lessons you have finished.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review words" }));
    const dialog = await screen.findByRole("dialog", { name: "Review words" });
    expect(within(dialog).getByText("Word 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByRole("article", { name: "de hond" })).toHaveTextContent("de honden");
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to the course" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("groups prose under a heading into one step and labels later steps with it", async () => {
    const blocks: LessonTopBlock[] = [
      { id: "50000000-0000-4000-8000-000000000005", type: "heading", props: { textColor: "default", backgroundColor: "default", level: 1 }, content: text("Wonen"), children: [] },
      { id: "50000000-0000-4000-8000-000000000006", type: "paragraph", props: { textColor: "default", backgroundColor: "default" }, content: text("Eerste alinea."), children: [] },
      { id: "50000000-0000-4000-8000-000000000007", type: "paragraph", props: { textColor: "default", backgroundColor: "default" }, content: text("Tweede alinea."), children: [] },
      { id: "50000000-0000-4000-8000-000000000008", type: "callout", props: { variant: "grammar", icon: "auto" }, content: text("Let op de volgorde."), children: [] },
    ];
    renderLessons({ course: course(false), outline: [summary(1)], lessons: [lesson(1, blocks)] });
    fireEvent.click(await screen.findByRole("button", { name: "Start lesson 1" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Step 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByText("Eerste alinea.")).toBeInTheDocument();
    expect(within(dialog).getByText("Tweede alinea.")).toBeInTheDocument();
    expect(within(dialog).getByText("Wonen")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByRole("complementary", { name: "Grammar" })).toHaveTextContent("Let op de volgorde.");
    expect(within(dialog).getByText("Wonen")).toBeInTheDocument();
  });

  it("does not record progress for an unpublished lesson preview", async () => {
    renderLessons({ course: course(true), outline: [summary(1, false)], lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.")], { published: false, editing: true })] });
    expect(await screen.findByText(/is a preview: it starts from the beginning/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Start lesson 1" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Finish lesson" }));
    expect(await within(dialog).findByText("This lesson is unpublished, so finishing it does not count toward progress.")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/completion") || String(path).endsWith("/position"))).toBe(false);
  });

  it("offers one course action: the first unfinished lesson", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith("/progress") ? response(progress([lessonId(1)])) : original(input, init));
    const blocks = [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.")];
    renderLessons({ course: course(false), outline: [1, 2, 3].map((n) => summary(n)), lessons: [lesson(1, blocks), lesson(2, blocks), lesson(3, blocks)] });
    expect(await screen.findByText("Next up: lesson 2, Lesson title 2.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Your course progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(Start|Continue|Practise) lesson \d+( again)?$/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Start lesson 2" })).toBeInTheDocument();
  });

  it("offers the first lesson again once every lesson is finished", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith("/progress") ? response(progress([lessonId(1), lessonId(2)])) : original(input, init));
    renderLessons({ course: course(false), outline: [1, 2].map((n) => summary(n)), lessons: [lesson(1), lesson(2)] });
    expect(await screen.findByRole("button", { name: "Practise lesson 1 again" })).toBeInTheDocument();
    expect(screen.getByText("You have finished every lesson. Run through them again whenever you like.")).toBeInTheDocument();
  });

  it("resumes an unfinished lesson at the saved step and can start over", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    const saved = { lessonId: lessonId(1), stepKey: `${practice.id}:0`, stepIndex: 3, passedSteps: 3, totalSteps: 5, updatedAt: 1 };
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith("/progress") ? response(progress([], [saved])) : original(input, init));
    // The example moved one step later since the position was saved; the key still finds the same question.
    const first = lesson(1, [example("50000000-0000-4000-8000-000000000009", "Nieuw."), example("50000000-0000-4000-8000-000000000001", "Er is een balkon."), dialogue, practice]);
    renderLessons({ course: course(false), outline: [1, 2].map((n) => summary(n)), lessons: [first, lesson(2)] });
    expect(await screen.findByRole("heading", { name: "Pick up where you left off" })).toBeInTheDocument();
    expect(screen.getByText("Lesson 1, Lesson title 1, step 4 of 5.")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue lesson 1" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Step 5 of 6")).toBeInTheDocument();
    expect(within(dialog).getByText("There is a garden.")).toBeInTheDocument();
    expect(within(dialog).getByText("Picked up where you left off.")).toBeInTheDocument();
    // Opening the player alone saves nothing.
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/position"))).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Start over" }));
    expect(within(dialog).getByText("Step 1 of 6")).toBeInTheDocument();
    expect(within(dialog).queryByText("Picked up where you left off.")).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(1)}/position`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ stepKey: "50000000-0000-4000-8000-000000000009" }) })));
  });
});

describe("Lesson actions", () => {
  const word = (n: number, term: string) => ({ id: `70000000-0000-4000-8000-00000000000${n}`, term, meaning: `meaning of ${term}` });
  const vocabulary = (n: number, ...words: unknown[]): LessonTopBlock => ({ id: `50000000-0000-4000-8000-00000000002${n}`, type: "vocabulary", props: { data: JSON.stringify({ words }) }, children: [] });
  const second: LessonTopBlock = {
    id: "50000000-0000-4000-8000-000000000013", type: "practice",
    props: { data: JSON.stringify({ instruction: "Complete the dialogue.", passage: null, items: [{ prompt: "Hoe gaat het?", authorsVersion: [], note: null }] }) }, children: [],
  };
  const withProgress = (body: unknown) => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith("/progress") && !String(input).includes("/blocks/") ? response(body) : original(input, init));
  };
  const lessonReads = () => vi.mocked(fetch).mock.calls.filter(([path]) => /\/lessons\/[^/]+$/.test(String(path)));

  it("plays each lesson by the viewer's state: start, continue at the saved step, or start a finished one again", async () => {
    const saved = { lessonId: lessonId(2), stepKey: "50000000-0000-4000-8000-000000000002", stepIndex: 1, passedSteps: 1, totalSteps: 2, updatedAt: 1 };
    withProgress(progress([lessonId(1)], [saved]));
    const blocks = [example("50000000-0000-4000-8000-000000000001", "Er is een balkon."), example("50000000-0000-4000-8000-000000000002", "Er is een tuin.")];
    renderLessons({ course: course(false), outline: [1, 2, 3].map((n) => summary(n)), lessons: [lesson(1, blocks), lesson(2, blocks), lesson(3, blocks)] });
    expect(await screen.findByRole("button", { name: "Start lesson 1 again: Lesson title 1" })).toHaveTextContent("Start again");
    expect(screen.getByRole("button", { name: "Start lesson 3: Lesson title 3" })).toHaveTextContent("Start");
    // Lessons without words or practices offer nothing to review or practise.
    expect(screen.queryByRole("button", { name: /^Review the words of lesson/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Practise lesson \d+ again:/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue lesson 2: Lesson title 2" }));
    const dialog = await screen.findByRole("dialog", { name: "Lesson 2 · Lesson title 2" });
    expect(within(dialog).getByText("Step 2 of 2")).toBeInTheDocument();
    expect(within(dialog).getByText("Picked up where you left off.")).toBeInTheDocument();
    fireEvent.keyDown(within(dialog).getByRole("button", { name: "Finish lesson" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Start lesson 1 again: Lesson title 1" }));
    expect(await within(await screen.findByRole("dialog")).findByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("reviews one lesson's words, loading the lesson only when asked", async () => {
    const words = lesson(4, [example("50000000-0000-4000-8000-000000000001", "De hond blaft."), vocabulary(1, word(1, "de hond"), word(2, "de kat"))]);
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith(`/lessons/${lessonId(4)}`) ? response({ lesson: words }) : original(input, init));
    renderLessons({ course: course(false), outline: [summary(1), summary(4, true, { wordCount: 2 })], lessons: [lesson(1)] });
    const review = await screen.findByRole("button", { name: "Review the words of lesson 2: Lesson title 4" });
    expect(screen.getAllByRole("button", { name: /^Review the words of lesson/ })).toHaveLength(1);
    expect(lessonReads()).toHaveLength(0);
    fireEvent.click(review);
    const dialog = await screen.findByRole("dialog", { name: "Words of lesson 2" });
    expect(await within(dialog).findByText("Word 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByRole("article", { name: "de hond" })).toBeInTheDocument();
    expect(lessonReads()).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to the course" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Reviewing records nothing.
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("lists a lesson's practices with the viewer's state and opens the chosen one's answer set", async () => {
    const practised = { ...lesson(1, [practice, dialogue, second]), practiceProgress: { [practice.id]: { done: 1, started: 1, answered: 2 }, [second.id]: { done: 0, started: 0, answered: null } } };
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith(`/lessons/${lessonId(1)}`)) return response({ lesson: practised });
      if (path.endsWith(`/blocks/${second.id}/progress`)) return response({ progress: { done: 1, started: 1, answered: 1 } });
      return original(input, init);
    });
    renderLessons({ course: course(false), outline: [summary(1, true, { practiceCount: 2 })], lessons: [lesson(1)] });
    fireEvent.click(await screen.findByRole("button", { name: "Practise lesson 1 again: Lesson title 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Practices in lesson 1" });
    const first = await within(dialog).findByRole("button", { name: /Translate\./ });
    expect(first).toHaveTextContent("Done");
    const other = within(dialog).getByRole("button", { name: /Complete the dialogue\./ });
    expect(other).toHaveTextContent("1 question");
    // Entries stay minimal: no prompts until a practice is chosen.
    expect(within(dialog).queryByText("Hoe gaat het?")).not.toBeInTheDocument();
    fireEvent.click(other);
    const field = await within(dialog).findByLabelText(/Hoe gaat het\?/);
    fireEvent.change(field, { target: { value: "Goed." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    // Finishing the set saves only the answered count and returns to the list.
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(1)}/blocks/${second.id}/progress`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ answered: 1 }) })));
    expect(await within(dialog).findByRole("button", { name: /Translate\./ })).toBeInTheDocument();
  });

  it("previews an editor's unpublished lesson and leaves practising out of archived courses", async () => {
    renderLessons({ course: course(true), outline: [summary(1, false)], lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Een concept.")], { published: false, editing: true })] });
    expect(await screen.findByRole("button", { name: "Preview lesson 1: Lesson title 1" })).toHaveTextContent("Preview");
    cleanup();
    const archived = { ...course(true), status: "archived" as const };
    renderLessons({ course: archived, outline: [summary(1, true, { wordCount: 1, practiceCount: 1 })], lessons: [lesson(1, [practice])] });
    expect(await screen.findByRole("button", { name: "Review the words of lesson 1: Lesson title 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Practise lesson 1 again: Lesson title 1" })).not.toBeInTheDocument();
  });
});
