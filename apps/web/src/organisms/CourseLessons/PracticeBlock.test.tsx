import { MantineProvider } from "@mantine/core";
import type { CourseBlock, CourseDetailResponse } from "@wordinator/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { CourseLessons } from "./CourseLessons";
import { practiceDraftKey } from "./PracticeBlock";

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
const practice = (withReference: boolean): CourseBlock => ({
  id: blockId, lessonId, position: 0, published: true, version: 2, updatedBy: editor, updatedAt: 1, kind: "practice", answerCount: 3,
  payload: { instruction: "Vul in of vertaal.", passage: null, items: reference.items.map((item) => ({ prompt: item.prompt })) },
  reference: withReference ? reference : null,
});
const detail = (edit: boolean): CourseDetailResponse => ({
  course: {
    id: courseId, groupId, title: "Dutch", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: "published",
    owner: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, contribution: null,
    permissions: { edit, publish: edit, archive: edit, removeContent: edit, contribute: edit, requestContribution: !edit, leaveContribution: false, manageContributors: edit },
  },
  outline: [{ id: lessonId, position: 0, title: "Mijn huis", goal: null, published: true, version: 1, updatedBy: editor, updatedAt: 1 }],
  lessons: [{ id: lessonId, position: 0, title: "Mijn huis", goal: null, published: true, version: 1, updatedBy: editor, updatedAt: 1, blocks: [practice(edit)] }],
});
const answer = {
  id: "60000000-0000-4000-8000-000000000001", parentId: null, kind: "practice_response", body: null, author: { id: accountId, displayName: "Ada", avatarUrl: null },
  createdAt: 1, updatedAt: 1, edited: false, pinned: false, reactions: [], replies: [], permissions: { edit: true, delete: true, reply: true, pin: false },
  responseItems: [{ position: 0, prompt: "… een kleine keuken.", answer: "Er is", skipped: false, matched: null }, { position: 1, prompt: "There are two bedrooms.", answer: "", skipped: true, matched: null }],
};

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function renderLessons(value: CourseDetailResponse) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><CourseLessons groupId={groupId} courseId={courseId} accountId={accountId} detail={value} dataUpdatedAt={Date.now()} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === `${blockPath}/discussion`) return response({ items: [answer], count: 1, quickReactions: ["👍", "❤️", "😂"], reference });
    if (path === `${blockPath}/comments` && init?.method === "POST") return response({ item: answer }, 201);
    if (path === blockPath && init?.method === "PATCH") return response({ block: { ...practice(true), ...JSON.parse(String(init.body)), ...{ payload: practice(true).payload, reference }, version: 3 } });
    if (path.endsWith(`/lessons/${lessonId}`)) return response({ lesson: detail(false).lessons[0] });
    return response({ status: "signedOut" });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Practice blocks", () => {
  it("shows prompts concealed, keeps a local answer draft, and reveals the thread with the author's version after publishing", async () => {
    renderLessons(detail(false));
    expect(screen.getByText("Vul in of vertaal.")).toBeInTheDocument();
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
    renderLessons(detail(false));
    fireEvent.click(screen.getByRole("button", { name: "Reveal answers" }));
    expect(await screen.findByText("Er zijn twee slaapkamers.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(`${blockPath}/comments`, expect.anything());
  });

  it("keeps authors' versions and notes when the editor only toggles publishing", async () => {
    renderLessons(detail(true));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(blockPath, expect.objectContaining({ method: "PATCH" })));
    const call = vi.mocked(fetch).mock.calls.find(([path, init]) => path === blockPath && init?.method === "PATCH")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({
      kind: "practice", published: false, version: 2,
      payload: { instruction: "Vul in of vertaal.", passage: null, items: [
        { prompt: "… een kleine keuken.", authorsVersion: ["Er is"], note: "One kitchen." },
        { prompt: "There are two bedrooms.", authorsVersion: ["Er zijn twee slaapkamers."], note: null },
      ] },
    });
  });

  it("edits fill-in items with one author's version slot per blank", async () => {
    renderLessons(detail(true));
    fireEvent.click(screen.getByRole("button", { name: "Edit Practice block 1" }));
    fireEvent.change(screen.getByLabelText(/^Item 1 prompt/), { target: { value: "… een keuken en … een tuin." } });
    fireEvent.change(screen.getByLabelText(/^Item 1, blank 2/), { target: { value: "er is" } });
    fireEvent.click(screen.getByRole("button", { name: "Save block" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(blockPath, expect.objectContaining({ method: "PATCH" })));
    const call = vi.mocked(fetch).mock.calls.find(([path, init]) => path === blockPath && init?.method === "PATCH")!;
    expect(JSON.parse(String(call[1]!.body)).payload.items[0]).toEqual({ prompt: "… een keuken en … een tuin.", authorsVersion: ["Er is", "er is"], note: "One kitchen." });
  });
});
