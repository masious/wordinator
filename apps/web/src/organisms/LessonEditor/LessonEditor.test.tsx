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
const para = (id: string, text: string) => ({ id, type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text, styles: {} }], children: [] }) as LessonDocument["blocks"][number];
const secondId = "50000000-0000-4000-8000-000000000002";
const twoDoc = (first: string, second: string): LessonDocument => ({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [para(exampleId, first), para(secondId, second)] });
const conflict = (document: LessonDocument, version: number) => json({ error: { code: "VERSION_CONFLICT", message: "Newer." }, draft: { document, version } }, 409);
const saved = (draftVersion: number) => json({ draftVersion, changed: true, updatedBy: editor, updatedAt: 2 });
const lesson = (overrides: Partial<CourseLesson> = {}): CourseLesson => ({
  id: lessonId, slug: "mijn-huis", position: 0, title: "Mijn huis", goal: null, published: false, publishedAt: null, changed: false, updatedBy: editor, updatedAt: 1, wordCount: 0, practiceCount: 0, imageUrl: null,
  document: null, practiceProgress: {}, draft: { document: doc("Het huis is groot."), version: 3 }, speech: {}, draftSpeech: {}, ...overrides,
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

  it("edits New words in place and autosaves the block", async () => {
    const wordId = "70000000-0000-4000-8000-000000000001";
    const words = (meaning: string) => ({ id: "50000000-0000-4000-8000-000000000009", type: "vocabulary", props: { data: JSON.stringify({ words: [{ id: wordId, term: "het huis", meaning, forms: "de huizen" }] }) }, children: [] }) as LessonDocument["blocks"][number];
    vi.mocked(fetch).mockResolvedValueOnce(saved(4));
    renderEditor(false, lesson({ draft: { document: { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [para(exampleId, "Het huis is groot."), words("house")] }, version: 3 } }));
    const block = await screen.findByRole("region", { name: "New words" });
    expect(within(block).getByLabelText("Word 1 forms")).toHaveValue("de huizen");
    fireEvent.change(within(block).getByLabelText(/^Word 1 meaning/), { target: { value: "the house" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${path}/draft`, expect.objectContaining({ method: "PUT" })), { timeout: 3_000 });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body)).document.blocks[1]).toEqual(words("the house"));
  });

  it("shows each word's audio status from the draft speech and marks an edited term pending until it is saved and generated", async () => {
    const blockId = "50000000-0000-4000-8000-000000000009";
    const huis = "70000000-0000-4000-8000-000000000001"; const tuin = "70000000-0000-4000-8000-000000000002"; const deur = "70000000-0000-4000-8000-000000000003";
    const words = { id: blockId, type: "vocabulary", props: { data: JSON.stringify({ words: [
      { id: huis, term: "het huis", meaning: "house" }, { id: tuin, term: "de tuin", meaning: "garden" }, { id: deur, term: "de deur", meaning: "door" },
    ] }) }, children: [] } as LessonDocument["blocks"][number];
    const url = "https://media.test/speech/huis.mp3";
    vi.mocked(fetch).mockResolvedValue(saved(4));
    renderEditor(false, lesson({ draft: { document: { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [words] }, version: 3 }, draftSpeech: {
      [`word:${huis}`]: { status: "ready", url }, [`word:${tuin}`]: { status: "failed", url: null },
    } }));
    const block = await screen.findByRole("region", { name: "New words" });
    const row = (id: string) => block.querySelector(`[data-word-id="${id}"]`) as HTMLElement;
    expect(within(row(huis)).getByText("Audio ready")).toBeInTheDocument();
    expect(within(row(huis)).getByRole("button", { name: "Play pronunciation of het huis" })).toBeInTheDocument();
    expect(within(row(tuin)).getByText("The audio could not be generated.")).toBeInTheDocument();
    expect(within(row(deur)).getByText(/Audio pending/)).toBeInTheDocument();
    // An edited term no longer matches its clip, before and after the save.
    fireEvent.change(within(row(huis)).getByLabelText(/^Word 1\W*$/), { target: { value: "het huisje" } });
    expect(within(row(huis)).getByText(/Audio pending/)).toBeInTheDocument();
    expect(within(row(huis)).queryByRole("button", { name: /Play pronunciation/ })).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${path}/draft`, expect.objectContaining({ method: "PUT" })), { timeout: 3_000 });
    expect(within(row(huis)).getByText(/Audio pending/)).toBeInTheDocument();
    // A meaning edit changes nothing that is spoken.
    expect(within(row(tuin)).getByText("The audio could not be generated.")).toBeInTheDocument();
  });

  it("focuses the empty field of a word that blocks publishing", async () => {
    const blockId = "50000000-0000-4000-8000-000000000009"; const wordId = "70000000-0000-4000-8000-000000000001";
    const words = { id: blockId, type: "vocabulary", props: { data: JSON.stringify({ words: [{ id: wordId, term: "het huis", meaning: "" }] }) }, children: [] } as LessonDocument["blocks"][number];
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: { code: "LESSON_NOT_READY", message: "Finish first." }, problems: [{ blockId, wordId, problem: "word-empty" }] }, 422));
    renderEditor(true, lesson({ draft: { document: { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [words] }, version: 3 } }));
    fireEvent.click(await screen.findByRole("button", { name: "Publish lesson" }));
    fireEvent.click(await screen.findByRole("button", { name: "A new word needs both the word and its meaning." }));
    expect(screen.getByLabelText(/^Word 1 meaning/)).toHaveFocus();
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

  it("loads images and focuses an image that still needs alt text", async () => {
    const imageId = "50000000-0000-4000-8000-000000000009";
    const withImage: LessonDocument = { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [{
      id: imageId, type: "image", children: [],
      props: { textAlignment: "left", backgroundColor: "default", name: "", url: `https://media.test/courses/${courseId}/lessons/${lessonId}/k.jpg`, caption: "De keuken", showPreview: true },
    }] };
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: { code: "LESSON_NOT_READY", message: "Finish first." }, problems: [{ blockId: imageId, problem: "image-alt-missing" }] }, 422));
    const { container } = renderEditor(true, lesson({ draft: { document: withImage, version: 3 } }));
    await waitFor(() => expect(container.querySelector(`[data-id="${imageId}"] img`)).toHaveAttribute("src", `https://media.test/courses/${courseId}/lessons/${lessonId}/k.jpg`));
    fireEvent.click(screen.getByRole("button", { name: "Publish lesson" }));
    fireEvent.click(await screen.findByRole("button", { name: "An image needs alt text." }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("keeps the alt text field open and focused while the author types", async () => {
    const imageId = "50000000-0000-4000-8000-000000000009";
    const withImage: LessonDocument = { schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: [{
      id: imageId, type: "image", children: [],
      props: { textAlignment: "left", backgroundColor: "default", name: "", url: `https://media.test/courses/${courseId}/lessons/${lessonId}/k.jpg`, caption: "", showPreview: true },
    }, para(exampleId, "Het huis is groot.")] };
    const { container } = renderEditor(true, lesson({ draft: { document: withImage, version: 3 } }));
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: { code: "LESSON_NOT_READY", message: "Finish first." }, problems: [{ blockId: imageId, problem: "image-alt-missing" }] }, 422));
    await waitFor(() => expect(container.querySelector(`[data-id="${imageId}"] img`)).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Publish lesson" }));
    fireEvent.click(await screen.findByRole("button", { name: "An image needs alt text." }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit alt text" }));
    const field = await screen.findByPlaceholderText("Edit alt text");
    fireEvent.change(field, { target: { value: "D" } });
    await screen.findByText("Unsaved changes", { exact: false });
    const after = screen.getByPlaceholderText("Edit alt text");
    expect(after).toBe(field);
    expect(after).toHaveValue("D");
  });

  it("merges a conflicting save by block and saves the result against the newer version", async () => {
    const key = lessonDocumentDraftKey(accountId, groupId, lessonId);
    storeLocalLessonDraft(key, { baseVersion: 3, document: twoDoc("Mijn eerste zin.", "Tweede.") });
    vi.mocked(fetch).mockResolvedValueOnce(conflict(twoDoc("Eerste.", "Hun tweede zin."), 4)).mockResolvedValueOnce(saved(5));
    renderEditor(false, lesson({ draft: { document: twoDoc("Eerste.", "Tweede."), version: 3 } }));
    expect(await screen.findByText("Someone saved a newer version. Your edits were merged into it.", { exact: false }, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.getByText("Mijn eerste zin.")).toBeInTheDocument();
    expect(screen.getByText("Hun tweede zin.")).toBeInTheDocument();
    expect(screen.queryByTestId("merge-conflict")).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1]![1]!.body))).toEqual({ document: twoDoc("Mijn eerste zin.", "Hun tweede zin."), draftVersion: 4 });
  });

  it("asks side by side when both edited the same block and applies the author's choice", async () => {
    const key = lessonDocumentDraftKey(accountId, groupId, lessonId);
    storeLocalLessonDraft(key, { baseVersion: 3, document: twoDoc("Mijn zin.", "Tweede.") });
    vi.mocked(fetch).mockResolvedValueOnce(conflict(twoDoc("Hun zin.", "Tweede."), 4)).mockResolvedValue(saved(5));
    const { container } = renderEditor(false, lesson({ draft: { document: twoDoc("Eerste.", "Tweede."), version: 3 } }));
    const item = await screen.findByTestId("merge-conflict", {}, { timeout: 3_000 });
    expect(screen.getByRole("alert", { name: "Choose a version" })).toHaveTextContent("1 block was changed by both of you.");
    expect(within(item).getByText("Newer version").closest("figure")).toHaveTextContent("Hun zin.");
    expect(within(item).getByText("Your edit").closest("figure")).toHaveTextContent("Mijn zin.");
    const editorText = () => container.querySelector(".bn-editor")!.textContent;
    expect(editorText()).toContain("Hun zin.");
    fireEvent.click(within(item).getByRole("button", { name: "Keep my edit" }));
    await waitFor(() => expect(editorText()).toContain("Mijn zin."));
    expect(editorText()).not.toContain("Hun zin.");
    expect(screen.queryByTestId("merge-conflict")).not.toBeInTheDocument();
  });

  it("strips pasted HTML to what lessons allow", async () => {
    // ProseMirror builds a synthetic paste event, which jsdom does not provide.
    vi.stubGlobal("ClipboardEvent", class extends Event { clipboardData = null; });
    vi.mocked(fetch).mockResolvedValue(saved(4));
    const { container } = renderEditor(false);
    await screen.findByText("Het huis is groot.");
    const html = '<p>Zie <a href="javascript:alert(1)">hier</a> en <u>dit</u>.</p><p style="text-align:center">Midden</p><img src="https://elsewhere.test/x.png" alt="x">';
    const target = container.querySelector(".bn-editor")!;
    fireEvent.paste(target, { clipboardData: { types: ["text/html", "text/plain"], files: [], getData: (type: string) => type === "text/html" ? html : "Zie hier en dit. Midden" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`${path}/draft`, expect.objectContaining({ method: "PUT" })), { timeout: 3_000 });
    const sent = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)![1]!.body)).document as LessonDocument;
    const serialized = JSON.stringify(sent);
    expect(serialized).toContain("Midden");
    expect(serialized).not.toContain("javascript:");
    expect(serialized).not.toContain("elsewhere.test");
    expect(serialized).not.toContain("center");
    expect(container.querySelector(".bn-editor a")).toBeNull();
  });

  it("sends a pasted image file through the upload dialog", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:shot"), revokeObjectURL: vi.fn() }));
    const { container } = renderEditor(false);
    await screen.findByText("Het huis is groot.");
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.paste(container.querySelector(".bn-editor")!, { clipboardData: { types: ["Files"], files: [file], getData: () => "" } });
    expect(await screen.findByRole("dialog", { name: "Add an image" })).toBeInTheDocument();
  });
});
