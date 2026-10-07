import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseDetailResponse, type CourseLesson, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { CourseLessons } from "./CourseLessons";

const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = (n: number) => `40000000-0000-4000-8000-00000000000${n}`;
const editor = { id: accountId, displayName: "Ada" };
const course = (edit: boolean, contribute = edit) => ({
  id: courseId, groupId, title: "Dutch Foundations", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: "published" as const,
  owner: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, contribution: !edit && contribute ? "active" as const : null,
  permissions: { edit, publish: edit, archive: edit, removeContent: edit, contribute, requestContribution: false, leaveContribution: !edit && contribute, manageContributors: edit },
});
const summary = (n: number, published = true) => ({
  id: lessonId(n), position: n - 1, title: `Lesson title ${n}`, goal: null, published, publishedAt: published ? 1 : null, changed: false, updatedBy: editor, updatedAt: 1,
});
const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const example = (id: string, sentence: string, translation = ""): LessonTopBlock =>
  ({ id, type: "example", props: { translation, note: "" }, content: text(sentence), children: [] });
const dialogue: LessonTopBlock = {
  id: "50000000-0000-4000-8000-000000000002", type: "dialogue", props: { turns: JSON.stringify([{ speaker: "A", text: "Is er een tuin?" }, { speaker: "B", text: "Nee." }]) }, children: [],
};
const practice: LessonTopBlock = {
  id: "50000000-0000-4000-8000-000000000003", type: "practice",
  props: { data: JSON.stringify({ instruction: "Translate.", passage: null, items: [{ prompt: "There is a garden.", authorsVersion: [], note: null }, { prompt: "No.", authorsVersion: [], note: null }] }) },
  children: [],
};
const doc = (blocks: LessonTopBlock[]): LessonDocument => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks });
// Readers receive the published document only; editors also receive the draft.
const lesson = (n: number, blocks: LessonTopBlock[] = [], { published = true, editing = false } = {}): CourseLesson => ({
  ...summary(n, published), document: published ? doc(blocks) : null, answerCounts: {}, draft: editing ? { document: doc(blocks), version: 1 } : null,
});
const progress = (completedLessonIds: string[], positions: unknown[] = []) => ({
  publishedLessons: 4, completedLessonIds, positions,
  participants: [{ user: { id: accountId, displayName: "Ada", avatarUrl: null }, completedLessons: completedLessonIds.length, percent: completedLessonIds.length * 25 }],
});

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function renderLessons(detail: CourseDetailResponse) {
  // Mirrors the application's stale time, so preloaded lessons are not refetched on mount.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><CourseLessons groupId={groupId} courseId={courseId} accountId={accountId} detail={detail} dataUpdatedAt={Date.now()} /></QueryClientProvider></MantineProvider>);
}

