import "@blocknote/mantine/style.css";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type PartialBlock } from "@blocknote/core";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import { getMultiColumnSlashMenuItems } from "@blocknote/xl-multi-column";
import {
  BasicTextStyleButton, BlockTypeSelect, ColorStyleButton, CreateLinkButton, FileCaptionButton, FileDeleteButton, FilePanel, FilePanelController, FileRenameButton,
  FileReplaceButton, FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems, SuggestionMenuController, UploadTab, useCreateBlockNote,
  type DefaultReactSuggestionItem, type FilePanelProps,
} from "@blocknote/react";
import { Popover } from "@mantine/core";
import type { CourseDetailResponse } from "@wordinator/contracts/lesson-document";
import {
  collectPracticeIds, lessonNotReadySchema, lessonResponseSchema, type CourseLesson, type LessonDocument, type LessonDraft, type LessonPublishProblem,
} from "@wordinator/contracts/lesson-document";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Columns2, Columns3, Heading1, Heading2, Heading3, Languages, List, ListOrdered, Lightbulb, MessagesSquare, PencilLine, Pilcrow, Smile } from "lucide-react";
import { type DragEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, courseProgressQueryOptions, courseQueryOptions, lessonQueryOptions } from "../../api";
import { EmojiPicker } from "../../molecules/EmojiPicker";
import { Button, ConfirmDialog } from "../../ui";
import { lessonDropCursor, refusesColumnDrop } from "./columnDrops";
import { lessonEditorDictionary } from "./editorDictionary";
import { DEFAULT_PRACTICE, DEFAULT_TURNS, lessonEditorSchema, newVocabularyData, type LessonEditorInstance } from "./editorSchema";
import {
  breaksColumnRules, clearLocalLessonDraft, lessonDocumentDraftKey, lessonImagePath, normalizeEditorBlocks, readLocalLessonDraft, sameDocument, sanitizeEditorBlock,
  toLessonDocument, vocabularyIdRepairs, type EditorBlock,
} from "./lessonDraft";
import { LessonImageDialog } from "./LessonImageDialog";
import { LessonMergeConflicts, type MergeChoice } from "./LessonMergeConflicts";
import { mergeLessonDocuments, type MergeConflict } from "./lessonMerge";
import { LessonPublishBar } from "./LessonPublishBar";
import { useLessonAutosave } from "./useLessonAutosave";
import styles from "./LessonEditor.module.css";

