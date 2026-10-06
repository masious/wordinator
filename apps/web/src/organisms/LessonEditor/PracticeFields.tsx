import {
  COURSE_AUTHORS_VERSION_MAX, COURSE_BLOCK_TEXT_MAX, COURSE_DIALOGUE_TURNS_MAX, COURSE_HEADING_MAX, COURSE_INSTRUCTION_MAX, COURSE_NOTE_MAX,
  COURSE_PRACTICE_ITEMS_MAX, COURSE_SENTENCE_MAX, COURSE_SPEAKER_MAX, countBlanks, dialoguePayloadSchema, practicePayloadSchema, type PracticePayload,
} from "@wordinator/contracts";
import { useTranslation } from "react-i18next";
import { Button, CheckboxField, TextAreaField, TextField } from "../../ui";
import styles from "./LessonEditor.module.css";

// Form pieces for the structured lesson blocks. Dialogue turns and practices are stored as JSON strings in block props,
// so the editor keeps the form state itself and writes the props only when the form is valid.
export type Turn = { speaker: string; text: string };
export type PracticeItemFields = { prompt: string; authorsVersion: string[]; note: string };
export type PracticeFieldsValue = { instruction: string; passage: boolean; passageTitle: string; passageContent: string; items: PracticeItemFields[] };

const emptyItem = (): PracticeItemFields => ({ prompt: "", authorsVersion: [], note: "" });

export const practiceFieldsFromPayload = (payload: PracticePayload): PracticeFieldsValue => ({
  instruction: payload.instruction, passage: Boolean(payload.passage), passageTitle: payload.passage?.title ?? "", passageContent: payload.passage?.content ?? "",
  items: payload.items.map((item) => ({ prompt: item.prompt, authorsVersion: item.authorsVersion.map((entry) => entry ?? ""), note: item.note ?? "" })),
});

// A fill-in item keeps one author's version slot per blank; an open item keeps at most one.
function authorsVersionFor(item: PracticeItemFields) {
  const blanks = countBlanks(item.prompt);
  if (blanks === 0) return item.authorsVersion[0]?.trim() ? [item.authorsVersion[0]] : [];
  return Array.from({ length: blanks }, (_, index) => item.authorsVersion[index]?.trim() ? item.authorsVersion[index]! : null);
}

// Returns the payload when the form is complete enough to store, or null while it is not.
export function practicePayloadFromFields(fields: PracticeFieldsValue): PracticePayload | null {
  const parsed = practicePayloadSchema.safeParse({
    instruction: fields.instruction,
    passage: fields.passage ? { title: fields.passageTitle || null, content: fields.passageContent } : null,
    items: fields.items.map((item) => ({ prompt: item.prompt, authorsVersion: authorsVersionFor(item), note: item.note || null })),
  });
  return parsed.success ? parsed.data : null;
}

export const dialogueTurnsFromFields = (turns: Turn[]) => {
  const parsed = dialoguePayloadSchema.shape.turns.safeParse(turns);
  return parsed.success ? parsed.data : null;
};

export function DialogueFields({ turns, onChange }: { turns: Turn[]; onChange: (turns: Turn[]) => void }) {
  const { t } = useTranslation();
  const setTurn = (index: number, patch: Partial<Turn>) => onChange(turns.map((turn, current) => current === index ? { ...turn, ...patch } : turn));
  return <fieldset className={styles.fields}>
    <legend>{t("courses.editor.fields.turns")}</legend>
    {turns.map((turn, index) => <div className={styles.turnRow} key={index}>
      <TextField label={t("courses.editor.fields.speaker", { number: index + 1 })} value={turn.speaker} maxLength={COURSE_SPEAKER_MAX} required onChange={(event) => setTurn(index, { speaker: event.currentTarget.value })} />
      <TextAreaField label={t("courses.editor.fields.line", { number: index + 1 })} value={turn.text} maxLength={COURSE_SENTENCE_MAX} autosize minRows={1} required onChange={(event) => setTurn(index, { text: event.currentTarget.value })} />
      <Button variant="quiet" disabled={turns.length < 2} onClick={() => onChange(turns.filter((_, current) => current !== index))}>{t("courses.editor.removeTurn", { number: index + 1 })}</Button>
    </div>)}
    <Button variant="secondary" disabled={turns.length >= COURSE_DIALOGUE_TURNS_MAX} onClick={() => onChange([...turns, { speaker: "", text: "" }])}>{t("courses.editor.addTurn")}</Button>
  </fieldset>;
}

