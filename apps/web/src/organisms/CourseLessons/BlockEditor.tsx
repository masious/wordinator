import {
  blockResponseSchema, COURSE_AUTHORS_VERSION_MAX, COURSE_BLOCK_TEXT_MAX, COURSE_DIALOGUE_TURNS_MAX, COURSE_HEADING_MAX, COURSE_INSTRUCTION_MAX, COURSE_NOTE_MAX,
  COURSE_PRACTICE_ITEMS_MAX, COURSE_SENTENCE_MAX, COURSE_SPEAKER_MAX, countBlanks, courseBlockKindSchema, type CourseBlock, type CourseBlockContentInput, type CourseBlockKind, type CourseLesson,
} from "@wordinator/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, lessonQueryOptions } from "../../api";
import { Button, CheckboxField, SelectField, TextAreaField, TextField } from "../../ui";
import { CourseErrorMessage } from "./CourseErrorMessage";
import styles from "./CourseLessons.module.css";

type Turn = { speaker: string; text: string };
type PracticeItem = { prompt: string; authorsVersion: string[]; note: string };
type Fields = {
  title: string; content: string; sentence: string; translation: string; note: string; turns: Turn[];
  instruction: string; passage: boolean; passageTitle: string; passageContent: string; items: PracticeItem[];
};
type BlockDraft = { version: 1; kind: CourseBlockKind; fields: Fields; published: boolean };

// Unsaved block edits survive navigation and sign-out. The target is the block, or the lesson for a block not yet created.
export const courseBlockDraftKey = (accountId: string, groupId: string, targetId: string) => `wordinator:draft:v1:${accountId}:${groupId}:course-block:${targetId}`;

const emptyItem = (): PracticeItem => ({ prompt: "", authorsVersion: [], note: "" });
const emptyFields = (): Fields => ({
  title: "", content: "", sentence: "", translation: "", note: "", turns: [{ speaker: "A", text: "" }, { speaker: "B", text: "" }],
  instruction: "", passage: false, passageTitle: "", passageContent: "", items: [emptyItem()],
});

function fieldsFromBlock(block: CourseBlock): Fields {
  const fields = emptyFields();
  switch (block.kind) {
    case "heading": return { ...fields, title: block.payload.title };
    case "text": return { ...fields, content: block.payload.content };
    case "example": return { ...fields, sentence: block.payload.sentence, translation: block.payload.translation ?? "", note: block.payload.note ?? "" };
    case "dialogue": return { ...fields, turns: block.payload.turns };
    // Editors receive the reference alongside the learner payload; together they are the full practice.
    case "practice": return {
      ...fields, instruction: block.payload.instruction, passage: Boolean(block.payload.passage),
      passageTitle: block.payload.passage?.title ?? "", passageContent: block.payload.passage?.content ?? "",
      items: block.payload.items.map((item, index) => {
        const reference = block.reference?.items[index];
        return { prompt: item.prompt, authorsVersion: (reference?.authorsVersion ?? []).map((entry) => entry ?? ""), note: reference?.note ?? "" };
      }),
    };
  }
}

// A fill-in item keeps one author's version slot per blank; an open item keeps at most one.
function authorsVersionFor(item: PracticeItem) {
  const blanks = countBlanks(item.prompt);
  if (blanks === 0) return item.authorsVersion[0]?.trim() ? [item.authorsVersion[0]] : [];
  return Array.from({ length: blanks }, (_, index) => item.authorsVersion[index]?.trim() ? item.authorsVersion[index]! : null);
}

function contentFromFields(kind: CourseBlockKind, fields: Fields): CourseBlockContentInput {
  switch (kind) {
    case "heading": return { kind, payload: { title: fields.title } };
    case "text": return { kind, payload: { content: fields.content } };
    case "example": return { kind, payload: { sentence: fields.sentence, translation: fields.translation || null, note: fields.note || null } };
    case "dialogue": return { kind, payload: { turns: fields.turns } };
    case "practice": return { kind, payload: {
      instruction: fields.instruction,
      passage: fields.passage ? { title: fields.passageTitle || null, content: fields.passageContent } : null,
      items: fields.items.map((item) => ({ prompt: item.prompt, authorsVersion: authorsVersionFor(item), note: item.note || null })),
    } };
  }
}