// Palette colours and editor chrome follow the design tokens in both colour schemes.
const palette = ["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
const editorTheme: Theme = {
  fontFamily: "var(--font-sans)",
  borderRadius: 10,
  colors: {
    editor: { text: "var(--color-foreground)", background: "transparent" },
    menu: { text: "var(--color-foreground)", background: "var(--color-surface-raised)" },
    tooltip: { text: "var(--color-foreground)", background: "var(--color-surface-muted)" },
    hovered: { text: "var(--color-foreground)", background: "var(--color-wash-strong)" },
    selected: { text: "var(--color-action-text)", background: "var(--color-action)" },
    disabled: { text: "var(--color-disabled-text)", background: "var(--color-disabled)" },
    shadow: "var(--color-hairline)", border: "var(--color-hairline)", sideMenu: "var(--color-foreground-muted)",
    highlights: Object.fromEntries(palette.map((color) => [color, { text: `var(--color-lesson-${color}-text)`, background: `var(--color-lesson-${color}-surface)` }])),
  },
};

const isListBlock = (type: string) => type === "bulletListItem" || type === "numberedListItem";
const toEditorBlocks = (document: LessonDocument) => document.blocks.length ? document.blocks as unknown as PartialBlock<typeof lessonEditorSchema.blockSchema>[] : undefined;

// A clipboard holding an image file and no text (a copied image, a screenshot) is pasted as an upload. Office apps also put
// an image of the copied text on the clipboard, so anything with text goes through the HTML or text paste instead.
const pastedImage = (data: DataTransfer | null) => {
  const image = [...(data?.files ?? [])].find((file) => file.type.startsWith("image/"));
  if (!data || !image || data.types.includes("blocknote/html")) return null;
  const html = data.getData("text/html");
  const text = html ? new DOMParser().parseFromString(html, "text/html").body.textContent : data.getData("text/plain");
  return text?.trim() ? null : image;
};

// BlockNote renders these as components, so they live at module level: an inline function would be a new component on
// every editor render and remount the toolbar, closing the alt text field and dropping its focus mid-word.
const blockTypeItems = [
  { key: "paragraph", type: "paragraph", icon: Pilcrow },
  { key: "heading", type: "heading", props: { level: 1 }, icon: Heading1 },
  { key: "heading_2", type: "heading", props: { level: 2 }, icon: Heading2 },
  { key: "heading_3", type: "heading", props: { level: 3 }, icon: Heading3 },
  { key: "bullet_list", type: "bulletListItem", icon: List },
  { key: "numbered_list", type: "numberedListItem", icon: ListOrdered },
] as const;

function LessonFormattingToolbar() {
  const { t } = useTranslation();
  const blockTypes = useMemo(() => blockTypeItems.map(({ key, ...item }) => ({ ...item, name: t(`courses.editor.slash.${key}`) })), [t]);
  return <FormattingToolbar>
    <BlockTypeSelect key="type" items={blockTypes} />
    <BasicTextStyleButton key="bold" basicTextStyle="bold" />
    <BasicTextStyleButton key="italic" basicTextStyle="italic" />
    <ColorStyleButton key="color" />
    <CreateLinkButton key="link" />
    <FileCaptionButton key="caption" />
    <FileRenameButton key="alt" />
    <FileReplaceButton key="replace" />
    <FileDeleteButton key="delete" />
  </FormattingToolbar>;
}

// Only uploads: the API accepts images uploaded to this lesson, never links to images elsewhere.
function LessonFilePanel(props: FilePanelProps) {
  const { t } = useTranslation();
  return <FilePanel {...props} tabs={[{ name: t("courses.editor.ui.upload"), tabPanel: <UploadTab blockId={props.blockId} setLoading={() => undefined} /> }]} />;
}

type Props = { groupId: string; courseId: string; accountId: string; owner: boolean; lesson: CourseLesson; onClose: () => void };
type ImageUpdate = { props?: { url: string; name: string } };
type Busy = "publish" | "discard" | "unpublish" | "done" | null;

class LessonNotReadyError extends ApiError {
  constructor(message: string, public readonly problems: LessonPublishProblem[]) { super(422, "LESSON_NOT_READY", message); }
}

// Owner-only lesson actions. A refused publish carries the blocks that still need work.
async function lessonAction(path: string, body?: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return lessonResponseSchema.parse(data).lesson;
  const notReady = lessonNotReadySchema.safeParse(data);
  if (notReady.success) throw new LessonNotReadyError(notReady.data.error.message, notReady.data.problems);
  const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
  throw new ApiError(response.status, error?.code ?? "UNKNOWN_ERROR", error?.message ?? "Something went wrong.");
}

export default function LessonEditor({ groupId, courseId, accountId, owner, lesson, onClose }: Props) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const path = `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lesson.id)}`;
  const lessonKey = lessonQueryOptions(groupId, courseId, lesson.id).queryKey;
  const courseKey = courseQueryOptions(groupId, courseId).queryKey;
  const localKey = lessonDocumentDraftKey(accountId, groupId, lesson.id);
  const serverDraft = lesson.draft!;

  // A local copy based on the current server draft is an unsaved edit and is restored. A copy based on an older draft
  // (or left by a conflict) is kept aside so the author can bring it back explicitly.
  const [start] = useState(() => {
    const local = readLocalLessonDraft(localKey);
    if (!local || sameDocument(local.document, serverDraft.document)) return { document: serverDraft.document, restored: false, kept: null };
    if (local.baseVersion === serverDraft.version && !local.conflict) return { document: local.document, restored: true, kept: null };
    return { document: serverDraft.document, restored: false, kept: local.document };
  });
  const [kept, setKept] = useState<LessonDocument | null>(start.kept);
  const [restored, setRestored] = useState(start.restored);
  // The last document the server holds; edits that return to it need no save.
  const baseline = useRef(serverDraft.document);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<Error | null>(null);
  const [problems, setProblems] = useState<LessonPublishProblem[]>([]);
  const [confirm, setConfirm] = useState<"discard" | "unpublish" | "removesAnswers" | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // An image chosen in BlockNote's upload panel, or pasted or dropped, waits here until the author inserts or cancels it.
  const [upload, setUpload] = useState<{ file: File; resolve: (update: ImageUpdate) => void } | null>(null);
  const requestUpload = (file: File) => new Promise<ImageUpdate>((resolve) => setUpload({ file, resolve }));
  // Blocks both sides changed in a merged conflict, until the author picks a version.
  const [conflicts, setConflicts] = useState<MergeConflict[]>([]);
  const [merged, setMerged] = useState(false);
  const [current, setCurrent] = useState({ published: lesson.published, changed: lesson.changed, editorName: lesson.updatedBy.displayName });

  const editor = useCreateBlockNote({
    schema: lessonEditorSchema,
    initialContent: toEditorBlocks(start.document),
    dictionary: lessonEditorDictionary(t),
    tabBehavior: "prefer-navigate-ui",
    dropCursor: lessonDropCursor,
    // Alt text starts empty on purpose: a file name is not a description, and publishing requires one.
    uploadFile: requestUpload,
    // Pasted HTML and Markdown are parsed into the lesson schema and then repaired in `onChange`; a pasted image file
    // goes through the same upload dialog as a chosen one.
    pasteHandler: ({ event, editor: target, defaultPasteHandler }) => {
      const image = pastedImage(event.clipboardData);
      if (!image) return defaultPasteHandler();
      void insertPastedImage(target as unknown as LessonEditorInstance, image);
      return true;
    },
  }) as LessonEditorInstance;

  async function insertPastedImage(target: LessonEditorInstance, file: File) {
    const { block } = target.getTextCursorPosition();
    const empty = block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 0;
    const placeholder = empty ? target.updateBlock(block, { type: "image" }) : target.insertBlocks([{ type: "image" }], block, "after")[0]!;
    const update = await requestUpload(file);
    if (!target.getBlock(placeholder.id)) return;
    if (update.props) target.updateBlock(placeholder.id, update); else target.removeBlocks([placeholder.id]);
  }

  const setLesson = (next: CourseLesson) => {
    queryClient.setQueryData(lessonKey, { lesson: next });
    setCurrent({ published: next.published, changed: next.changed, editorName: next.updatedBy.displayName });
  };
  const replaceContent = (document: LessonDocument) => {
    baseline.current = document;
    editor.replaceBlocks(editor.document, toEditorBlocks(document) ?? [{ type: "paragraph" }]);
  };

  const autosave = useLessonAutosave({
    path, initialVersion: serverDraft.version, localKey,
    onSaved: (saved, document) => {
      baseline.current = document;
      setCurrent((value) => ({ ...value, changed: saved.changed, editorName: saved.updatedBy.displayName }));
      queryClient.setQueryData(lessonKey, (value: { lesson: CourseLesson } | undefined) => value && {
        lesson: { ...value.lesson, changed: saved.changed, updatedBy: saved.updatedBy, updatedAt: saved.updatedAt, draft: { document, version: saved.draftVersion } },
      });
      queryClient.setQueryData(courseKey, (value: CourseDetailResponse | undefined) => value && {
        ...value, outline: value.outline.map((entry) => entry.id === lesson.id ? { ...entry, changed: saved.changed, updatedBy: saved.updatedBy, updatedAt: saved.updatedAt } : entry),
      });
    },
    // A conflict merges the local edit into the newer draft by block ID and saves the result; blocks both sides changed
    // wait for the author's choice. When the merge breaks the contracts, the newer draft loads and the local edit is kept
    // on this device until the author decides.
    onConflict: (server: LessonDraft, local: LessonDocument) => {
      const result = mergeLessonDocuments(baseline.current, local, server.document);
      if (!result) { replaceContent(server.document); setKept(local); return; }
      autosave.reset(server.version);
      replaceContent(result.document);
      baseline.current = server.document;
      setConflicts((previous) => [...previous.filter((old) => !result.conflicts.some((next) => next.blockId === old.blockId)), ...result.conflicts]);
      setMerged(true);
      if (sameDocument(result.document, server.document)) clearLocalLessonDraft(localKey); else autosave.schedule(result.document);
    },
  });
  // A restored local edit is saved like any other change.
  useEffect(() => { if (start.restored) autosave.schedule(start.document); }, [autosave.schedule, start]);

  const onChange = () => {
    // Pasted links, colours, alignment, and foreign images that the contracts refuse are repaired or removed first.
    const imagePath = lessonImagePath(courseId, lesson.id);
    const dirty = (editor.document as unknown as EditorBlock[]).flatMap((block) => {
      const clean = sanitizeEditorBlock(block, imagePath);
      return clean === block ? [] : [{ id: block.id, clean }];
    });
    // One transaction per repair, so the repair is a single change (and a single undo step).
    if (dirty.length) {
      editor.transact(() => {
        for (const { id, clean } of dirty) {
          if (clean) editor.replaceBlocks([id], [clean] as unknown as PartialBlock<typeof lessonEditorSchema.blockSchema>[]);
          else editor.removeBlocks([id]);
        }
      });
      return;
    }
    // A drop or paste that left too many columns, or columns inside columns or lists, is reshaped in place before saving.
    const broken = (editor.document as unknown as EditorBlock[]).filter(breaksColumnRules);
    if (broken.length) {
      editor.transact(() => {
        for (const block of broken) editor.replaceBlocks([block.id], normalizeEditorBlocks([block]) as unknown as PartialBlock<typeof lessonEditorSchema.blockSchema>[]);
      });
      return;
    }
    // A pasted or duplicated New words block repeats word IDs; its words get fresh ones.
    const renamed = vocabularyIdRepairs(editor.document as unknown as EditorBlock[]);
    if (renamed.length) {
      editor.transact(() => { for (const { id, data } of renamed) editor.updateBlock(id, { props: { data } }); });
      return;
    }
    const parsed = toLessonDocument(editor.document as unknown as EditorBlock[]);
    if (!parsed.success) { autosave.markInvalid(); return; }
    if (problems.length) setProblems([]);
    if (sameDocument(parsed.data, baseline.current) && autosave.status !== "pending" && autosave.status !== "error") return;
    autosave.schedule(parsed.data);
  };

  // Only list items nest, up to three levels; Tab elsewhere does nothing instead of producing structure the contracts reject.
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== "Tab" || event.shiftKey || !(event.target as HTMLElement).isContentEditable) return;
    const { block, prevBlock } = editor.getTextCursorPosition();
    let depth = 1;
    for (let parent = editor.getParentBlock(block); parent; parent = editor.getParentBlock(parent)) depth += 1;
    if (!isListBlock(block.type) || !prevBlock || !isListBlock(prevBlock.type) || depth >= 3) { event.preventDefault(); event.stopPropagation(); }
  };

  const onDropCapture = (event: DragEvent) => {
    const view = editor.prosemirrorView;
    if (view && refusesColumnDrop(view, event.nativeEvent)) { event.preventDefault(); event.stopPropagation(); }
  };

  const run = async (action: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(action); setError(null);
    try { await work(); } catch (caught) {
      if (caught instanceof LessonNotReadyError) setProblems(caught.problems);
      else setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally { setBusy(null); }
  };
  const afterPublishChange = async (next: CourseLesson) => {
    setLesson(next);
    await Promise.all([queryClient.invalidateQueries({ queryKey: courseKey, exact: true }), queryClient.invalidateQueries({ queryKey: courseProgressQueryOptions(groupId, courseId).queryKey })]);
  };
  const flushed = async () => {
    if (!(await autosave.flush())) throw new ApiError(409, "VERSION_CONFLICT", t("errors.VERSION_CONFLICT"));
  };
  const publish = () => run("publish", async () => {
    await flushed();
    const next = await lessonAction(`${path}/publish`, { draftVersion: autosave.version() });
    setProblems([]); clearLocalLessonDraft(localKey);
    await afterPublishChange(next);
  });
  // Publishing deletes the threads of practices in neither document, so the owner confirms when any of them has answers.
  const answeredRemovals = () => {
    const parsed = toLessonDocument(editor.document as unknown as EditorBlock[]);
    const kept = new Set(parsed.success ? collectPracticeIds(parsed.data) : []);
    return Object.entries(lesson.answerCounts).filter(([id, count]) => count > 0 && !kept.has(id)).length;
  };
  const requestPublish = () => { if (answeredRemovals() > 0) setConfirm("removesAnswers"); else void publish(); };
  const discard = () => run("discard", async () => {
    const next = await lessonAction(`${path}/discard`);
    clearLocalLessonDraft(localKey); setKept(null); setConflicts([]); setMerged(false);
    replaceContent(next.draft!.document);
    autosave.reset(next.draft!.version);
    await afterPublishChange(next);
  });
  const unpublish = () => run("unpublish", async () => { await afterPublishChange(await lessonAction(`${path}/unpublish`)); });
  const done = () => run("done", async () => { await autosave.flush(); onClose(); });
  const focusBlock = (blockId: string) => {
    if (!editor.getBlock(blockId)) return;
    editor.setTextCursorPosition(blockId, "start"); editor.focus();
    document.querySelector(`[data-id="${CSS.escape(blockId)}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  };
  // A word problem focuses the word's first empty field (the word, else its meaning) instead of the block.
  const focusProblem = ({ blockId, wordId }: LessonPublishProblem) => {
    const row = wordId && document.querySelector(`[data-id="${CSS.escape(blockId)}"] [data-word-id="${CSS.escape(wordId)}"]`);
    if (!row) { focusBlock(blockId); return; }
    const fields = [...row.querySelectorAll<HTMLInputElement>("input[data-word-field]")];
    const target = fields.find((field) => !field.value.trim()) ?? fields[0];
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target?.focus();
  };

  // Applies the author's pick for a merge conflict: the chosen version replaces the block's own content, or the block goes.
  const chooseVersion = (conflict: MergeConflict, choice: MergeChoice) => {
    setConflicts((list) => list.filter((entry) => entry.blockId !== conflict.blockId));
    const chosen = choice === "mine" ? conflict.local : conflict.server;
    if (!editor.getBlock(conflict.blockId)) return;
    if (!chosen) { editor.removeBlocks([conflict.blockId]); return; }
    const { type, props, content } = chosen as EditorBlock;
    editor.updateBlock(conflict.blockId, { type, props, ...(content === undefined ? {} : { content }) } as PartialBlock<typeof lessonEditorSchema.blockSchema>);
  };

  const slashItems = useMemo((): DefaultReactSuggestionItem[] => {
    const allowed = ["heading", "heading_2", "heading_3", "paragraph", "bullet_list", "numbered_list", "divider", "image"] as const;
    const builtIn = getDefaultReactSlashMenuItems(editor).flatMap((item) => {
      const key = (item as { key?: string }).key as (typeof allowed)[number] | undefined;
      return key && allowed.includes(key) ? [{ ...item, title: t(`courses.editor.slash.${key}`), subtext: undefined, group: t(key === "image" ? "courses.editor.slashGroups.media" : "courses.editor.slashGroups.text") }] : [];
    });
    const group = t("courses.editor.slashGroups.lesson");
    const custom: DefaultReactSuggestionItem[] = [
      { title: t("courses.editor.blocks.callout"), group, icon: <Lightbulb size={18} />, aliases: ["callout", "hint", "note"],
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout", props: { variant: "hint", icon: "auto" } }) },
      { title: t("courses.editor.blocks.example"), group, icon: <BookOpenText size={18} />, aliases: ["example", "sentence"],
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "example" }) },
      { title: t("courses.editor.blocks.dialogue"), group, icon: <MessagesSquare size={18} />, aliases: ["dialogue", "conversation"],
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "dialogue", props: { turns: DEFAULT_TURNS } }) },
      { title: t("courses.editor.blocks.practice"), group, icon: <PencilLine size={18} />, aliases: ["practice", "exercise", "quiz"],
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "practice", props: { data: DEFAULT_PRACTICE } }) },
      { title: t("courses.editor.blocks.vocabulary"), group, icon: <Languages size={18} />, aliases: ["words", "vocabulary", "vocab", "glossary"],
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "vocabulary", props: { data: newVocabularyData() } }) },
      { title: t("emojiPicker.title"), group, icon: <Smile size={18} />, aliases: ["emoji", "smiley"], onItemClick: () => setEmojiOpen(true) },
    ];
    const columnIcons = [<Columns2 key="two" size={18} />, <Columns3 key="three" size={18} />];
    const columns = getMultiColumnSlashMenuItems(editor).map((item, index) => ({ ...item, icon: columnIcons[index] }));
    return [...builtIn, ...columns, ...custom];
  }, [editor, t]);
  return <div className={styles.editorShell} aria-label={t("courses.editor.label")}>
    <LessonPublishBar owner={owner} published={current.published} changed={current.changed} status={autosave.status} editorName={current.editorName}
      problems={problems} error={error} busy={busy} onPublish={requestPublish} onDiscard={() => setConfirm("discard")} onUnpublish={() => setConfirm("unpublish")}
      onFocusProblem={focusProblem} onDone={() => void done()} />
    {restored && <p className={styles.notice} role="status">{t("courses.editor.restored")} <button type="button" onClick={() => setRestored(false)}>{t("common.dismiss")}</button></p>}
    {kept && <div className={styles.conflict} role="alert">
      <p>{t("courses.editor.conflictTitle")}</p>
      <p>{t("courses.editor.conflictBody")}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => { const mine = kept; setKept(null); editor.replaceBlocks(editor.document, toEditorBlocks(mine) ?? [{ type: "paragraph" }]); }}>{t("courses.editor.useMine")}</Button>
        <Button variant="quiet" onClick={() => { clearLocalLessonDraft(localKey); setKept(null); }}>{t("courses.editor.dropMine")}</Button>
      </div>
    </div>}
    {merged && <p className={styles.notice} role="status">{t("courses.editor.merged")} <button type="button" onClick={() => setMerged(false)}>{t("common.dismiss")}</button></p>}
    <LessonMergeConflicts conflicts={conflicts} onChoose={chooseVersion} onShow={focusBlock} />
    {autosave.status === "invalid" && <p className={styles.notice} role="alert">{t("courses.editor.invalid")}</p>}
    <div className={styles.toolRow}>
      <Popover opened={emojiOpen} onChange={setEmojiOpen} position="bottom-start" withinPortal trapFocus>
        <Popover.Target>
          <Button variant="quiet" onClick={() => setEmojiOpen((open) => !open)} aria-label={t("emojiPicker.title")}><Smile size={18} aria-hidden="true" /></Button>
        </Popover.Target>
        <Popover.Dropdown className={styles.emojiDropdown}>
          <EmojiPicker onSelect={(emoji) => { setEmojiOpen(false); editor.focus(); editor.insertInlineContent(emoji); }} />
        </Popover.Dropdown>
      </Popover>
      <span className={styles.help}>{t("courses.editor.slashHelp")}</span>
    </div>
    <div className={styles.editor} onKeyDownCapture={onKeyDownCapture} onDropCapture={onDropCapture}>
      <BlockNoteView editor={editor} theme={editorTheme} slashMenu={false} emojiPicker={false} formattingToolbar={false} filePanel={false} onChange={onChange}>
        <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems(slashItems, query)} />
        <FormattingToolbarController formattingToolbar={LessonFormattingToolbar} />
        <FilePanelController filePanel={LessonFilePanel} />
      </BlockNoteView>
    </div>
    <LessonImageDialog path={path} file={upload?.file ?? null}
      onUploaded={(image) => { upload?.resolve({ props: { url: image.url, name: "" } }); setUpload(null); }}
      onCancel={() => { upload?.resolve({}); setUpload(null); }} />
    <ConfirmDialog opened={confirm === "discard"} onClose={() => setConfirm(null)} title={t("courses.editor.discardTitle")} confirmLabel={t("courses.editor.discard")} cancelLabel={t("common.cancel")}
      onConfirm={() => { setConfirm(null); void discard(); }}>{t("courses.editor.discardConfirm")}</ConfirmDialog>
    <ConfirmDialog opened={confirm === "unpublish"} onClose={() => setConfirm(null)} title={t("courses.editor.unpublishTitle")} confirmLabel={t("courses.editor.unpublish")} cancelLabel={t("common.cancel")}
      onConfirm={() => { setConfirm(null); void unpublish(); }}>{t("courses.editor.unpublishConfirm")}</ConfirmDialog>
    <ConfirmDialog opened={confirm === "removesAnswers"} onClose={() => setConfirm(null)} title={t("courses.editor.removesAnswersTitle")} confirmLabel={t("courses.editor.publishAnyway")} cancelLabel={t("common.cancel")}
      onConfirm={() => { setConfirm(null); void publish(); }}>{t("courses.editor.removesAnswersBody", { count: answeredRemovals() })}</ConfirmDialog>
  </div>;
}
