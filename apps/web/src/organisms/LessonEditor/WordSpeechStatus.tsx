import { collectLessonWords, type DraftSpeech, type LessonDocument, type VocabularyWord } from "@wordinator/contracts/lesson-document";
import { speechItems, spokenText } from "@wordinator/contracts/speech";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SpeechButton } from "../../molecules/Speech";
import styles from "./LessonEditor.module.css";

// The audio status of a word's term in the editor (docs/speech.md#playback). `draftSpeech` describes the saved draft, so a
// word whose spoken term or IPA differs from its saved version is pending until it is saved and its job has run.
type DraftWordSpeech = { draftSpeech: DraftSpeech; saved: ReadonlyMap<string, { term: string; ipa: string | null }> };
const DraftWordSpeechContext = createContext<DraftWordSpeech | null>(null);

export function DraftWordSpeechScope({ document, draftSpeech, children }: { document: LessonDocument | null; draftSpeech: DraftSpeech | null; children: ReactNode }) {
  const value = useMemo(() => draftSpeech && document
    ? { draftSpeech, saved: new Map(collectLessonWords(document).map((word) => [word.id, { term: word.term, ipa: word.ipa }])) }
    : null, [document, draftSpeech]);
  return <DraftWordSpeechContext.Provider value={value}>{children}</DraftWordSpeechContext.Provider>;
}

// After a save, items whose voice, text, or IPA changed are pending until the next read says otherwise; the rest keep their status.
export function carryDraftSpeech(previous: LessonDocument, next: LessonDocument, draftSpeech: DraftSpeech | null): DraftSpeech | null {
  if (!draftSpeech) return draftSpeech;
  const signature = (item: ReturnType<typeof speechItems>[number]) => `${item.voice}\n${item.text}\n${item.ipa ?? ""}`;
  const before = new Map(speechItems(previous, null, "nl").map((item) => [item.key, signature(item)]));
  return Object.fromEntries(speechItems(next, null, "nl").map((item) => {
    const kept = before.get(item.key) === signature(item) ? draftSpeech[item.key] : undefined;
    return [item.key, kept ?? { status: "pending" as const, url: null }];
  }));
}

export const hasPendingSpeech = (draftSpeech: DraftSpeech | null | undefined) => Object.values(draftSpeech ?? {}).some((item) => item.status === "pending");

export function WordSpeechStatus({ word }: { word: VocabularyWord }) {
  const { t } = useTranslation();
  const scope = useContext(DraftWordSpeechContext);
  const term = spokenText(word.term);
  if (!scope || !term) return null;
  const saved = scope.saved.get(word.id);
  const current = saved && spokenText(saved.term) === term && saved.ipa === (word.ipa?.trim() || null);
  const item = current ? scope.draftSpeech[`word:${word.id}`] : undefined;
  const status = item?.status ?? "pending";
  return <p className={styles.wordSpeech} data-status={status}>
    <span>{t(`courses.editor.wordSpeech.${status}`)}</span>
    {status === "ready" && <SpeechButton url={item?.url} label={t("courses.speech.term", { term: word.term.trim() })} />}
  </p>;
}
