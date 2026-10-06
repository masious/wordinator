import "@blocknote/mantine/style.css";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type PartialBlock } from "@blocknote/core";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import {
  BasicTextStyleButton, BlockTypeSelect, ColorStyleButton, CreateLinkButton, FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems,
  SuggestionMenuController, useCreateBlockNote, type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { Popover } from "@mantine/core";
import type { CourseDetailResponse } from "@wordinator/contracts/lesson-document";
import {
  collectPracticeIds, lessonNotReadySchema, lessonResponseSchema, type CourseLesson, type LessonDocument, type LessonDraft, type LessonPublishProblem,
} from "@wordinator/contracts/lesson-document";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Heading1, Heading2, Heading3, List, ListOrdered, Lightbulb, MessagesSquare, PencilLine, Pilcrow, Smile } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, courseProgressQueryOptions, courseQueryOptions, lessonQueryOptions } from "../../api";
import { EmojiPicker } from "../../molecules/EmojiPicker";
import { Button, ConfirmDialog } from "../../ui";
import { lessonEditorDictionary } from "./editorDictionary";
import { DEFAULT_PRACTICE, DEFAULT_TURNS, lessonEditorSchema, type LessonEditorInstance } from "./editorSchema";
import {
  clearLocalLessonDraft, lessonDocumentDraftKey, readLocalLessonDraft, sameDocument, toLessonDocument, type EditorBlock,
} from "./lessonDraft";
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

type Props = { groupId: string; courseId: string; accountId: string; owner: boolean; lesson: CourseLesson; onClose: () => void };
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
  const [current, setCurrent] = useState({ published: lesson.published, changed: lesson.changed, editorName: lesson.updatedBy.displayName });

  const editor = useCreateBlockNote({
    schema: lessonEditorSchema,
    initialContent: toEditorBlocks(start.document),
    dictionary: lessonEditorDictionary(t),
    tabBehavior: "prefer-navigate-ui",
  }) as LessonEditorInstance;

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
    // For now a conflict loads the newer draft and keeps the local edit on this device until the author decides.
    onConflict: (server: LessonDraft, local: LessonDocument) => {
      replaceContent(server.document);
      setKept(local);
    },
  });
  // A restored local edit is saved like any other change.
  useEffect(() => { if (start.restored) autosave.schedule(start.document); }, [autosave.schedule, start]);

  const onChange = () => {
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
    clearLocalLessonDraft(localKey); setKept(null);
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

  const slashItems = useMemo((): DefaultReactSuggestionItem[] => {
    const allowed = ["heading", "heading_2", "heading_3", "paragraph", "bullet_list", "numbered_list", "divider"] as const;
    const builtIn = getDefaultReactSlashMenuItems(editor).flatMap((item) => {
      const key = (item as { key?: string }).key as (typeof allowed)[number] | undefined;
      return key && allowed.includes(key) ? [{ ...item, title: t(`courses.editor.slash.${key}`), subtext: undefined, group: t("courses.editor.slashGroups.text") }] : [];
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
      { title: t("emojiPicker.title"), group, icon: <Smile size={18} />, aliases: ["emoji", "smiley"], onItemClick: () => setEmojiOpen(true) },
    ];
    return [...builtIn, ...custom];
  }, [editor, t]);
  const blockTypes = useMemo(() => [
    { name: t("courses.editor.slash.paragraph"), type: "paragraph", icon: Pilcrow },
    { name: t("courses.editor.slash.heading"), type: "heading", props: { level: 1 }, icon: Heading1 },
    { name: t("courses.editor.slash.heading_2"), type: "heading", props: { level: 2 }, icon: Heading2 },
    { name: t("courses.editor.slash.heading_3"), type: "heading", props: { level: 3 }, icon: Heading3 },
    { name: t("courses.editor.slash.bullet_list"), type: "bulletListItem", icon: List },
    { name: t("courses.editor.slash.numbered_list"), type: "numberedListItem", icon: ListOrdered },
  ], [t]);

  return <div className={styles.editorShell} aria-label={t("courses.editor.label")}>
    <LessonPublishBar owner={owner} published={current.published} changed={current.changed} status={autosave.status} editorName={current.editorName}
      problems={problems} error={error} busy={busy} onPublish={requestPublish} onDiscard={() => setConfirm("discard")} onUnpublish={() => setConfirm("unpublish")}
      onFocusBlock={focusBlock} onDone={() => void done()} />
    {restored && <p className={styles.notice} role="status">{t("courses.editor.restored")} <button type="button" onClick={() => setRestored(false)}>{t("common.dismiss")}</button></p>}
    {kept && <div className={styles.conflict} role="alert">
      <p>{t("courses.editor.conflictTitle")}</p>
      <p>{t("courses.editor.conflictBody")}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => { const mine = kept; setKept(null); editor.replaceBlocks(editor.document, toEditorBlocks(mine) ?? [{ type: "paragraph" }]); }}>{t("courses.editor.useMine")}</Button>
        <Button variant="quiet" onClick={() => { clearLocalLessonDraft(localKey); setKept(null); }}>{t("courses.editor.dropMine")}</Button>
      </div>
    </div>}
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
    <div className={styles.editor} onKeyDownCapture={onKeyDownCapture}>
      <BlockNoteView editor={editor} theme={editorTheme} slashMenu={false} emojiPicker={false} formattingToolbar={false} onChange={onChange}>
        <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems(slashItems, query)} />
        <FormattingToolbarController formattingToolbar={() => <FormattingToolbar>
          <BlockTypeSelect key="type" items={blockTypes} />
          <BasicTextStyleButton key="bold" basicTextStyle="bold" />
          <BasicTextStyleButton key="italic" basicTextStyle="italic" />
          <ColorStyleButton key="color" />
          <CreateLinkButton key="link" />
        </FormattingToolbar>} />
      </BlockNoteView>
    </div>
    <ConfirmDialog opened={confirm === "discard"} onClose={() => setConfirm(null)} title={t("courses.editor.discardTitle")} confirmLabel={t("courses.editor.discard")} cancelLabel={t("common.cancel")}
      onConfirm={() => { setConfirm(null); void discard(); }}>{t("courses.editor.discardConfirm")}</ConfirmDialog>
    <ConfirmDialog opened={confirm === "unpublish"} onClose={() => setConfirm(null)} title={t("courses.editor.unpublishTitle")} confirmLabel={t("courses.editor.unpublish")} cancelLabel={t("common.cancel")}
      onConfirm={() => { setConfirm(null); void unpublish(); }}>{t("courses.editor.unpublishConfirm")}</ConfirmDialog>
    <ConfirmDialog opened={confirm === "removesAnswers"} onClose={() => setConfirm(null)} title={t("courses.editor.removesAnswersTitle")} confirmLabel={t("courses.editor.publishAnyway")} cancelLabel={t("common.cancel")}
      onConfirm={() => { setConfirm(null); void publish(); }}>{t("courses.editor.removesAnswersBody", { count: answeredRemovals() })}</ConfirmDialog>
  </div>;
}
