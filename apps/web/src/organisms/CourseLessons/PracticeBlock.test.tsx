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
  props: { data: JSON.stringify({ instruction: "Vul in of vertaal.", passage: null, items: reference.items.map((item) => ({ prompt: item.prompt, authorsVersion: [], note: null })) }) },
};
const document: LessonDocument = { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [practiceBlock] };
const summary = { id: lessonId, position: 0, title: "Mijn huis", goal: null, published: true, publishedAt: 1, changed: false, updatedBy: editor, updatedAt: 1 };
const detail = (): CourseDetailResponse => ({
  course: {
    id: courseId, groupId, title: "Dutch", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: "published",
    owner: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: null,
    permissions: { edit: false, publish: false, archive: false, removeContent: false, contribute: false, requestContribution: true, leaveContribution: false, manageContributors: false },
  },
  outline: [summary],
  lessons: [{ ...summary, document, answerCounts: { [blockId]: 3 }, draft: null, speech: {}, draftSpeech: null }],
});
const answer = {
  id: "60000000-0000-4000-8000-000000000001", parentId: null, kind: "practice_response", body: null, author: { id: accountId, displayName: "Ada", avatarUrl: null },
  createdAt: 1, updatedAt: 1, edited: false, pinned: false, reactions: [], replies: [], permissions: { edit: true, delete: true, reply: true, pin: false },
  responseItems: [{ position: 0, prompt: "… een kleine keuken.", answer: "Er is", skipped: false, matched: null }, { position: 1, prompt: "There are two bedrooms.", answer: "", skipped: true, matched: null }],
};

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
    if (path === `${blockPath}/discussion`) return response({ items: [answer], count: 1, quickReactions: ["👍", "❤️", "😂"], reference });
    if (path === `${blockPath}/comments` && init?.method === "POST") return response({ item: answer }, 201);
    if (path === `${blockPath}/check`) {
      const match = (JSON.parse(String(init?.body)) as { answer: string }).answer === "Er is";
      return response({ match, authorsVersion: match ? null : ["Er is"] });
    }
    if (path.endsWith(`/lessons/${lessonId}`)) return response({ lesson: detail().lessons[0] });
    return response({ status: "signedOut" });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Practice blocks", () => {
  it("answers a fill-in item blank by blank, moving on with Enter and checking after the last blank", async () => {
    expect(splitBlanks(joinBlanks(["Er ", ""]), 2)).toEqual(["Er ", ""]);
    expect(joinBlanks(["", " "])).toBe("");
    const onAdvance = vi.fn();
    function Field() {
      const [value, setValue] = useState("");
      return <AnswerField scope={{ groupId, courseId, lessonId, accountId }} blockId={blockId} item={0} prompt="… een keuken, … twee kamers." label="Your answer"
        value={value} onChange={setValue} minRows={2} onAdvance={onAdvance} />;
    }
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(<MantineProvider><QueryClientProvider client={queryClient}><Field /></QueryClientProvider></MantineProvider>);
    expect(screen.getByRole("group", { name: "Your answer" })).toBeInTheDocument();
    const first = screen.getByLabelText("Blank 1"); const second = screen.getByLabelText("Blank 2");
    first.focus();
    fireEvent.change(first, { target: { value: "Er is" } });
    fireEvent.keyDown(first, { key: "Enter" });
    expect(second).toHaveFocus();
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => path === `${blockPath}/check`)).toHaveLength(0);
    fireEvent.change(second, { target: { value: "er zijn" } });
    fireEvent.keyDown(second, { key: "Enter" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${blockPath}/check`, expect.objectContaining({ body: JSON.stringify({ item: 0, answer: "Er is · er zijn" }) })));
    // Once the check settles, Enter on the unchanged answer moves on.
    await waitFor(() => { fireEvent.keyDown(second, { key: "Enter" }); expect(onAdvance).toHaveBeenCalledTimes(1); });
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => path === `${blockPath}/check`)).toHaveLength(1);
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
    expect(screen.getByText("3 answers shared")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish answer set" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ik woon hier.")).not.toBeInTheDocument();
    // The dialog holds the passage and one answer field per prompt.
    const opened = await dialog;
    expect(within(opened).getByText("Ik woon hier.")).toBeInTheDocument();
    expect(within(opened).getByLabelText(/^5\. Vijf\./)).toBeInTheDocument();
    expect(within(opened).getByRole("button", { name: "Publish answer set" })).toBeInTheDocument();
  });

  it("checks an answer on Enter, celebrating a match and showing the author's version for a miss", async () => {
    await openPractice(detail());
    const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
    const checks = () => vi.mocked(fetch).mock.calls.filter(([path]) => path === `${blockPath}/check`);
    // Shift+Enter keeps a new line and checks nothing.
    fireEvent.change(field, { target: { value: "Daar is" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(checks()).toHaveLength(0);
    // A miss shows the author's version as a reference, which stays while the learner edits.
    fireEvent.keyDown(field, { key: "Enter" });
    expect(await screen.findByText("Er is")).toBeInTheDocument();
    expect(screen.getByText(/can still be right/)).toBeInTheDocument();
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "Er is" } });
    expect(screen.getByText(/can still be right/)).toBeInTheDocument();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(await screen.findByText("Matches the author’s version")).toBeInTheDocument();
    expect(screen.queryByText(/can still be right/)).not.toBeInTheDocument();
    expect(checks()[1]![1]).toMatchObject({ method: "POST", body: JSON.stringify({ item: 0, answer: "Er is" }) });
    // Editing the answer clears the feedback until it is checked again.
    fireEvent.change(field, { target: { value: "Er is een" } });
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
  });

  it("shows prompts concealed, keeps a local answer draft, and reveals the thread with the author's version after publishing", async () => {
    await openPractice(detail());
    expect(screen.getAllByText("Vul in of vertaal.").length).toBeGreaterThan(0);
    expect(screen.getByText("3 answers are concealed")).toBeInTheDocument();
    expect(screen.queryByText("Er zijn twee slaapkamers.")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(`${blockPath}/discussion`, expect.anything());

    fireEvent.change(screen.getByLabelText(/^1\. … een kleine keuken\./), { target: { value: "Er is" } });
    const key = practiceDraftKey(accountId, groupId, "practice-answer", blockId);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, answers: ["Er is", ""] }));
    fireEvent.click(screen.getByRole("button", { name: "Publish answer set" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${blockPath}/comments`, expect.objectContaining({
      method: "POST", body: JSON.stringify({ kind: "practice_response", answers: ["Er is", ""] }),
    })));
    expect(await screen.findByText("Er zijn twee slaapkamers.")).toBeInTheDocument();
    expect(screen.getByText("One kitchen.")).toBeInTheDocument();
    expect(screen.getByText("No answer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pin/i })).not.toBeInTheDocument();
    expect(localStorage.getItem(key)).toBeNull();
    // Concealing again hides the reference.
    fireEvent.click(screen.getByRole("button", { name: "Conceal answers" }));
    expect(screen.queryByText("Er zijn twee slaapkamers.")).not.toBeInTheDocument();
  });

  it("reveals without answering", async () => {
    await openPractice(detail());
    fireEvent.click(screen.getByRole("button", { name: "Reveal answers" }));
    expect(await screen.findByText("Er zijn twee slaapkamers.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(`${blockPath}/comments`, expect.anything());
  });
});
