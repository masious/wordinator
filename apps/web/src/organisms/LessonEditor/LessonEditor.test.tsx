import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type CourseLesson, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import LessonEditor from "./LessonEditor";
import { lessonDocumentDraftKey, storeLocalLessonDraft } from "./lessonDraft";

const groupId = "20000000-0000-4000-8000-000000000001";
const accountId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const exampleId = "50000000-0000-4000-8000-000000000001";
const path = `/api/groups/${groupId}/courses/${courseId}/lessons/${lessonId}`;
const editor = { id: accountId, displayName: "Ada" };
const doc = (words: string): LessonDocument => ({
  schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION,
  blocks: [{ id: exampleId, type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text: words, styles: {} }], children: [] }],
});
const lesson = (overrides: Partial<CourseLesson> = {}): CourseLesson => ({
  id: lessonId, position: 0, title: "Mijn huis", goal: null, published: false, publishedAt: null, changed: false, updatedBy: editor, updatedAt: 1,
  document: null, answerCounts: {}, draft: { document: doc("Het huis is groot."), version: 3 }, ...overrides,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function renderEditor(owner: boolean, value = lesson()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}>
    <LessonEditor groupId={groupId} courseId={courseId} accountId={accountId} owner={owner} lesson={value} onClose={vi.fn()} />
  </QueryClientProvider></MantineProvider>);
}

beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Lesson editor", () => {
  it("loads the draft into the editor and gives contributors no publishing actions", async () => {
    renderEditor(false);
    expect(await screen.findByText("Het huis is groot.")).toBeInTheDocument();
    const bar = screen.getByRole("region", { name: "Lesson saving and publishing" });
    expect(within(bar).getByRole("status")).toHaveTextContent("Saved");
    expect(within(bar).getByText("Your changes save as a draft. The course owner publishes them.")).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Done editing" })).toBeInTheDocument();
  });

  it("gives the owner Publish, Discard, and Unpublish for a published lesson with changes", () => {
    renderEditor(true, lesson({ published: true, publishedAt: 1, changed: true, document: doc("Oud.") }));
    const bar = screen.getByRole("region", { name: "Lesson saving and publishing" });
    expect(within(bar).getByRole("button", { name: "Publish changes" })).toBeEnabled();
    expect(within(bar).getByRole("button", { name: "Discard changes" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("lists publish problems as focusable buttons", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: { code: "LESSON_NOT_READY", message: "Finish first." }, problems: [{ blockId: exampleId, problem: "example-empty" }] }, 422));
    renderEditor(true);
    fireEvent.click(screen.getByRole("button", { name: "Publish lesson" }));
    const problem = await screen.findByRole("button", { name: "An example has no sentence." });
    expect(fetch).toHaveBeenCalledWith(`${path}/publish`, expect.objectContaining({ body: JSON.stringify({ draftVersion: 3 }) }));
    problem.focus();
    expect(problem).toHaveFocus();
  });

  it("restores an unsaved local edit based on the current draft and saves it", async () => {
    const key = lessonDocumentDraftKey(accountId, groupId, lessonId);
    storeLocalLessonDraft(key, { baseVersion: 3, document: doc("Mijn onbewaarde zin.") });
    vi.mocked(fetch).mockResolvedValueOnce(json({ draftVersion: 4, changed: true, updatedBy: editor, updatedAt: 2 }));
    renderEditor(false);
    expect(await screen.findByText("Mijn onbewaarde zin.")).toBeInTheDocument();
    expect(screen.getByText("Restored unsaved changes from this device.", { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${path}/draft`, expect.objectContaining({ method: "PUT" })), { timeout: 3_000 });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body));
    expect(body).toEqual({ document: doc("Mijn onbewaarde zin."), draftVersion: 3 });
  });

  it("keeps a local edit from an older draft aside after a conflict and lets the author bring it back", async () => {
    const key = lessonDocumentDraftKey(accountId, groupId, lessonId);
    storeLocalLessonDraft(key, { baseVersion: 2, document: doc("Mijn versie."), conflict: true });
    renderEditor(false);
    expect(await screen.findByText("Het huis is groot.")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Someone saved a newer version of this lesson.");
    fireEvent.click(within(alert).getByRole("button", { name: "Use my edit instead" }));
    expect(await screen.findByText("Mijn versie.")).toBeInTheDocument();
    expect(screen.queryByText("Het huis is groot.")).not.toBeInTheDocument();
  });
});
