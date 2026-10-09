import {
  COURSE_NOTE_MAX, COURSE_SENTENCE_MAX, COURSE_WORD_FORMS_MAX, COURSE_WORD_MEANING_MAX, COURSE_WORD_TERM_MAX, COURSE_WORDS_PER_BLOCK_MAX, WORD_IPA_MAX, wordIpaSchema,
} from "@wordinator/contracts";
import type { VocabularyWord } from "@wordinator/contracts/lesson-document";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton, TextAreaField, TextField } from "../../ui";
import styles from "./LessonEditor.module.css";
import { WordSpeechStatus } from "./WordSpeechStatus";

// The form of a New words block. Drafts accept empty terms and meanings (publishing reports them as `word-empty`), so
// every change is stored straight away. An optional field left empty is dropped rather than stored as "". A pronunciation
// the contracts refuse would make the whole block invalid, so it stays in the field with its message until it is valid.
const optionalFields = ["forms", "example", "note", "ipa"] as const;
type OptionalField = (typeof optionalFields)[number];

export const newVocabularyWord = (): VocabularyWord => ({ id: crypto.randomUUID(), term: "", meaning: "" });
const hasDetails = (word: VocabularyWord) => optionalFields.some((field) => word[field]?.trim());

export function VocabularyFields({ words, onChange }: { words: readonly VocabularyWord[]; onChange: (words: VocabularyWord[]) => void }) {
  const { t } = useTranslation();
  // Rows with forms, an example, or a note start expanded; the others show only the word and its meaning.
  const [expanded, setExpanded] = useState(() => new Set(words.filter(hasDetails).map((word) => word.id)));
  const [invalidIpa, setInvalidIpa] = useState<Record<string, string>>({});
  const setWord = (index: number, patch: Partial<VocabularyWord>) => onChange(words.map((word, current) => current === index ? { ...word, ...patch } : word));
  const setOptional = (index: number, field: OptionalField, value: string) => {
    const { [field]: _, ...rest } = words[index]!;
    onChange(words.map((word, current) => current === index ? (value ? { ...rest, [field]: value } : rest) : word));
  };
  const setIpa = (index: number, value: string) => {
    const { id } = words[index]!;
    const valid = wordIpaSchema.safeParse(value.trim()).success;
    setInvalidIpa(({ [id]: _, ...rest }) => valid ? rest : { ...rest, [id]: value });
    if (valid) setOptional(index, "ipa", value.trim() ? value : "");
  };
  const move = (index: number, offset: -1 | 1) => {
    const next = [...words];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    onChange(next);
  };
  const toggle = (id: string) => setExpanded((open) => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  return <fieldset className={styles.fields}>
    <legend>{t("courses.editor.fields.words")}</legend>
    {words.map((word, index) => {
      const number = index + 1;
      const open = expanded.has(word.id);
      return <div className={styles.wordRow} key={word.id} data-word-id={word.id}>
        <div className={styles.wordMain}>
          <TextField label={t("courses.editor.fields.wordTerm", { number })} value={word.term} maxLength={COURSE_WORD_TERM_MAX} required data-word-field="term"
            onChange={(event) => setWord(index, { term: event.currentTarget.value })} />
          <TextField label={t("courses.editor.fields.wordMeaning", { number })} value={word.meaning} maxLength={COURSE_WORD_MEANING_MAX} required data-word-field="meaning"
            onChange={(event) => setWord(index, { meaning: event.currentTarget.value })} />
        </div>
        {open && <>
          <TextField label={t("courses.editor.fields.wordForms", { number })} value={word.forms ?? ""} maxLength={COURSE_WORD_FORMS_MAX}
            onChange={(event) => setOptional(index, "forms", event.currentTarget.value)} />
          <TextAreaField label={t("courses.editor.fields.wordExample", { number })} value={word.example ?? ""} maxLength={COURSE_SENTENCE_MAX} autosize minRows={1}
            onChange={(event) => setOptional(index, "example", event.currentTarget.value)} />
          <TextAreaField label={t("courses.editor.fields.wordNote", { number })} value={word.note ?? ""} maxLength={COURSE_NOTE_MAX} autosize minRows={1}
            onChange={(event) => setOptional(index, "note", event.currentTarget.value)} />
          <TextField label={t("courses.editor.fields.wordIpa", { number })} description={t("courses.editor.fields.wordIpaHelp")} lang="und-fonipa" spellCheck={false}
            value={invalidIpa[word.id] ?? word.ipa ?? ""} maxLength={WORD_IPA_MAX} error={word.id in invalidIpa ? t("courses.editor.fields.wordIpaInvalid") : undefined}
            onChange={(event) => setIpa(index, event.currentTarget.value)} />
        </>}
        <WordSpeechStatus word={word} />
        <div className={styles.rowActions}>
          <Button variant="quiet" aria-expanded={open} onClick={() => toggle(word.id)}>
            {t("courses.editor.wordDetails", { number })}
          </Button>
          <IconButton label={t("courses.editor.moveWordUp", { number })} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></IconButton>
          <IconButton label={t("courses.editor.moveWordDown", { number })} disabled={index === words.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></IconButton>
          <Button variant="quiet" disabled={words.length < 2} onClick={() => onChange(words.filter((_, current) => current !== index))}>{t("courses.editor.removeWord", { number })}</Button>
        </div>
      </div>;
    })}
    <Button variant="secondary" disabled={words.length >= COURSE_WORDS_PER_BLOCK_MAX} onClick={() => onChange([...words, newVocabularyWord()])}>{t("courses.editor.addWord")}</Button>
  </fieldset>;
}
