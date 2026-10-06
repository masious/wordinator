import {
  LESSON_COLUMNS_MAX, LESSON_DOCUMENT_SCHEMA_VERSION, LESSON_LIST_DEPTH_MAX, lessonDocumentSchema, type LessonDocument,
} from "@wordinator/contracts/lesson-document";

// The editor's own block JSON: BlockNote follows the same `{ id, type, props, content, children }` convention as the contracts.
export type EditorBlock = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: EditorBlock[] };

const isList = (block: EditorBlock) => block.type === "bulletListItem" || block.type === "numberedListItem";

// Brings editor output into the shape the contracts accept, so the server never rejects what the editor allowed:
// only list items keep children (up to the depth limit), other nested blocks move up after their parent, and columns
// sit at the top level only, with nested column lists unwrapped into their column.
export function normalizeEditorBlocks(blocks: readonly EditorBlock[]): EditorBlock[] {
  const copy = (block: EditorBlock, children: EditorBlock[]): EditorBlock => ({ ...block, children });
  const lift = (block: EditorBlock): EditorBlock[] => block.type === "columnList" || block.type === "column"
    ? (block.children ?? []).flatMap(lift)
    : [copy(block, []), ...(block.children ?? []).flatMap(lift)];
  const listItem = (block: EditorBlock, depth: number): EditorBlock[] => {
    const children = block.children ?? [];
    if (depth >= LESSON_LIST_DEPTH_MAX) return [copy(block, []), ...children.flatMap(lift)];
    const nested = children.filter(isList).flatMap((child) => listItem(child, depth + 1));
    return [copy(block, nested), ...children.filter((child) => !isList(child)).flatMap(lift)];
  };
  const leaf = (block: EditorBlock): EditorBlock[] => isList(block) ? listItem(block, 1) : lift(block);
  return blocks.flatMap((block): EditorBlock[] => {
    if (block.type !== "columnList") return leaf(block);
    const columns = (block.children ?? []).filter((column) => column.type === "column")
      .map((column) => copy(column, (column.children ?? []).flatMap(leaf))).filter((column) => column.children!.length > 0);
    if (columns.length < 2) return columns.flatMap((column) => column.children!);
    return [copy(block, columns.slice(0, LESSON_COLUMNS_MAX)), ...columns.slice(LESSON_COLUMNS_MAX).flatMap((column) => column.children!)];
  });
}

export function toLessonDocument(blocks: readonly EditorBlock[]) {
  return lessonDocumentSchema.safeParse({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, blocks: normalizeEditorBlocks(blocks) });
}

// Unsaved lesson edits survive reloads and sign-out under the shared draft-key rules, with the lesson as target. The
// stored copy records the document schema version and the draft version it was based on.
export const lessonDocumentDraftKey = (accountId: string, groupId: string, lessonId: string) => `wordinator:draft:v1:${accountId}:${groupId}:course-lesson-doc:${lessonId}`;
export type LocalLessonDraft = { schemaVersion: number; baseVersion: number; document: LessonDocument; conflict?: boolean };

export function readLocalLessonDraft(key: string): LocalLessonDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as LocalLessonDraft | null;
    if (value?.schemaVersion !== LESSON_DOCUMENT_SCHEMA_VERSION || typeof value.baseVersion !== "number") return null;
    const document = lessonDocumentSchema.safeParse(value.document);
    return document.success ? { ...value, document: document.data } : null;
  } catch {
    return null;
  }
}

export function storeLocalLessonDraft(key: string, draft: Omit<LocalLessonDraft, "schemaVersion">) {
  try {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION, ...draft } satisfies LocalLessonDraft));
  } catch { /* storage full or unavailable: the server draft still autosaves */ }
}

export function clearLocalLessonDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* nothing to clear */ }
}

export const sameDocument = (left: LessonDocument, right: LessonDocument) => JSON.stringify(left) === JSON.stringify(right);
