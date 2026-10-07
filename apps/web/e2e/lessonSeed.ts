import { expect, type Page } from "@playwright/test";
import { E2E_GROUP_ID } from "./global-setup";

// Lesson content is authored through the API with the signed-in session: the draft is saved as a document and published.
type Block = Record<string, unknown>;
const plain = { textColor: "default", backgroundColor: "default" };
const text = (value: string) => [{ type: "text", text: value, styles: {} }];
export const paragraph = (value: string): Block => ({ id: crypto.randomUUID(), type: "paragraph", props: plain, content: text(value), children: [] });
export const example = (sentence: string, translation = "", note = ""): Block => ({ id: crypto.randomUUID(), type: "example", props: { translation, note }, content: text(sentence), children: [] });
export const dialogue = (turns: Array<{ speaker: string; text: string }>): Block => ({ id: crypto.randomUUID(), type: "dialogue", props: { turns: JSON.stringify(turns) }, children: [] });
export const practice = (instruction: string, items: Array<{ prompt: string; authorsVersion?: string[]; note?: string }>): Block => ({
  id: crypto.randomUUID(), type: "practice", children: [],
  props: { data: JSON.stringify({ instruction, passage: null, items: items.map((item) => ({ prompt: item.prompt, authorsVersion: item.authorsVersion ?? [], note: item.note ?? null })) }) },
});
export const vocabulary = (...words: Array<{ term: string; meaning: string; forms?: string; example?: string; note?: string }>): Block => ({
  id: crypto.randomUUID(), type: "vocabulary", children: [], props: { data: JSON.stringify({ words: words.map((word) => ({ id: crypto.randomUUID(), ...word })) }) },
});

export function courseApi(page: Page) {
  return async <T,>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> => {
    const response = await page.request.fetch(`/api/groups/${E2E_GROUP_ID}${path}`, { method, data: body });
    expect(response.ok(), `${method} ${path}`).toBe(true);
    return response.json() as Promise<T>;
  };
}

export async function seedLesson(page: Page, courseId: string, title: string, blocks: Block[], { publish = true } = {}) {
  const api = courseApi(page);
  const { lesson } = await api<{ lesson: { id: string; draft: { version: number } } }>(`/courses/${courseId}/lessons`, { title });
  const lessonPath = `/courses/${courseId}/lessons/${lesson.id}`;
  let version = lesson.draft.version;
  if (blocks.length) version = (await api<{ draftVersion: number }>(`${lessonPath}/draft`, { document: { schemaVersion: 2, blocks }, draftVersion: version }, "PUT")).draftVersion;
  if (publish) await api(`${lessonPath}/publish`, { draftVersion: version });
  return lesson.id;
}
