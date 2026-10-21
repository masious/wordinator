import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseDetailResponse, type LessonDocument, type LessonTopBlock } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LessonView } from "./CourseLessons";
import { AnswerField, AnswerSetComposer, joinBlanks, practiceDraftKey, practiceFromBlock, splitBlanks } from "./PracticeBlock";
import { wordOrderWords } from "./wordOrder";

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

// A word-order question (first) and an ordinary one, as the lesson page shows them.
const orderItems = [
  { prompt: "Put in order: koffie / ik / altijd / drink", authorsVersion: ["Ik drink altijd koffie."], note: null },
  { prompt: "There are two bedrooms.", authorsVersion: ["Er zijn twee slaapkamers."], note: null },
];
function orderDetail(): CourseDetailResponse {
  const value = detail();
  const data = JSON.stringify({ instruction: "Put the words in the right order.", passage: null, items: orderItems.map(({ prompt, authorsVersion }) => ({ prompt, authorsVersion })) });
  const block: LessonTopBlock = { id: blockId, type: "practice", children: [], props: { data } };
  value.lessons = [{ ...value.lessons[0]!, document: { ...document, blocks: [block] } }];
  return value;
}
// The first word-order question on its own, with its chips' current order.
function OrderField({ initial = "", onChange, onAdvance }: { initial?: string; onChange?: (value: string) => void; onAdvance?: () => void }) {
  const [value, setValue] = useState(initial);
  return <AnswerField question={orderItems[0]!} label="Your answer" value={value} minRows={1} onAdvance={onAdvance}
    onChange={(next) => { setValue(next); onChange?.(next); }} />;
}
const chipOrder = () => Array.from(window.document.querySelectorAll("[data-word-chip]"), (chip) => chip.textContent);

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

  it("places a share control at the right of the answer box, with the author's version under the box", () => {
    function Field() {
      const [value, setValue] = useState("Er is een tuin.");
      return <AnswerField question={{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] }} label="Your answer" value={value} onChange={setValue} minRows={1}
        share={<button type="button" aria-label="Share question 1" />} />;
    }
    render(<MantineProvider><Field /></MantineProvider>);
    const share = screen.getByRole("button", { name: "Share question 1" });
    const field = screen.getByRole("textbox", { name: "Your answer" });
    expect(field.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("detects a word-order question by its prompt prefix only", () => {
    expect(wordOrderWords("Put in order: koffie / ik / altijd / drink")).toEqual(["koffie", "ik", "altijd", "drink"]);
    expect(wordOrderWords("Put in order:  Noor / vaak / kookt ")).toEqual(["Noor", "vaak", "kookt"]);
    expect(wordOrderWords("Ik drink altijd koffie.")).toBeNull();
    expect(wordOrderWords("Ik zet nu put in order: de koffie.")).toBeNull();
    expect(wordOrderWords("Put in order:")).toBeNull();
    expect(wordOrderWords("… een kleine keuken.")).toBeNull();
  });

  it("shows the words of a word-order question as chips in the pool, in the prompt's order, instead of a text field", () => {
    const onChange = vi.fn();
    render(<MantineProvider><OrderField onChange={onChange} /></MantineProvider>);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(chipOrder()).toEqual(["koffie", "ik", "altijd", "drink"]);
    expect(within(screen.getByRole("list", { name: "Pieces" })).getAllByRole("button")).toHaveLength(4);
    expect(within(screen.getByRole("list", { name: "Your sentence" })).queryAllByRole("button")).toHaveLength(0);
    // Nothing is placed yet, so the question is unanswered.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("places chips by clicking and reorders them with the arrow keys, and the answer is set only once every word is placed", () => {
    const onChange = vi.fn();
    render(<MantineProvider><OrderField onChange={onChange} /></MantineProvider>);
    for (const word of ["ik", "altijd", "koffie"]) fireEvent.click(screen.getByRole("button", { name: `Add “${word}”` }));
    // A partial board is still unanswered.
    expect(onChange).toHaveBeenLastCalledWith("");
    fireEvent.click(screen.getByRole("button", { name: "Add “drink”" }));
    expect(chipOrder()).toEqual(["ik", "altijd", "koffie", "drink"]);
    expect(onChange).toHaveBeenLastCalledWith("ik altijd koffie drink");
    // Focus follows the moved word to its new place.
    fireEvent.keyDown(screen.getByRole("button", { name: "Remove “altijd”, place 2" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("ik koffie altijd drink");
    expect(screen.getByRole("button", { name: "Remove “altijd”, place 3" })).toHaveFocus();
    // Removing a word returns it to the pool and clears the answer again.
    fireEvent.click(screen.getByRole("button", { name: "Remove “drink”, place 4" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("button", { name: "Add “drink”" })).toBeInTheDocument();
  });

  it("reorders word chips by dragging within the answer row", () => {
    const onChange = vi.fn();
    render(<MantineProvider><OrderField onChange={onChange} /></MantineProvider>);
    for (const word of ["koffie", "ik", "altijd", "drink"]) fireEvent.click(screen.getByRole("button", { name: `Add “${word}”` }));
    const transfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    fireEvent.dragStart(screen.getByRole("button", { name: "Remove “ik”, place 2" }), { dataTransfer: transfer });
    fireEvent.dragOver(screen.getByRole("button", { name: "Remove “drink”, place 4" }), { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole("button", { name: "Remove “drink”, place 4" }), { dataTransfer: transfer });
    expect(onChange).toHaveBeenLastCalledWith("koffie altijd drink ik");
  });

  it("checks the current order on Enter on a placed word and shows the author's version under the board after a miss", () => {
    const onAdvance = vi.fn();
    render(<MantineProvider><OrderField onAdvance={onAdvance} /></MantineProvider>);
    // Enter on an untouched board's pool word places nothing and checks nothing (the browser clicks the chip).
    fireEvent.keyDown(screen.getByRole("button", { name: "Add “koffie”" }), { key: "Enter" });
    expect(onAdvance).not.toHaveBeenCalled();
    for (const word of ["koffie", "ik", "altijd", "drink"]) fireEvent.click(screen.getByRole("button", { name: `Add “${word}”` }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Remove “koffie”, place 1" }), { key: "Enter" });
    expect(screen.getByText("Author’s version")).toBeInTheDocument();
    expect(screen.getByText("Ik drink altijd koffie.")).toBeInTheDocument();
    // A miss stays on the question.
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("restores a saved order, and shows an empty board when the saved answer is not these words", () => {
    const onChange = vi.fn();
    const { unmount } = render(<MantineProvider><OrderField initial="altijd koffie ik drink" onChange={onChange} /></MantineProvider>);
    expect(chipOrder()).toEqual(["altijd", "koffie", "ik", "drink"]);
    expect(screen.getByRole("button", { name: "Remove “altijd”, place 1" })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    render(<MantineProvider><OrderField initial="wat is dit" onChange={onChange} /></MantineProvider>);
    expect(screen.getAllByRole("button", { name: /^Add / })).toHaveLength(4);
    // The stale answer is cleared, so it does not count as answered.
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("moves a word-order question on a match, revealing and focusing the next question", async () => {
    await openPractice(orderDetail());
    for (const word of ["ik", "drink", "altijd", "koffie"]) fireEvent.click(await screen.findByRole("button", { name: `Add “${word}”` }));
    expect(chipOrder()).toEqual(["ik", "drink", "altijd", "koffie"]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Remove “drink”, place 2" }), { key: "Enter" });
    expect(screen.getByText("Put in order: koffie / ik / altijd / drink").closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryAccepted/));
    const second = screen.getByLabelText(/^2\. There are two bedrooms\./);
    await waitFor(() => expect(second).toHaveFocus());
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
    expect(screen.queryByText(/people done/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish later" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ik woon hier.")).not.toBeInTheDocument();
    // The opened answers hold the passage, and show the first question only until it is answered.
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    const opened = await screen.findByRole("region", { name: "Answer the practice" });
    expect(screen.getByText("Vier.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Answer" })).not.toBeInTheDocument();
    expect(within(opened).getByText("Ik woon hier.")).toBeInTheDocument();
    expect(within(opened).getByRole("heading", { name: "Een." })).toBeInTheDocument();
    expect(within(opened).getByLabelText(/^1\. Een\./)).toBeInTheDocument();
    expect(within(opened).queryByLabelText(/^2\. Twee\./)).not.toBeInTheDocument();
    expect(within(opened).getByRole("button", { name: "Skip this question" })).toBeInTheDocument();
    expect(within(opened).getByRole("button", { name: "Finish later" })).toBeInTheDocument();
    expect(within(opened).queryByText(/Your answers stay on this device/)).not.toBeInTheDocument();
  });

  it("keeps every prompt visible in the non-staged answer set", () => {
    render(<MantineProvider><AnswerSetComposer scope={{ groupId, courseId, lessonId, accountId }} block={practiceFromBlock(practiceBlock, {})} onDone={vi.fn()} /></MantineProvider>);
    expect(screen.getByRole("heading", { name: "Your answer set" })).toBeInTheDocument();
    expect(screen.getByText(/^1\. … een kleine keuken\.$/, { selector: "label" })).toBeVisible();
    expect(screen.getByText(/^2\. There are two bedrooms\.$/, { selector: "label" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "… een kleine keuken." })).not.toBeInTheDocument();
    const first = screen.getByLabelText(/^1\. … een kleine keuken\./);
    const firstRow = first.closest("[data-answer-field]") as HTMLElement;
    fireEvent.change(first, { target: { value: "Er is" } });
    fireEvent.keyDown(first, { key: "Enter" });
    expect(within(firstRow).getByRole("textbox")).toBeInTheDocument();
    expect(within(firstRow).getByText("Matches the author’s version")).toBeInTheDocument();
    expect(screen.getByText(/^1\. … een kleine keuken\.$/, { selector: "label" })).toBeVisible();
    expect(screen.getByLabelText(/^2\. There are two bedrooms\./)).toHaveFocus();
  });

  it("checks an answer on Enter on the device, celebrating a match and moving focus, or keeping focus to show the author's version", async () => {
    await openPractice(detail());
    const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
    const firstRow = field.closest("[data-answer-field]") as HTMLElement;
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
    expect(screen.getAllByText("… een kleine keuken.")[0]?.closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryActive/));
    expect(screen.getByRole("button", { name: "Skip this question" })).toBeInTheDocument();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
    expect(screen.queryByText(/can still be right/)).not.toBeInTheDocument();
    expect(within(firstRow).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^1\. … een kleine keuken\./)).not.toBeInTheDocument();
    expect(screen.getByText("… een kleine keuken.").closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryAccepted/));
    expect(screen.queryByRole("button", { name: "Share question 1" })).not.toBeInTheDocument();
    const second = screen.getByLabelText(/^2\. There are two bedrooms\./);
    const secondRow = second.closest("[data-answer-field]") as HTMLElement;
    expect(second).toHaveFocus();
    // A match in the last question moves focus to the dialog's button.
    fireEvent.change(second, { target: { value: "er zijn twee slaapkamers" } });
    fireEvent.keyDown(second, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
    expect(within(secondRow).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("checks the active answer with Check, offers Next after a miss, and keeps Finish later last in the footer", async () => {
    const opened = await openPractice(detail());
    const field = screen.getByLabelText(/^1\. … een kleine keuken\./);
    const check = within(opened).getByRole("button", { name: "Check" });
    expect(check).toBeDisabled();
    fireEvent.change(field, { target: { value: "Daar is" } });
    fireEvent.click(check);
    expect(screen.getByText("Er is")).toBeInTheDocument();
    expect(within(opened).queryByRole("button", { name: "Check" })).not.toBeInTheDocument();
    const buttons = within(opened).getAllByRole("button").filter((button) => button.closest("form") && !button.closest("[data-answer-field]"));
    expect(buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["Next question", "Skip this question", "Finish later"]);
    fireEvent.click(within(opened).getByRole("button", { name: "Next question" }));
    expect(screen.getByLabelText(/^2\. There are two bedrooms\./)).toBeInTheDocument();
    // A matching answer checked with the button advances without Next.
    const second = screen.getByLabelText(/^2\. There are two bedrooms\./);
    fireEvent.change(second, { target: { value: "Er zijn twee slaapkamers." } });
    fireEvent.click(within(opened).getByRole("button", { name: "Check" }));
    expect(within(opened).getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(within(opened).queryByRole("button", { name: "Finish later" })).not.toBeInTheDocument();
  });

  it("skips an empty question without recording an attempt or progress", async () => {
    const value = detail();
    await openPractice(value);
    fireEvent.click(screen.getByRole("button", { name: "Skip this question" }));
    expect(screen.getByLabelText(/^2\. There are two bedrooms\./)).toHaveFocus();
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/attempts"))).toHaveLength(0);
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path) === `${blockPath}/progress`)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Finish later" }));
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path) === `${blockPath}/progress`)).toHaveLength(0);
  });

  it("preserves a typed answer draft when skipping and advances without submitting it", async () => {
    const key = practiceDraftKey(accountId, groupId, "practice-answer", blockId);
    await openPractice(detail());
    const first = screen.getByLabelText(/^1\. … een kleine keuken\./);
    fireEvent.change(first, { target: { value: "unfinished answer" } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, answers: ["unfinished answer", ""] }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this question" }));
    expect(screen.getByLabelText(/^2\. There are two bedrooms\./)).toHaveFocus();
    expect(screen.queryByLabelText(/^1\. … een kleine keuken\./)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip this question" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, answers: ["unfinished answer", ""] });
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/attempts"))).toHaveLength(0);
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path) === `${blockPath}/progress`)).toHaveLength(0);
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
    expect(within(screen.getByRole("region", { name: "Answer the practice" })).getByRole("heading", { name: "There are two bedrooms." })).toBeInTheDocument();
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
    expect(within(opened).queryByLabelText(/^1\. Een\./)).not.toBeInTheDocument();
    expect(screen.getByText("Een.").closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryAccepted/));
    expect(within(opened).queryByLabelText(/^3\. Drie\./)).not.toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
  });

  it("shows restored accepted prompts and the active fifth prompt, then skips the last question to the footer", async () => {
    const items = ["Een.", "Twee.", "Drie.", "Vier.", "Vijf."].map((prompt) => ({ prompt, authorsVersion: [prompt] }));
    const five: LessonTopBlock = { ...practiceBlock, props: { data: JSON.stringify({ instruction: "Vertaal.", passage: null, items }) } };
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, document: { ...document, blocks: [five] } }];
    const key = practiceDraftKey(accountId, groupId, "practice-answer", blockId);
    localStorage.setItem(key, JSON.stringify({ version: 1, answers: ["Een.", "Twee.", "Drie.", "Vier.", ""] }));
    const opened = await openPractice(value);
    await waitFor(() => expect(within(opened).getByLabelText(/^5\. Vijf\./)).toHaveFocus());
    for (const prompt of ["Een.", "Twee.", "Drie.", "Vier."]) {
      expect(screen.getByText(prompt).closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryAccepted/));
    }
    expect(screen.getAllByText("Vijf.")[0]?.closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryActive/));
    expect(within(opened).getByText("Question 5 of 5")).toBeInTheDocument();
    expect(within(opened).getAllByRole("progressbar", { name: "Practice progress" })).toHaveLength(1);
    expect(within(opened).queryByLabelText(/^4\. Vier\./)).not.toBeInTheDocument();
    fireEvent.click(within(opened).getByRole("button", { name: "Skip this question" }));
    await waitFor(() => expect(within(opened).getByRole("button", { name: "Finish later" })).toHaveFocus());
    expect(within(opened).queryByRole("button", { name: "Skip this question" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, answers: ["Een.", "Twee.", "Drie.", "Vier.", ""] });
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).endsWith("/attempts") || String(path) === `${blockPath}/progress`)).toHaveLength(0);
  });

  it("opens a fully matched restored staged practice without an editable row or Skip action", async () => {
    const key = practiceDraftKey(accountId, groupId, "practice-answer", blockId);
    localStorage.setItem(key, JSON.stringify({ version: 1, answers: ["Er is", "Er zijn twee slaapkamers."] }));
    const opened = await openPractice(detail());
    expect(screen.getByText("… een kleine keuken.").closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryAccepted/));
    expect(screen.getAllByText("There are two bedrooms.")[0]?.closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryAccepted/));
    expect(within(opened).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(opened).getByRole("status")).toHaveTextContent("Matches the author’s version");
    expect(within(opened).queryByRole("button", { name: "Share question 2" })).not.toBeInTheDocument();
    expect(within(opened).queryByRole("button", { name: "Skip this question" })).not.toBeInTheDocument();
    await waitFor(() => expect(within(opened).getByRole("button", { name: "Done" })).toHaveFocus());
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
    expect(within(screen.getByRole("region", { name: "Answer the practice" })).getByText("Question 2 of 2")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Answer the practice" })).queryByLabelText(/^1\. … een kleine keuken\./)).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
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
    expect(screen.queryByRole("button", { name: "Answer" })).not.toBeInTheDocument();
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
    // A miss is recorded once; Enter again on the unchanged answer only moves on.
    fireEvent.change(field, { target: { value: "Daar is" } });
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
    expect(screen.queryByText("Matches the author’s version")).not.toBeInTheDocument();
    expect(screen.getByText("… een kleine keuken.").closest("li")).toHaveAttribute("class", expect.stringMatching(/summaryAccepted/));
    await waitFor(() => expect(screen.getByLabelText(/^2\. There are two bedrooms\./)).toHaveFocus());
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

  it("does not show the practice progress subheading when the viewer is done", async () => {
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, practiceProgress: { [blockId]: { done: 1, started: 1, answered: 2 } } }];
    await openPractice(value);
    expect(screen.queryByText(/1 person done|You’re done/)).not.toBeInTheDocument();
  });

  it("shows the Enter hint under the answers of a one-question practice", async () => {
    const one: LessonTopBlock = { ...practiceBlock, props: { data: JSON.stringify({ instruction: "Vertaal.", passage: null, items: [{ prompt: "There is a garden.", authorsVersion: ["Er is een tuin."] }] }) } };
    const value = detail(); value.lessons = [{ ...value.lessons[0]!, document: { ...document, blocks: [one] } }];
    await openPractice(value);
    expect(screen.getByText(/Press Enter to check, Shift\+Enter for a new line/)).toBeInTheDocument();
  });

  it("does not show the Enter hint for a practice with two or more questions, and keeps the device note", async () => {
    await openPractice(detail());
    expect(screen.queryByText(/Your answers stay on this device/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Press Enter to check/)).not.toBeInTheDocument();
  });
});