// The full editable content of a stored block, used when a save changes only its published flag.
export const blockContent = (block: CourseBlock) => contentFromFields(block.kind, fieldsFromBlock(block));

const complete = (kind: CourseBlockKind, fields: Fields) => {
  switch (kind) {
    case "heading": return Boolean(fields.title.trim());
    case "text": return Boolean(fields.content.trim());
    case "example": return Boolean(fields.sentence.trim());
    case "dialogue": return fields.turns.length > 0 && fields.turns.every((turn) => turn.speaker.trim() && turn.text.trim());
    case "practice": return Boolean(fields.instruction.trim()) && fields.items.length > 0 && fields.items.every((item) => item.prompt.trim())
      && (!fields.passage || Boolean(fields.passageContent.trim()));
  }
};

function readDraft(key: string): BlockDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as BlockDraft | null;
    // Drafts saved before practice fields existed are filled in with empty practice fields.
    if (value?.version === 1 && courseBlockKindSchema.safeParse(value.kind).success && Array.isArray(value.fields?.turns)) return { ...value, fields: { ...emptyFields(), ...value.fields } };
  } catch { /* discard incompatible local data */ }
  return null;
}

export const hasBlockDraft = (key: string) => readDraft(key) !== null;

export function BlockEditor({ groupId, courseId, lessonId, accountId, block, canPublish = true, onClose }: {
  groupId: string; courseId: string; lessonId: string; accountId: string; block?: CourseBlock; canPublish?: boolean; onClose: () => void;
}) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const key = courseBlockDraftKey(accountId, groupId, block?.id ?? lessonId);
  const initial = useMemo<BlockDraft>(() => ({ version: 1, kind: block?.kind ?? "text", fields: block ? fieldsFromBlock(block) : emptyFields(), published: block?.published ?? false }), [block]);
  const [draft, setDraft] = useState<BlockDraft>(() => readDraft(key) ?? initial);
  // The version this edit is based on. It changes only when the author explicitly keeps their edit over a newer save.
  const [baseVersion, setBaseVersion] = useState(block?.version);
  const restored = useMemo(() => readDraft(key) !== null, [key]);
  useEffect(() => {
    if (JSON.stringify(draft) === JSON.stringify(initial)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(draft));
  }, [draft, initial, key]);
  const lessonKey = lessonQueryOptions(groupId, courseId, lessonId).queryKey;
  const blocksPath = `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/blocks`;
  const save = useMutation({
    mutationFn: () => {
      const content = contentFromFields(draft.kind, draft.fields);
      // Contributors save drafts only; the owner decides what is published.
      const published = canPublish && draft.published;
      return block
        ? apiRequest(`${blocksPath}/${encodeURIComponent(block.id)}`, blockResponseSchema, { method: "PATCH", body: JSON.stringify({ ...content, published, version: baseVersion }) })
        : apiRequest(blocksPath, blockResponseSchema, { method: "POST", body: JSON.stringify({ ...content, published }) });
    },
    onSuccess: ({ block: saved }) => {
      localStorage.removeItem(key);
      queryClient.setQueryData(lessonKey, (current: { lesson: CourseLesson } | undefined) => current && {
        lesson: { ...current.lesson, blocks: block ? current.lesson.blocks.map((entry) => entry.id === saved.id ? saved : entry) : [...current.lesson.blocks, saved] },
      });
      onClose();
    },
  });
  const conflict = save.error instanceof ApiError && save.error.code === "VERSION_CONFLICT";
  const keepMine = async () => {
    const latest = await queryClient.fetchQuery({ ...lessonQueryOptions(groupId, courseId, lessonId), staleTime: 0 });
    const current = latest.lesson.blocks.find((entry) => entry.id === block?.id);
    if (current) setBaseVersion(current.version);
    save.reset();
  };
  const discard = async () => {
    localStorage.removeItem(key);
    onClose();
    await queryClient.invalidateQueries({ queryKey: lessonKey });
  };
  const setFields = (patch: Partial<Fields>) => setDraft((value) => ({ ...value, fields: { ...value.fields, ...patch } }));
  const setItem = (index: number, patch: Partial<PracticeItem>) => setFields({ items: draft.fields.items.map((item, current) => current === index ? { ...item, ...patch } : item) });
  const setVersion = (index: number, slot: number, value: string) => {
    const item = draft.fields.items[index]!; const next = [...item.authorsVersion];
    next[slot] = value; setItem(index, { authorsVersion: next });
  };
  const setTurn = (index: number, patch: Partial<Turn>) => setFields({ turns: draft.fields.turns.map((turn, current) => current === index ? { ...turn, ...patch } : turn) });
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };
  const { fields } = draft;
  return <form className={styles.editor} onSubmit={submit} aria-label={block ? t("courses.blocks.editTitle") : t("courses.blocks.addTitle")}>
    {restored && <p className={styles.restored}>{t("courses.blocks.restored")}</p>}
    {block
      ? <p className={styles.editorKind}>{t(`courses.blocks.kinds.${block.kind}`)}</p>
      : <SelectField label={t("courses.blocks.kind")} value={draft.kind} allowDeselect={false}
        data={courseBlockKindSchema.options.map((kind) => ({ value: kind, label: t(`courses.blocks.kinds.${kind}`) }))}
        onChange={(value) => { const kind = courseBlockKindSchema.safeParse(value); if (kind.success) setDraft((current) => ({ ...current, kind: kind.data })); }} />}
    {draft.kind === "heading" && <TextField label={t("courses.blocks.fields.title")} value={fields.title} maxLength={COURSE_HEADING_MAX} required onChange={(event) => setFields({ title: event.currentTarget.value })} />}
    {draft.kind === "text" && <TextAreaField label={t("courses.blocks.fields.content")} value={fields.content} maxLength={COURSE_BLOCK_TEXT_MAX} autosize minRows={4} required onChange={(event) => setFields({ content: event.currentTarget.value })} />}
    {draft.kind === "example" && <>
      <TextAreaField label={t("courses.blocks.fields.sentence")} value={fields.sentence} maxLength={COURSE_SENTENCE_MAX} autosize minRows={1} required onChange={(event) => setFields({ sentence: event.currentTarget.value })} />
      <TextAreaField label={t("courses.blocks.fields.translation")} value={fields.translation} maxLength={COURSE_SENTENCE_MAX} autosize minRows={1} onChange={(event) => setFields({ translation: event.currentTarget.value })} />
      <TextAreaField label={t("courses.blocks.fields.note")} value={fields.note} maxLength={COURSE_NOTE_MAX} autosize minRows={2} onChange={(event) => setFields({ note: event.currentTarget.value })} />
    </>}
    {draft.kind === "dialogue" && <fieldset className={styles.turns}>
      <legend>{t("courses.blocks.fields.turns")}</legend>
      {fields.turns.map((turn, index) => <div className={styles.turnRow} key={index}>
        <TextField className={styles.speakerField} label={t("courses.blocks.fields.speaker", { number: index + 1 })} value={turn.speaker} maxLength={COURSE_SPEAKER_MAX} required onChange={(event) => setTurn(index, { speaker: event.currentTarget.value })} />
        <TextAreaField className={styles.turnText} label={t("courses.blocks.fields.line", { number: index + 1 })} value={turn.text} maxLength={COURSE_SENTENCE_MAX} autosize minRows={1} required onChange={(event) => setTurn(index, { text: event.currentTarget.value })} />
        <Button variant="quiet" disabled={fields.turns.length < 2} onClick={() => setFields({ turns: fields.turns.filter((_, current) => current !== index) })}>{t("courses.blocks.removeTurn", { number: index + 1 })}</Button>
      </div>)}
      <Button variant="secondary" disabled={fields.turns.length >= COURSE_DIALOGUE_TURNS_MAX} onClick={() => setFields({ turns: [...fields.turns, { speaker: "", text: "" }] })}>{t("courses.blocks.addTurn")}</Button>
    </fieldset>}
    {draft.kind === "practice" && <>
      <TextAreaField label={t("courses.blocks.fields.instruction")} value={fields.instruction} maxLength={COURSE_INSTRUCTION_MAX} autosize minRows={1} required onChange={(event) => setFields({ instruction: event.currentTarget.value })} />
      <CheckboxField label={t("courses.blocks.fields.passage")} checked={fields.passage} onChange={(event) => setFields({ passage: event.currentTarget.checked })} />
      {fields.passage && <>
        <TextField label={t("courses.blocks.fields.passageTitle")} value={fields.passageTitle} maxLength={COURSE_HEADING_MAX} onChange={(event) => setFields({ passageTitle: event.currentTarget.value })} />
        <TextAreaField label={t("courses.blocks.fields.passageContent")} value={fields.passageContent} maxLength={COURSE_BLOCK_TEXT_MAX} autosize minRows={4} required onChange={(event) => setFields({ passageContent: event.currentTarget.value })} />
      </>}
      <fieldset className={styles.turns}>
        <legend>{t("courses.blocks.fields.items")}</legend>
        <p className={styles.fieldHelp}>{t("courses.blocks.fields.itemsHelp")}</p>
        {fields.items.map((item, index) => {
          const blanks = countBlanks(item.prompt);
          return <div className={styles.practiceItem} key={index}>
            <TextAreaField label={t("courses.blocks.fields.prompt", { number: index + 1 })} value={item.prompt} maxLength={COURSE_SENTENCE_MAX} autosize minRows={1} required onChange={(event) => setItem(index, { prompt: event.currentTarget.value })} />
            {blanks === 0
              ? <TextField label={t("courses.blocks.fields.authorsVersion", { number: index + 1 })} value={item.authorsVersion[0] ?? ""} maxLength={COURSE_AUTHORS_VERSION_MAX} onChange={(event) => setVersion(index, 0, event.currentTarget.value)} />
              : Array.from({ length: blanks }, (_, slot) => <TextField key={slot} label={t("courses.blocks.fields.authorsVersionBlank", { number: index + 1, blank: slot + 1 })} value={item.authorsVersion[slot] ?? ""} maxLength={COURSE_AUTHORS_VERSION_MAX} onChange={(event) => setVersion(index, slot, event.currentTarget.value)} />)}
            <TextAreaField label={t("courses.blocks.fields.itemNote", { number: index + 1 })} value={item.note} maxLength={COURSE_NOTE_MAX} autosize minRows={1} onChange={(event) => setItem(index, { note: event.currentTarget.value })} />
            <Button variant="quiet" disabled={fields.items.length < 2} onClick={() => setFields({ items: fields.items.filter((_, current) => current !== index) })}>{t("courses.blocks.removeItem", { number: index + 1 })}</Button>
          </div>;
        })}
        <Button variant="secondary" disabled={fields.items.length >= COURSE_PRACTICE_ITEMS_MAX} onClick={() => setFields({ items: [...fields.items, emptyItem()] })}>{t("courses.blocks.addItem")}</Button>
      </fieldset>
    </>}
    {canPublish && <CheckboxField label={t("courses.blocks.publishedField")} checked={draft.published} onChange={(event) => { const published = event.currentTarget.checked; setDraft((value) => ({ ...value, published })); }} />}
    {conflict
      ? <div className={styles.conflict} role="alert">
        <p>{t("courses.conflict.body")}</p>
        <div className={styles.actions}><Button variant="secondary" onClick={() => void keepMine()}>{t("courses.conflict.keepMine")}</Button><Button variant="quiet" onClick={() => void discard()}>{t("courses.conflict.discardMine")}</Button></div>
      </div>
      : <CourseErrorMessage error={save.error} />}
    <div className={styles.actions}>
      <Button variant="quiet" onClick={() => void discard()}>{t("courses.blocks.discard")}</Button>
      <Button type="submit" loading={save.isPending} disabled={conflict || !complete(draft.kind, fields)}>{block ? t("courses.blocks.save") : t("courses.blocks.add")}</Button>
    </div>
  </form>;
}
