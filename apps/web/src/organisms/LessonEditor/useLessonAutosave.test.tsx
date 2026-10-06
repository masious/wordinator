import { LESSON_DOCUMENT_SCHEMA_VERSION, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLocalLessonDraft } from "./lessonDraft";
import { AUTOSAVE_DELAY_MS, useLessonAutosave } from "./useLessonAutosave";

const path = "/api/groups/g/courses/c/lessons/l";
const localKey = "wordinator:draft:v1:a:g:course-lesson-doc:l";
const editor = { id: "10000000-0000-4000-8000-000000000001", displayName: "Ada" };
const doc = (words: string): LessonDocument => ({
  schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION,
  blocks: [{ id: "50000000-0000-4000-8000-000000000001", type: "paragraph", props: { textColor: "default", backgroundColor: "default" }, content: [{ type: "text", text: words, styles: {} }], children: [] }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const saved = (draftVersion: number) => json({ draftVersion, changed: true, updatedBy: editor, updatedAt: 1 });
const sentVersions = () => vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init!.body)).draftVersion);

function setup() {
  const onSaved = vi.fn(); const onConflict = vi.fn();
  const hook = renderHook(() => useLessonAutosave({ path, initialVersion: 4, localKey, onSaved, onConflict }));
  return { ...hook, onSaved, onConflict };
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Lesson autosave", () => {
  it("saves once, about 1.5 s after the last change, with the draft version", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(saved(5));
    const { result, onSaved } = setup();
    act(() => result.current.schedule(doc("een")));
    act(() => result.current.schedule(doc("een twee")));
    expect(result.current.status).toBe("pending");
    // Every change is mirrored locally before it is sent.
    expect(readLocalLessonDraft(localKey)).toMatchObject({ baseVersion: 4, document: doc("een twee") });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100); });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`${path}/draft`, expect.objectContaining({ method: "PUT", body: JSON.stringify({ document: doc("een twee"), draftVersion: 4 }) }));
    expect(result.current.status).toBe("saved");
    expect(result.current.version()).toBe(5);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ draftVersion: 5 }), doc("een twee"));
    expect(localStorage.getItem(localKey)).toBeNull();
  });

  it("sends the next save against the version the previous save returned", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(saved(5)).mockResolvedValueOnce(saved(6));
    const { result } = setup();
    act(() => result.current.schedule(doc("een")));
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS); });
    act(() => result.current.schedule(doc("twee")));
    await act(async () => { expect(await result.current.flush()).toBe(true); });
    expect(sentVersions()).toEqual([4, 5]);
  });

  it("hands a conflict to the editor and keeps the local edit", async () => {
    const server = { document: doc("hun versie"), version: 9 };
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: { code: "VERSION_CONFLICT", message: "Newer." }, draft: server }, 409));
    const { result, onConflict } = setup();
    act(() => result.current.schedule(doc("mijn versie")));
    await act(async () => { expect(await result.current.flush()).toBe(false); });
    expect(result.current.status).toBe("conflict");
    expect(onConflict).toHaveBeenCalledWith(server, doc("mijn versie"));
    expect(result.current.version()).toBe(9);
    expect(readLocalLessonDraft(localKey)).toMatchObject({ baseVersion: 9, conflict: true, document: doc("mijn versie") });
  });

  it("keeps a failed save pending and retries it on the next flush", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(saved(5));
    const { result } = setup();
    act(() => result.current.schedule(doc("een")));
    await act(async () => { await result.current.flush(); });
    expect(result.current.status).toBe("error");
    await act(async () => { expect(await result.current.flush()).toBe(true); });
    expect(result.current.status).toBe("saved");
    expect(sentVersions()).toEqual([4, 4]);
  });
});
