import { MantineProvider } from "@mantine/core";
import type { CourseBlock, CourseDetailResponse, CourseLesson } from "@wordinator/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { courseBlockDraftKey } from "./BlockEditor";
import { CourseLessons } from "./CourseLessons";

const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = (n: number) => `40000000-0000-4000-8000-00000000000${n}`;
const blockId = "50000000-0000-4000-8000-000000000001";
const editor = { id: accountId, displayName: "Ada" };
const course = (edit: boolean, contribute = edit) => ({
  id: courseId, groupId, title: "Dutch Foundations", summary: "Home", level: null, intendedLearner: null, coverUrl: null, status: "published" as const,
  owner: { id: accountId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, contribution: !edit && contribute ? "active" as const : null,
  permissions: { edit, publish: edit, archive: edit, removeContent: edit, contribute, requestContribution: false, leaveContribution: !edit && contribute, manageContributors: edit },
});
const summary = (n: number, published = true) => ({ id: lessonId(n), position: n - 1, title: `Lesson title ${n}`, goal: null, published, version: 1, updatedBy: editor, updatedAt: 1 });
const example: CourseBlock = {
  id: blockId, lessonId: lessonId(1), position: 0, published: true, version: 3, updatedBy: editor, updatedAt: 1,
  kind: "example", payload: { sentence: "Er is een balkon.", translation: "There is a balcony.", note: null },
};
const dialogue: CourseBlock = {
  id: "50000000-0000-4000-8000-000000000002", lessonId: lessonId(1), position: 1, published: false, version: 1, updatedBy: editor, updatedAt: 1,
  kind: "dialogue", payload: { turns: [{ speaker: "A", text: "Is er een tuin?" }, { speaker: "B", text: "Nee." }] },
};
const lesson = (n: number, blocks: CourseBlock[] = []): CourseLesson => ({ ...summary(n), blocks });

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function renderLessons(detail: CourseDetailResponse) {
  // Mirrors the application's stale time, so preloaded lessons are not refetched on mount.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><CourseLessons groupId={groupId} courseId={courseId} accountId={accountId} detail={detail} dataUpdatedAt={Date.now()} /></QueryClientProvider></MantineProvider>);
}

let lessonFour = lesson(4, [{ ...example, id: "50000000-0000-4000-8000-000000000004", lessonId: lessonId(4), payload: { sentence: "Ik stap over.", translation: null, note: null } }]);
let blockPatch: (init: RequestInit) => Response;

beforeEach(() => {
  localStorage.clear();
  blockPatch = (init) => response({ block: { ...example, ...JSON.parse(String(init.body)), version: 4 } });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith(`/lessons/${lessonId(4)}`)) return response({ lesson: lessonFour });
    if (path.endsWith(`/lessons/${lessonId(1)}`)) return response({ lesson: lesson(1, [{ ...example, version: 5, payload: { ...example.payload, sentence: "Hun versie." } }]) });
    if (path.includes(`/blocks/${blockId}`) && init?.method === "PATCH") return blockPatch(init);
    if (path.endsWith("/blocks") && init?.method === "POST") return response({ block: { ...example, id: "50000000-0000-4000-8000-000000000009", ...JSON.parse(String(init.body)), version: 1 } }, 201);
    return response({ ok: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Course lessons", () => {
  it("renders blocks by kind for readers and loads later lessons by ID", async () => {
    const detail = { course: course(false), outline: [1, 2, 3, 4].map((n) => summary(n)), lessons: [lesson(1, [example, dialogue]), lesson(2), lesson(3)] };
    renderLessons(detail);
    expect(screen.getByRole("heading", { name: "Lesson title 1", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Er is een balkon.")).toBeInTheDocument();
    expect(screen.getByText("There is a balcony.")).toBeInTheDocument();
    expect(screen.getByText("Is er een tuin?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Lesson title 4" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue with lesson 4: Lesson title 4" }));
    expect(await screen.findByText("Ik stap over.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(4)}`, expect.anything());
  });

  it("keeps an unsaved new block as a local draft and posts it on save", async () => {
    renderLessons({ course: course(true), outline: [summary(1, false)], lessons: [lesson(1)] });
    expect(screen.getByText("Unpublished")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add block to lesson 1" }));
    const form = screen.getByRole("form", { name: "New block" });
    fireEvent.change(within(form).getByLabelText(/^Text/), { target: { value: "Gebruik er is." } });
    const key = courseBlockDraftKey(accountId, groupId, lessonId(1));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ version: 1, kind: "text", fields: { content: "Gebruik er is." } }));
    // Reopening after a reload restores the unsaved block.
    cleanup();
    renderLessons({ course: course(true), outline: [summary(1, false)], lessons: [lesson(1)] });
    expect(await screen.findByText("Restored your unsaved changes.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Text/)).toHaveValue("Gebruik er is.");
    fireEvent.click(screen.getByRole("button", { name: "Add block" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(1)}/blocks`, expect.objectContaining({
      method: "POST", body: JSON.stringify({ kind: "text", payload: { content: "Gebruik er is." }, published: false }),
    })));
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
  });

  it("edits a dialogue block and sends the version it was based on", async () => {
    renderLessons({ course: course(true), outline: [summary(1)], lessons: [lesson(1, [example, dialogue])] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Dialogue block 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add turn" }));
    fireEvent.change(screen.getByLabelText(/^Speaker 3/), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText(/^Line 3/), { target: { value: "Jammer." } });
    blockPatch = (init) => response({ block: { ...dialogue, ...JSON.parse(String(init.body)), version: 2 } });
    fireEvent.click(screen.getByRole("button", { name: "Save block" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/blocks/${dialogue.id}`), expect.objectContaining({ method: "PATCH" })));
    const call = vi.mocked(fetch).mock.calls.find(([path]) => String(path).includes(`/blocks/${dialogue.id}`))!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({
      kind: "dialogue", payload: { turns: [{ speaker: "A", text: "Is er een tuin?" }, { speaker: "B", text: "Nee." }, { speaker: "A", text: "Jammer." }] }, published: false, version: 1,
    });
  });

  it("lets a contributor edit only unpublished content and never publish", async () => {
    renderLessons({ course: course(false, true), outline: [summary(1)], lessons: [lesson(1, [example, dialogue])] });
    expect(screen.queryByRole("button", { name: "Edit Example block 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Dialogue block 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit lesson" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Publish/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move .* up/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add block to lesson 1" }));
    const form = screen.getByRole("form", { name: "New block" });
    expect(within(form).queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/^Text/), { target: { value: "Een voorstel." } });
    fireEvent.click(within(form).getByRole("button", { name: "Add block" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId(1)}/blocks`, expect.objectContaining({
      method: "POST", body: JSON.stringify({ kind: "text", payload: { content: "Een voorstel." }, published: false }),
    })));
  });

  it("shows a conflict message and lets the author keep their edit on top of the newer version", async () => {
    blockPatch = () => response({ error: { code: "VERSION_CONFLICT", message: "Someone saved a newer version first." } }, 409);
    renderLessons({ course: course(true), outline: [summary(1)], lessons: [lesson(1, [example])] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Example block 1" }));
    fireEvent.change(screen.getByLabelText(/^Example sentence/), { target: { value: "Mijn versie." } });
    fireEvent.click(screen.getByRole("button", { name: "Save block" }));
    expect(await screen.findByText("Someone saved a newer version of this block. Your changes are still here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save block" })).toBeDisabled();
    expect(localStorage.getItem(courseBlockDraftKey(accountId, groupId, blockId))).toContain("Mijn versie.");

    blockPatch = (init) => response({ block: { ...example, ...JSON.parse(String(init.body)), version: 6 } });
    fireEvent.click(screen.getByRole("button", { name: "Keep my changes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save block" })).toBeEnabled());
    expect(screen.getByLabelText(/^Example sentence/)).toHaveValue("Mijn versie.");
    fireEvent.click(screen.getByRole("button", { name: "Save block" }));
    await waitFor(() => {
      const bodies = vi.mocked(fetch).mock.calls.filter(([path, init]) => String(path).includes(`/blocks/${blockId}`) && init?.method === "PATCH").map(([, init]) => JSON.parse(String(init!.body)));
      expect(bodies.map((body) => body.version)).toEqual([3, 5]);
    });
  });
});