const lessonFour = lesson(4, [example("50000000-0000-4000-8000-000000000004", "Ik stap over.")]);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith("/progress")) return response(progress([]));
    if (path.endsWith("/words")) return response({ words: [] });
    if (path.endsWith("/completion") && init?.method === "PUT") return response(progress([lessonId(1)]));
    if (path.endsWith("/position") && init?.method === "PUT") {
      return response({ position: { lessonId: lessonId(1), stepKey: JSON.parse(String(init.body)).stepKey, stepIndex: 0, passedSteps: 0, totalSteps: 1, updatedAt: 1 } });
    }
    if (path.endsWith(`/lessons/${lessonId(4)}`)) return response({ lesson: lessonFour });
    return response({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Course lessons", () => {
  it("renders the published document for readers and loads later lessons by ID", async () => {
    const detail = { course: course(false), outline: [1, 2, 3, 4].map((n) => summary(n)), lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.", "There is a balcony."), dialogue]), lesson(2), lesson(3)] };
    renderLessons(detail);
    expect(screen.getByRole("heading", { name: "Lesson title 1", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Er is een balkon.")).toBeInTheDocument();
    expect(screen.getByText("There is a balcony.")).toBeInTheDocument();
    expect(screen.getByText("Is er een tuin?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Lesson title 4" })).not.toBeInTheDocument();
    // Preloaded lessons are not fetched again; only the viewer's progress and course recap load.
    expect(vi.mocked(fetch).mock.calls.map(([path]) => String(path)).sort()).toEqual([`/api/groups/${groupId}/courses/${courseId}/progress`, `/api/groups/${groupId}/courses/${courseId}/words`]);
    // A viewer with no finished words is not offered a recap.
    await waitFor(() => expect(vi.mocked(fetch).mock.results).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Review words" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue with lesson 4: Lesson title 4" }));
    expect(await screen.findByText("Ik stap over.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(4)}`, expect.anything());
  });

  it("shows editors the draft of an unpublished lesson as a preview", () => {
    renderLessons({ course: course(true), outline: [summary(1, false)], lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Een concept.")], { published: false, editing: true })] });
    expect(screen.getAllByText("Unpublished").length).toBeGreaterThan(0);
    expect(screen.getByText("Een concept.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit lesson 1" })).toBeInTheDocument();
  });

  it("lets a contributor edit content but not reorder or change details of a published lesson", () => {
    renderLessons({ course: course(false, true), outline: [summary(1)], lessons: [lesson(1, [example("50000000-0000-4000-8000-000000000001", "Er is een balkon.")], { editing: true })] });
    expect(screen.getByRole("button", { name: "Edit lesson 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move lesson 1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
  });

  it("steps through a lesson one sentence and question at a time and records completion", async () => {
    let shared: unknown = null;
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith(`/blocks/${practice.id}/comments`) && init?.method === "POST") {
        shared = JSON.parse(String(init.body));
        return response({ item: { id: "60000000-0000-4000-8000-000000000001", parentId: null, kind: "practice_response", author: { id: accountId, displayName: "Ada", avatarUrl: null }, body: null, createdAt: 1, updatedAt: 1, edited: false, pinned: false, responseItems: [], reactions: [], replies: [], permissions: { reply: true, edit: true, delete: true, pin: false } } }, 201);
      }
      return original(input, init);
    });
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

    // Dialogue lines arrive one after another.
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText("Is er een tuin?")).toBeInTheDocument();
    expect(within(dialog).queryByText("Nee.")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText("Nee.")).toBeInTheDocument();
    expect(meter()).toHaveAttribute("aria-valuenow", "40");
    // Each move saves the step now shown, keyed by its block and line.
    const saved = () => vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/position")).map(([, init]) => JSON.parse(String(init?.body)).stepKey);
    await waitFor(() => expect(saved()).toEqual([`${dialogue.id}:0`, `${dialogue.id}:1`]));

    // Practice items are asked one by one and share the practice draft.
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText("Question 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByText("There is a garden.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Your answer"), { target: { value: "Er is een tuin." } });
    expect(JSON.parse(localStorage.getItem(`wordinator:draft:v1:${accountId}:${groupId}:practice-answer:${practice.id}`)!)).toEqual({ version: 1, answers: ["Er is een tuin.", ""] });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText("Question 2 of 2")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Share my answers" }));
    expect(await within(dialog).findByText("Shared with the group.")).toBeInTheDocument();
    expect(shared).toEqual({ kind: "practice_response", answers: ["Er is een tuin.", ""] });

    fireEvent.click(within(dialog).getByRole("button", { name: "Finish lesson" }));
    expect(await within(dialog).findByText("You have finished 1 of 4 lessons (25%).")).toBeInTheDocument();
    expect(meter()).toHaveAttribute("aria-valuenow", "100");
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
    // Prose, example, both dialogue lines, both practice items, and a words-only section.
    const expected = ["de hond", "de kat", "de tuin", "de tuin", "vertalen", "vertalen", "het huis"];
    for (const [index, term] of expected.entries()) {
      expect(within(dialog).getByText(`Step ${index + 1} of 7`)).toBeInTheDocument();
      expect(panel()).toHaveTextContent(term);
      expect(panel()).toHaveTextContent(`meaning of ${term}`);
      expect(within(dialog).getAllByRole("region", { name: "New words" })).toHaveLength(1);
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
      { id: "70000000-0000-4000-8000-000000000001", lessonId: lessonId(1), term: "de hond", meaning: "the dog", forms: "de honden", example: null, note: null },
      { id: "70000000-0000-4000-8000-000000000002", lessonId: lessonId(1), term: "de kat", meaning: "the cat", forms: null, example: null, note: null },
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
    fireEvent.click(await screen.findByRole("button", { name: "Start lesson 1" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Finish lesson" }));
    expect(await within(dialog).findByText("This lesson is unpublished, so finishing it does not count toward progress.")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/completion") || String(path).endsWith("/position"))).toBe(false);
  });

  it("resumes an unfinished lesson at the saved step and can start over", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    const saved = { lessonId: lessonId(1), stepKey: `${practice.id}:0`, stepIndex: 3, passedSteps: 3, totalSteps: 5, updatedAt: 1 };
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith("/progress") ? response(progress([], [saved])) : original(input, init));
    // The example moved one step later since the position was saved; the key still finds the same question.
    const first = lesson(1, [example("50000000-0000-4000-8000-000000000009", "Nieuw."), example("50000000-0000-4000-8000-000000000001", "Er is een balkon."), dialogue, practice]);
    renderLessons({ course: course(false), outline: [1, 2].map((n) => summary(n)), lessons: [first, lesson(2)] });
    expect(await screen.findByText("Pick up where you left off: lesson 1, Lesson title 1, step 4 of 5.")).toBeInTheDocument();
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
