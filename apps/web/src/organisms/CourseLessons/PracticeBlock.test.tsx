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
  lessons: [{ ...summary, document, practiceProgress: { [blockId]: { done: 3, started: 4, answered: null } }, draft: null, speech: {}, draftSpeech: null }],
});
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
// Renders the lesson page and opens the practice's answer dialog, which is closed by default.
async function openPractice(value: CourseDetailResponse) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <LessonView groupId={groupId} courseId={courseId} accountId={accountId} detail={value} lessonId={lessonId} dataUpdatedAt={Date.now()} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/groups/${groupId}/courses/${courseId}/lessons/${lessonId}`] }) });
  render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Answer" }));
  return screen.findByRole("dialog", { name: "Answer the practice" });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
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

  it("lists at most three prompts on the lesson page and keeps the answer set in a closed dialog", async () => {
    const items = ["Een.", "Twee.", "Drie.", "Vier.", "Vijf."].map((prompt) => ({ prompt, authorsVersion: [], note: null }));
    const long: LessonTopBlock = { ...practiceBlock, props: { data: JSON.stringify({ instruction: "Vertaal.", passage: { title: "Mijn huis", content: "Ik woon hier." }, items }) } };
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, document: { ...document, blocks: [long] } }];
    const dialog = openPractice(value);
    // Before the dialog opens, the page shows the instruction and the first three prompts only.
    expect(await screen.findByText("Vertaal.")).toBeInTheDocument();
    for (const prompt of ["Een.", "Twee.", "Drie."]) expect(screen.getByText(prompt)).toBeInTheDocument();
    expect(screen.queryByText("Vier.")).not.toBeInTheDocument();
    expect(screen.getByText("and 2 more questions")).toBeInTheDocument();
    expect(screen.getByText(/3 people done/)).toHaveTextContent("3 people done · 5 questions left");
    expect(screen.queryByRole("button", { name: "Finish later" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ik woon hier.")).not.toBeInTheDocument();
    // The dialog holds the passage and one answer field per prompt.
    const opened = await dialog;
    expect(within(opened).getByText("Ik woon hier.")).toBeInTheDocument();
    expect(within(opened).getByLabelText(/^5\. Vijf\./)).toBeInTheDocument();
    expect(within(opened).getByRole("button", { name: "Finish later" })).toBeInTheDocument();
  });

  it("checks an answer on Enter on the device, celebrating a match and moving focus, or keeping focus to show the author's version", async () => {
    await openPractice(detail());
    const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
    const second = screen.getByLabelText(/^2\. There are two bedrooms\./);
    // The dialog opens on the first unanswered question, and no author's version shows before a check.
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
    // A match is confirmed and focus moves to the next question.
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("Matches the author’s version")).toBeInTheDocument();
    expect(screen.queryByText(/can still be right/)).not.toBeInTheDocument();
    expect(second).toHaveFocus();
    // Editing the answer clears the feedback until it is checked again.
    fireEvent.change(field, { target: { value: "Er is een" } });
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
    // A match in the last question moves focus to the dialog's button.
    fireEvent.change(second, { target: { value: "er zijn twee slaapkamers" } });
    fireEvent.keyDown(second, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
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
    fireEvent.change(screen.getByLabelText(/^1\. … een kleine keuken\./), { target: { value: "Er is" } });
    expect(screen.getByRole("button", { name: "Finish later" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^2\. There are two bedrooms\./), { target: { value: "Er zijn twee kamers." } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, answers: ["Er is", "Er zijn twee kamers."] }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${blockPath}/progress`, expect.objectContaining({ method: "PUT", body: JSON.stringify({ answered: 2 }) })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Answer the practice" })).not.toBeInTheDocument());
    // The answers stay in the local draft, so the learner can come back and change them.
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, answers: ["Er is", "Er zijn twee kamers."] });
  });

  it("saves progress when the dialog closes with its close button, and nothing when no question is answered", async () => {
    await openPractice(detail());
    fireEvent.click(screen.getByRole("button", { name: "Finish later" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Answer the practice" })).not.toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalledWith(`${blockPath}/progress`, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    const dialog = await screen.findByRole("dialog", { name: "Answer the practice" });
    fireEvent.change(within(dialog).getByLabelText(/^1\. … een kleine keuken\./), { target: { value: "Er is" } });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${blockPath}/progress`, expect.objectContaining({ method: "PUT", body: JSON.stringify({ answered: 1 }) })));
  });

  it("shows the viewer as done once their count reaches the number of questions", async () => {
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, practiceProgress: { [blockId]: { done: 1, started: 1, answered: 2 } } }];
    await openPractice(value);
    expect(screen.getByText(/1 person done/)).toHaveTextContent("1 person done · You’re done");
  });
});