export function PracticeFields({ value, onChange }: { value: PracticeFieldsValue; onChange: (value: PracticeFieldsValue) => void }) {
  const { t } = useTranslation();
  const set = (patch: Partial<PracticeFieldsValue>) => onChange({ ...value, ...patch });
  const setItem = (index: number, patch: Partial<PracticeItemFields>) => set({ items: value.items.map((item, current) => current === index ? { ...item, ...patch } : item) });
  const setVersion = (index: number, slot: number, text: string) => {
    const next = [...value.items[index]!.authorsVersion];
    next[slot] = text; setItem(index, { authorsVersion: next });
  };
  return <div className={styles.fields}>
    <TextAreaField label={t("courses.editor.fields.instruction")} value={value.instruction} maxLength={COURSE_INSTRUCTION_MAX} autosize minRows={1} required onChange={(event) => set({ instruction: event.currentTarget.value })} />
    <CheckboxField label={t("courses.editor.fields.passage")} checked={value.passage} onChange={(event) => set({ passage: event.currentTarget.checked })} />
    {value.passage && <>
      <TextField label={t("courses.editor.fields.passageTitle")} value={value.passageTitle} maxLength={COURSE_HEADING_MAX} onChange={(event) => set({ passageTitle: event.currentTarget.value })} />
      <TextAreaField label={t("courses.editor.fields.passageContent")} value={value.passageContent} maxLength={COURSE_BLOCK_TEXT_MAX} autosize minRows={4} required onChange={(event) => set({ passageContent: event.currentTarget.value })} />
    </>}
    <fieldset className={styles.fields}>
      <legend>{t("courses.editor.fields.items")}</legend>
      <p className={styles.help}>{t("courses.editor.fields.itemsHelp")}</p>
      {value.items.map((item, index) => {
        const blanks = countBlanks(item.prompt);
        return <div className={styles.practiceItem} key={index}>
          <TextAreaField label={t("courses.editor.fields.prompt", { number: index + 1 })} value={item.prompt} maxLength={COURSE_SENTENCE_MAX} autosize minRows={1} required onChange={(event) => setItem(index, { prompt: event.currentTarget.value })} />
          {blanks === 0
            ? <TextField label={t("courses.editor.fields.authorsVersion", { number: index + 1 })} value={item.authorsVersion[0] ?? ""} maxLength={COURSE_AUTHORS_VERSION_MAX} onChange={(event) => setVersion(index, 0, event.currentTarget.value)} />
            : Array.from({ length: blanks }, (_, slot) => <TextField key={slot} label={t("courses.editor.fields.authorsVersionBlank", { number: index + 1, blank: slot + 1 })} value={item.authorsVersion[slot] ?? ""} maxLength={COURSE_AUTHORS_VERSION_MAX} onChange={(event) => setVersion(index, slot, event.currentTarget.value)} />)}
          <TextAreaField label={t("courses.editor.fields.itemNote", { number: index + 1 })} value={item.note} maxLength={COURSE_NOTE_MAX} autosize minRows={1} onChange={(event) => setItem(index, { note: event.currentTarget.value })} />
          <Button variant="quiet" disabled={value.items.length < 2} onClick={() => set({ items: value.items.filter((_, current) => current !== index) })}>{t("courses.editor.removeItem", { number: index + 1 })}</Button>
        </div>;
      })}
      <Button variant="secondary" disabled={value.items.length >= COURSE_PRACTICE_ITEMS_MAX} onClick={() => set({ items: [...value.items, emptyItem()] })}>{t("courses.editor.addItem")}</Button>
    </fieldset>
  </div>;
}
