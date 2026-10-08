import {
  isSafeLessonHref, LESSON_COLUMNS_MAX, LESSON_DOCUMENT_SCHEMA_VERSION, LESSON_LIST_DEPTH_MAX, lessonColorSchema, lessonDocumentSchema, type LessonDocument,
  vocabularyPayloadSchema,
} from "@wordinator/contracts/lesson-document";

// The editor's own block JSON: BlockNote follows the same `{ id, type, props, content, children }` convention as the contracts.
export type EditorBlock = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: EditorBlock[] };

const isList = (block: EditorBlock) => block.type === "bulletListItem" || block.type === "numberedListItem";

// Brings editor output into the shape the contracts accept, so the server never rejects what the editor allowed:
// only list items keep children (up to the depth limit), other nested blocks move up after their parent, and columns
// sit at the top level only, with nested column lists unwrapped into their column.
// Image resize handles report fractional widths; the contracts store whole pixels.
export function normalizeEditorBlocks(blocks: readonly EditorBlock[]): EditorBlock[] {
  const copy = (block: EditorBlock, children: EditorBlock[]): EditorBlock => {
    const width = block.type === "image" ? block.props?.previewWidth : undefined;
    const props = typeof width === "number" ? { ...block.props, previewWidth: Math.min(4_000, Math.max(1, Math.round(width))) } : block.props;
    return { ...block, props, children };
  };
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

// True when a top-level editor block holds more columns than the contracts allow, or a column list below the top level.
// The editor repairs such blocks in place with `normalizeEditorBlocks`, so what the author sees is what gets saved.
const nestsColumns = (block: EditorBlock): boolean => (block.children ?? []).some((child) => child.type === "columnList" || nestsColumns(child));
export function breaksColumnRules(block: EditorBlock) {
  if (block.type !== "columnList") return nestsColumns(block);
  const columns = block.children ?? [];
  return columns.length > LESSON_COLUMNS_MAX || columns.some(nestsColumns);
}

// Pasted or dropped content can carry what the editor never offers: links other than http/https, colours outside the
// palette, alignment, and images hosted elsewhere. `sanitizeEditorBlock` returns a repaired copy (or `null` when the block
// itself must go), or the same block when nothing needed repair. Only this lesson's uploads are kept as images; an image
// without a URL is an upload in progress.
const paletteColors = new Set<string>(lessonColorSchema.options);
const colorProps = ["textColor", "backgroundColor"] as const;
type InlineItem = { type: string; text?: string; href?: string; styles?: Record<string, unknown>; content?: InlineItem[] };

const cleanStyles = (styles: Record<string, unknown> = {}) => {
  const clean: Record<string, unknown> = {};
  if (styles.bold === true) clean.bold = true;
  if (styles.italic === true) clean.italic = true;
  for (const key of colorProps) if (typeof styles[key] === "string" && paletteColors.has(styles[key]) && styles[key] !== "default") clean[key] = styles[key];
  return clean;
};
const cleanInline = (items: InlineItem[]): InlineItem[] => items.flatMap((item): InlineItem[] => {
  if (item.type === "link") {
    const content = cleanInline(item.content ?? []);
    return typeof item.href === "string" && isSafeLessonHref(item.href) ? [{ type: "link", href: item.href, content }] : content;
  }
  return item.type === "text" ? [{ type: "text", text: item.text ?? "", styles: cleanStyles(item.styles) }] : [];
});

export function sanitizeEditorBlock(block: EditorBlock, lessonImagePath: string): EditorBlock | null {
  if (block.type === "image" && typeof block.props?.url === "string" && block.props.url && !block.props.url.includes(lessonImagePath)) return null;
  const props = block.props && { ...block.props };
  if (props) {
    for (const key of colorProps) if (key in props && (typeof props[key] !== "string" || !paletteColors.has(props[key]))) props[key] = "default";
    if ("textAlignment" in props && props.textAlignment !== "left") props.textAlignment = "left";
  }
  const content = Array.isArray(block.content) ? cleanInline(block.content as InlineItem[]) : block.content;
  const children = (block.children ?? []).flatMap((child) => sanitizeEditorBlock(child, lessonImagePath) ?? []);
  const repaired = { ...block, props, content, children };
  return stableJson(repaired) === stableJson(block) ? block : repaired;
}

// Word IDs share the document's unique-ID check, so a pasted or duplicated New words block would make the whole draft
// invalid. The first use of an ID in document order keeps it; later vocabulary blocks get fresh IDs for the words that
// repeat one. Returns the new `data` prop of each block that needs it.
export function vocabularyIdRepairs(blocks: readonly EditorBlock[], newId: () => string = () => crypto.randomUUID()) {
  const all: EditorBlock[] = [];
  const walk = (list: readonly EditorBlock[]) => { for (const block of list) { all.push(block); walk(block.children ?? []); } };
  walk(blocks);
  const claimed = new Set(all.map((block) => block.id));
  return all.flatMap((block): Array<{ id: string; data: string }> => {
    if (block.type !== "vocabulary" || typeof block.props?.data !== "string") return [];
    let data: unknown;
    try { data = JSON.parse(block.props.data); } catch { return []; }
    const parsed = vocabularyPayloadSchema.safeParse(data);
    if (!parsed.success) return [];
    let repaired = false;
    const words = parsed.data.words.map((word) => {
      if (!claimed.has(word.id)) { claimed.add(word.id); return word; }
      repaired = true;
      const id = newId(); claimed.add(id);
      return { ...word, id };
    });
    return repaired ? [{ id: block.id, data: JSON.stringify({ words }) }] : [];
  });
}

// Lesson images live under this path segment of the public media URL.
export const lessonImagePath = (courseId: string, lessonId: string) => `/courses/${courseId}/lessons/${lessonId}/`;

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

// JSON that ignores key order and undefined values, for comparing editor output with stored documents.
export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const sameDocument = (left: LessonDocument, right: LessonDocument) => JSON.stringify(left) === JSON.stringify(right);
