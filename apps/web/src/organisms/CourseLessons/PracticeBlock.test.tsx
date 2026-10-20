import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseDetailResponse, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LessonView } from "./CourseLessons";
import { AnswerField, joinBlanks, practiceDraftKey, splitBlanks } from "./PracticeBlock";

const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const blockId = "50000000-0000-4000-8000-000000000001";
const editor = { id: accountId, displayName: "Ada" };
const blockPath = `/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId}/blocks/${blockId}`;
const reference = { items: [
  { prompt: "… een kleine keuken.", authorsVersion: ["Er is"], note: "One kitchen." },
  { prompt: "There are two bedrooms.", authorsVersion: ["Er zijn twee slaapkamers."], note: null },
] };
const practiceBlock: LessonTopBlock = {
  id: blockId, type: "practice", children: [],
  props: { data: JSON.stringify({ instruction: "Vul in of vertaal.", passage: null, items: reference.items.map((item) => ({ prompt: item.prompt, authorsVersion: item.authorsVersion })) }) },
};
const document: LessonDocument = { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [practiceBlock] };
const summary = { id: lessonId, slug: "mijn-huis", position: 0, title: "Mijn huis", goal: null, published: true, publishedAt: 1, changed: false, updatedBy: editor, updatedAt: 1, wordCount: 0, practiceCount: 0, imageUrl: null };
const detail = (): CourseDetailResponse => ({
  course: {
    id: courseId, slug: "dutch", groupId, title: "Dutch", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: "published",
    owner: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: null,
    permissions: { edit: false, publish: false, archive: false, removeContent: false, contribute: false, requestContribution: true, leaveContribution: false, manageContributors: false },
  },
  outline: [summary],
  lessons: [{ ...summary, document, practiceProgress: { [blockId]: { done: 3, started: 4, answered: null } }, draft: null, speech: {}, draftSpeech: null, myShares: {} }],
});
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
// Renders the lesson page, with the practice's answers closed.
function renderLesson(value: CourseDetailResponse) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <LessonView groupId={groupId} courseId={courseId} accountId={accountId} detail={value} lessonId={lessonId} dataUpdatedAt={Date.now()} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/groups/${groupId}/courses/${courseId}/lessons/${lessonId}`] }) });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}
// Renders the lesson page and opens the practice's answers.
async function openPractice(value: CourseDetailResponse) {
  renderLesson(value);
  fireEvent.click(await screen.findByRole("button", { name: "Answer" }));
  return screen.findByRole("region", { name: "Answer the practice" });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === `${blockPath}/attempts`) return new Response(null, { status: 204 });
    if (path === `${blockPath}/progress`) return response({ progress: { done: 3, started: 4, answered: (JSON.parse(String(init?.body)) as { answered: number }).answered } });
    if (path.endsWith(`/lessons/${lessonId}`)) return response({ lesson: detail().lessons[0] });
    return response({ status: "signedOut" });
  }));
});
// Answers are checked on the device; no request ever carries one.
const checkRequests = () => vi.mocked(fetch).mock.calls.filter(([path]) => String(path).includes("/check"));
afterEach(() => { expect(checkRequests()).toHaveLength(0); cleanup(); vi.unstubAllGlobals(); });

describe("Practice blocks", () => {
  it("checks a fill-in item blank by blank on the device, moving on with Enter after a match", () => {
    expect(splitBlanks(joinBlanks(["Er ", ""]), 2)).toEqual(["Er ", ""]);
    expect(joinBlanks(["", " "])).toBe("");
    const onAdvance = vi.fn();
    function Field() {
      const [value, setValue] = useState("");
      return <AnswerField question={{ prompt: "… een keuken, … twee kamers.", authorsVersion: ["Er is", "er zijn"] }} label="Your answer"
        value={value} onChange={setValue} minRows={2} onAdvance={onAdvance} />;
    }
    render(<MantineProvider><Field /></MantineProvider>);
    expect(screen.getByRole("group", { name: "Your answer" })).toBeInTheDocument();
    const first = screen.getByLabelText("Blank 1"); const second = screen.getByLabelText("Blank 2");
    first.focus();
    // A blank that misses its entry keeps focus and shows the author's version; Enter again on it moves on.
    fireEvent.change(first, { target: { value: "Daar is" } });
    fireEvent.keyDown(first, { key: "Enter" });
    expect(first).toHaveFocus();
    expect(screen.getByText("Er is · er zijn")).toBeInTheDocument();
    fireEvent.change(first, { target: { value: "er IS" } });
    fireEvent.keyDown(first, { key: "Enter" });
    expect(second).toHaveFocus();
    // The last blank checks the whole item; a match is confirmed and moves on.
    fireEvent.change(second, { target: { value: "er zijn" } });
    fireEvent.keyDown(second, { key: "Enter" });
    expect(screen.getByText("Matches the author’s version")).toBeInTheDocument();
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("places a share control at the left of the answer box, with the author's version under the box", () => {
    function Field() {
      const [value, setValue] = useState("Er is een tuin.");
      return <AnswerField question={{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] }} label="Your answer" value={value} onChange={setValue} minRows={1}
        share={<button type="button" aria-label="Share question 1" />} />;
    }
    render(<MantineProvider><Field /></MantineProvider>);
    const share = screen.getByRole("button", { name: "Share question 1" });
    const field = screen.getByRole("textbox", { name: "Your answer" });
    expect(share.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(field, { target: { value: "Daar is een tuin." } });
    fireEvent.keyDown(field, { key: "Enter" });
    const reference = screen.getByText("Author’s version", { exact: true });
    expect(share.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moves on at once where there is nothing to check", () => {
    const onAdvance = vi.fn();
    function Field() {
      const [value, setValue] = useState("Er is een tuin.");
      return <AnswerField question={{ prompt: "There is a garden.", authorsVersion: [] }} label="Your answer" value={value} onChange={setValue} minRows={1} onAdvance={onAdvance} />;
    }
    render(<MantineProvider><Field /></MantineProvider>);
    fireEvent.keyDown(screen.getByLabelText("Your answer"), { key: "Enter" });
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Author’s version")).not.toBeInTheDocument();
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
  });

  it("lists at most three prompts on the lesson page and keeps the answers closed until the Answer button opens them", async () => {
    const items = ["Een.", "Twee.", "Drie.", "Vier.", "Vijf."].map((prompt) => ({ prompt, authorsVersion: [], note: null }));
    const long: LessonTopBlock = { ...practiceBlock, props: { data: JSON.stringify({ instruction: "Vertaal.", passage: { title: "Mijn huis", content: "Ik woon hier." }, items }) } };
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, document: { ...document, blocks: [long] } }];
    renderLesson(value);
    // Before the answers open, the page shows the instruction and the first three prompts only.
    expect(await screen.findByText("Vertaal.")).toBeInTheDocument();
    for (const prompt of ["Een.", "Twee.", "Drie."]) expect(screen.getByText(prompt)).toBeInTheDocument();
    expect(screen.queryByText("Vier.")).not.toBeInTheDocument();
    expect(screen.getByText("and 2 more questions")).toBeInTheDocument();
    expect(screen.getByText(/3 people done/)).toHaveTextContent("3 people done · 5 questions left");
    expect(screen.queryByRole("button", { name: "Finish later" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ik woon hier.")).not.toBeInTheDocument();
    // The opened answers hold the passage, and show the first question only until it is answered.
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    const opened = await screen.findByRole("region", { name: "Answer the practice" });
    expect(within(opened).getByText("Ik woon hier.")).toBeInTheDocument();
    expect(within(opened).getByLabelText(/^1\. Een\./)).toBeInTheDocument();
    expect(within(opened).queryByLabelText(/^2\. Twee\./)).not.toBeInTheDocument();
    expect(within(opened).getByRole("button", { name: "Finish later" })).toBeInTheDocument();
  });

  it("checks an answer on Enter on the device, celebrating a match and moving focus, or keeping focus to show the author's version", async () => {
    await openPractice(detail());
    const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
    // The answers open on the first unanswered question, and no author's version shows before a check.
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.queryByText("Er is")).not.toBeInTheDocument();
    expect(screen.queryByText("Er zijn twee slaapkamers.")).not.toBeInTheDocument();
    // Shift+Enter keeps a new line and checks nothing.
    fireEvent.change(field, { target: { value: "Daar is" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(screen.queryByText("Author’s version")).not.toBeInTheDocument();
    // A miss keeps focus and shows the author's version as a reference, which stays while the learner edits.
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("Er is")).toBeInTheDocument();
    expect(screen.getByText(/can still be right/)).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "Er is" } });
    expect(screen.getByText(/can still be right/)).toBeInTheDocument();
    // The next question stays hidden until the answer matches.
    expect(screen.queryByLabelText(/^2\. There are two bedrooms\./)).not.toBeInTheDocument();
    // A match is confirmed, the next question is revealed, and focus moves to it.
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("Matches the author’s version")).toBeInTheDocument();
    expect(screen.queryByText(/can still be right/)).not.toBeInTheDocument();
    const second = screen.getByLabelText(/^2\. There are two bedrooms\./);
    expect(second).toHaveFocus();
    // Editing the answer clears the feedback until it is checked again.
    fireEvent.change(field, { target: { value: "Er is een" } });
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
    // A match in the last question moves focus to the dialog's button.
    fireEvent.change(second, { target: { value: "er zijn twee slaapkamers" } });
    fireEvent.keyDown(second, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
  });

  it("shows the author's version under the question it belongs to after a miss", async () => {
    await openPractice(detail());
    const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
    fireEvent.change(field, { target: { value: "Daar is" } });
    fireEvent.keyDown(field, { key: "Enter" });
    const row = field.closest("[data-answer-field]") as HTMLElement;
    expect(within(row).getByText("Er is")).toBeInTheDocument();
    expect(within(row).getByText(/can still be right/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^2\. There are two bedrooms\./)).not.toBeInTheDocument();
  });

  it("moves on with Enter on an empty answer, revealing and focusing the next question", async () => {
    await openPractice(detail());
    const first = screen.getByLabelText(/^1\. … een kleine keuken\./);
    await waitFor(() => expect(first).toHaveFocus());
    expect(screen.queryByLabelText(/^2\. There are two bedrooms\./)).not.toBeInTheDocument();
    fireEvent.keyDown(first, { key: "Enter" });
    expect(screen.getByLabelText(/^2\. There are two bedrooms\./)).toHaveFocus();
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
  });

  it("reveals saved answers through the first question they have not matched, and focuses that one", async () => {
    const items = [{ prompt: "Een.", authorsVersion: ["Eén."] }, { prompt: "Twee.", authorsVersion: ["Twee."] }, { prompt: "Drie.", authorsVersion: ["Drie."] }];
    const three: LessonTopBlock = { ...practiceBlock, props: { data: JSON.stringify({ instruction: "Vertaal.", passage: null, items }) } };
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, document: { ...document, blocks: [three] } }];
    localStorage.setItem(practiceDraftKey(accountId, groupId, "practice-answer", blockId), JSON.stringify({ version: 1, answers: ["Eén.", "Dit is fout.", ""] }));
    const opened = await openPractice(value);
    // The first question matches its saved answer; the second does not, so it is the last one shown and it has focus.
    await waitFor(() => expect(within(opened).getByLabelText(/^2\. Twee\./)).toHaveFocus());
    expect(within(opened).getByLabelText(/^1\. Een\./)).toHaveValue("Eén.");
    expect(within(opened).queryByLabelText(/^3\. Drie\./)).not.toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
  });

  it("shows the focused question's position within the practice as a progress bar", async () => {
    const value = detail();
    localStorage.setItem(practiceDraftKey(accountId, groupId, "practice-answer", blockId), JSON.stringify({ version: 1, answers: ["Er is", ""] }));
    await openPractice(value);
    const bar = () => screen.getByRole("progressbar", { name: "Practice progress" });
    // The dialog opens on the first unanswered question.
    await waitFor(() => expect(screen.getByLabelText(/^2\. There are two bedrooms\./)).toHaveFocus());
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-valuenow", "100");
    fireEvent.focus(screen.getByLabelText(/^1\. … een kleine keuken\./));
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(bar()).toHaveAttribute("aria-valuenow", "50");
  });

  it("has no concealed thread and saves only the answered count when Done closes the dialog", async () => {
    await openPractice(detail());
    expect(screen.getAllByText("Vul in of vertaal.").length).toBeGreaterThan(0);
    for (const gone of [/concealed/, /Reveal answers/, /Author’s version/, /Er zijn twee slaapkamers/]) expect(screen.queryByText(gone)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reveal answers" })).not.toBeInTheDocument();

    // The button reads Finish later while a question is blank and Done once every question has an answer.
    const key = practiceDraftKey(accountId, groupId, "practice-answer", blockId);
    const first = screen.getByLabelText(/^1\. … een kleine keuken\./);
    fireEvent.change(first, { target: { value: "Er is" } });
    fireEvent.keyDown(first, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Finish later" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^2\. There are two bedrooms\./), { target: { value: "Er zijn twee kamers." } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, answers: ["Er is", "Er zijn twee kamers."] }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${blockPath}/progress`, expect.objectContaining({ method: "PUT", body: JSON.stringify({ answered: 2 }) })));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Answer the practice" })).not.toBeInTheDocument());
    // Focus returns to the Answer button, which now reads as closed.
    expect(screen.getByRole("button", { name: "Answer" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Answer" })).toHaveAttribute("aria-expanded", "false");
    // The answers stay in the local draft, so the learner can come back and change them.
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, answers: ["Er is", "Er zijn twee kamers."] });
  });

  it("saves progress when the dialog closes with its close button, and nothing when no question is answered", async () => {
    await openPractice(detail());
    fireEvent.click(screen.getByRole("button", { name: "Finish later" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Answer the practice" })).not.toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalledWith(`${blockPath}/progress`, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(screen.getByRole("button", { name: "Answer" })).toHaveAttribute("aria-expanded", "true");
    const dialog = await screen.findByRole("region", { name: "Answer the practice" });
    fireEvent.change(within(dialog).getByLabelText(/^1\. … een kleine keuken\./), { target: { value: "Er is" } });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${blockPath}/progress`, expect.objectContaining({ method: "PUT", body: JSON.stringify({ answered: 1 }) })));
  });

  it("records each answer check once as a practice attempt, and nothing for an unchanged re-check or an empty answer", async () => {
    await openPractice(detail());
    const attempts = () => vi.mocked(fetch).mock.calls.filter(([path]) => String(path) === `${blockPath}/attempts`)
      .map(([, init]) => { expect(init?.method).toBe("POST"); return JSON.parse(String(init?.body)) as unknown; });
    const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
    await waitFor(() => expect(field).toHaveFocus());
    fireEvent.keyDown(field, { key: "Enter" });
    expect(attempts()).toEqual([]);
    // A miss is recorded once; Enter again on the unchanged answer only moves on.
    fireEvent.change(field, { target: { value: "Daar is" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(attempts()).toEqual([{ item: 0, answer: "Daar is" }]);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(attempts()).toHaveLength(1);
    // A changed answer is checked and recorded again; the client never sends its own match result.
    fireEvent.change(field, { target: { value: "Er is" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(attempts()).toEqual([{ item: 0, answer: "Daar is" }, { item: 0, answer: "Er is" }]);
    // Closing the dialog sends progress only.
    fireEvent.click(screen.getByRole("button", { name: "Finish later" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${blockPath}/progress`, expect.anything()));
    expect(attempts()).toHaveLength(2);
  });

  it("records a fill-in item with several blanks once, at its last blank", async () => {
    const items = [{ prompt: "… een keuken, … twee kamers.", authorsVersion: ["Er is", "er zijn"] }];
    const blanks: LessonTopBlock = { ...practiceBlock, props: { data: JSON.stringify({ instruction: "Vul in.", passage: null, items }) } };
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, document: { ...document, blocks: [blanks] } }];
    await openPractice(value);
    const first = screen.getByLabelText("Blank 1"); const second = screen.getByLabelText("Blank 2");
    fireEvent.change(first, { target: { value: "Er is" } });
    fireEvent.keyDown(first, { key: "Enter" });
    fireEvent.change(second, { target: { value: "er zijn" } });
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/attempts"))).toHaveLength(0);
    fireEvent.keyDown(second, { key: "Enter" });
    const sent = vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/attempts"));
    expect(sent.map(([, init]) => JSON.parse(String(init?.body)) as unknown)).toEqual([{ item: 0, answer: "Er is · er zijn" }]);
  });

  it("keeps going when an attempt cannot be saved", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith("/attempts") ? Promise.reject(new TypeError("offline")) : original(input, init));
    await openPractice(detail());
    const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
    fireEvent.change(field, { target: { value: "Er is" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("Matches the author’s version")).toBeInTheDocument();
    expect(screen.getByLabelText(/^2\. There are two bedrooms\./)).toHaveFocus();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${blockPath}/attempts`, expect.anything()));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Answer the practice" })).toBeInTheDocument();
  });

  it("records nothing in a draft preview or an archived course", async () => {
    const preview = detail(); const lesson = preview.lessons[0]!;
    preview.lessons = [{ ...lesson, published: false, document: null, draft: { document, version: 1 } }];
    preview.outline = [{ ...summary, published: false }];
    const archived = detail(); archived.course = { ...archived.course, status: "archived" };
    for (const value of [preview, archived]) {
      await openPractice(value);
      const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
      fireEvent.change(field, { target: { value: "Daar is" } });
      fireEvent.keyDown(field, { key: "Enter" });
      expect(screen.getByText(/can still be right/)).toBeInTheDocument();
      cleanup();
    }
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/attempts"))).toHaveLength(0);
  });

  it("shows the viewer as done once their count reaches the number of questions", async () => {
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, practiceProgress: { [blockId]: { done: 1, started: 1, answered: 2 } } }];
    await openPractice(value);
    expect(screen.getByText(/1 person done/)).toHaveTextContent("1 person done · You’re done");
  });

  it("shows the Enter hint under the answers of a one-question practice", async () => {
    const one: LessonTopBlock = { ...practiceBlock, props: { data: JSON.stringify({ instruction: "Vertaal.", passage: null, items: [{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] }] }) } };
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, document: { ...document, blocks: [one] } }];
    await openPractice(value);
    expect(screen.getByText(/Your answers stay on this device/)).toHaveTextContent("Press Enter to check, Shift+Enter for a new line.");
  });

  it("does not show the Enter hint for a practice with two or more questions, and keeps the device note", async () => {
    await openPractice(detail());
    expect(screen.getByText(/Your answers stay on this device/)).toHaveTextContent("Your answers stay on this device, so you can come back and change them.");
    expect(screen.queryByText(/Press Enter to check/)).not.toBeInTheDocument();
  });
});
