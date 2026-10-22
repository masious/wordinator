import { MultiSelect } from "@mantine/core";
import { wordSearchKey } from "@wordinator/contracts/lesson-document";
import {
  TUTOR_WORD_PRACTICE_MAX, WORD_PRACTICE_LESSONS_MAX, tutorConversationResponseSchema, wordPracticeResponseSchema,
  type CreateTutorConversationRequest, type WordPracticeCandidate, type WordPracticeSource,
} from "@wordinator/contracts/tutor";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../api";
import { AdaptiveDialog, Button, CheckboxField, LoadingState } from "../../ui";
import styles from "./WordPracticeDialog.module.css";

// Word practice (experimental): after a drill the learner picks up to 15 words for a short tutor practice. The words missed in
// the drill come first; weak and never-practised words of chosen lessons (the drill's lessons to begin with) fill the rest, about
// half each, until the learner changes the picks. Start creates the word practice conversation and opens it.

export type PracticeWord = { lessonId: string; wordId: string; term: string; meaning: string };
type Picked = { lessonId: string; wordId: string; term: string; source: WordPracticeSource };
const keyOf = (word: { lessonId: string; wordId: string }) => `${word.lessonId}:${word.wordId}`;

// Weak and new words in turn, so the remaining places are shared about evenly; one runs out, the other fills in.
export function balancedPicks(candidates: readonly WordPracticeCandidate[], room: number): WordPracticeCandidate[] {
  const weak = candidates.filter((word) => word.source === "weak");
  const fresh = candidates.filter((word) => word.source === "new");
  const picks: WordPracticeCandidate[] = [];
  while (picks.length < room && (weak.length || fresh.length)) {
    const next = (picks.length % 2 === 0 ? weak.shift() ?? fresh.shift() : fresh.shift() ?? weak.shift())!;
    picks.push(next);
  }
  return picks;
}

function PracticeForm({ drillWords, lessonIds, onClose, onStarted }: {
  drillWords: readonly PracticeWord[]; lessonIds: readonly string[]; onClose: () => void; onStarted: (conversationId: string) => void;
}) {
  const { t } = useTranslation();
  const [lessons, setLessons] = useState<string[]>(() => [...new Set(lessonIds)].slice(0, WORD_PRACTICE_LESSONS_MAX));
  const drillKeys = useMemo(() => new Set(drillWords.map((word) => wordSearchKey(word.term))), [drillWords]);
  const [picked, setPicked] = useState<ReadonlyMap<string, Picked>>(() => new Map(drillWords.slice(0, TUTOR_WORD_PRACTICE_MAX)
    .map((word) => [keyOf(word), { lessonId: word.lessonId, wordId: word.wordId, term: word.term, source: "drill" as const }])));
  const [touched, setTouched] = useState(false);
  const query = useQuery({
    queryKey: ["tutor", "word-practice", lessons],
    queryFn: () => apiRequest(`/api/ai/word-practice?lessons=${lessons.map(encodeURIComponent).join(",")}`, wordPracticeResponseSchema),
    placeholderData: keepPreviousData,
  });
  const candidates = useMemo(() => (query.data?.items ?? []).filter((word) => !drillKeys.has(wordSearchKey(word.term))), [query.data, drillKeys]);
  // Until the learner changes a pick, the candidates of the chosen lessons fill the places the drill words leave.
  useEffect(() => {
    if (touched || query.isPlaceholderData || !query.data) return;
    const drill = [...picked.values()].filter((word) => word.source === "drill");
    const fill = balancedPicks(candidates, TUTOR_WORD_PRACTICE_MAX - drill.length);
    setPicked(new Map([...drill, ...fill.map((word): Picked => ({ lessonId: word.lessonId, wordId: word.wordId, term: word.term, source: word.source }))].map((word) => [keyOf(word), word])));
    // Only new candidates refill; the picks themselves are this effect's output.
  }, [candidates, touched, query.isPlaceholderData]);
  const full = picked.size >= TUTOR_WORD_PRACTICE_MAX;
  const toggle = (word: Picked) => {
    setTouched(true);
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(keyOf(word))) next.delete(keyOf(word)); else if (next.size < TUTOR_WORD_PRACTICE_MAX) next.set(keyOf(word), word);
      return next;
    });
  };
  const start = useMutation({
    mutationFn: () => apiRequest("/api/ai/conversations", tutorConversationResponseSchema, {
      method: "POST",
      body: JSON.stringify({ wordPractice: [...picked.values()].map(({ lessonId, wordId, source }) => ({ lessonId, wordId, source })) } satisfies CreateTutorConversationRequest),
    }),
    onSuccess: (response) => onStarted(response.conversation.id),
  });
  const lessonData = useMemo(() => (query.data?.lessons ?? []).map((lesson) => ({ value: lesson.id, label: `${lesson.title} · ${lesson.courseTitle}` })), [query.data]);
  const row = (word: Picked, meaning: string, detail?: string) => <li key={keyOf(word)}>
    <CheckboxField checked={picked.has(keyOf(word))} disabled={!picked.has(keyOf(word)) && full} onChange={() => toggle(word)}
      label={<span className={styles.word}><strong>{word.term}</strong> <span>{meaning}</span>{detail && <span className={styles.detail}>{detail}</span>}</span>} />
  </li>;
  const group = (source: "weak" | "new") => {
    const words = candidates.filter((word) => word.source === source);
    return words.length > 0 && <section className={styles.group}>
      <h3 className={styles.groupTitle}>{t(`drill.wordPractice.${source}`)}</h3>
      <ul className={styles.list}>{words.map((word) => row({ lessonId: word.lessonId, wordId: word.wordId, term: word.term, source }, word.meaning, word.lessonTitle))}</ul>
    </section>;
  };
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (picked.size) start.mutate(); }}>
    <p className={styles.intro}>{t("drill.wordPractice.intro", { max: TUTOR_WORD_PRACTICE_MAX })}</p>
    {drillWords.length > 0 && <section className={styles.group}>
      <h3 className={styles.groupTitle}>{t("drill.wordPractice.fromDrill")}</h3>
      <ul className={styles.list}>{drillWords.map((word) => row({ lessonId: word.lessonId, wordId: word.wordId, term: word.term, source: "drill" }, word.meaning))}</ul>
    </section>}
    <MultiSelect label={t("drill.wordPractice.lessons")} placeholder={t("drill.wordPractice.lessonsPlaceholder")} data={lessonData} value={lessons}
      maxValues={WORD_PRACTICE_LESSONS_MAX} searchable clearable onChange={setLessons} />
    {query.isPending ? <LoadingState label={t("drill.wordPractice.loading")} />
      : query.isError ? <p className={styles.error} role="alert">{t("drill.wordPractice.unavailable")}</p>
      : candidates.length === 0 ? lessons.length > 0 && <p className={styles.intro}>{t("drill.wordPractice.none")}</p>
      : <>{group("weak")}{group("new")}</>}
    {start.isError && <p className={styles.error} role="alert">{t("drill.wordPractice.failed")}</p>}
    <div className={styles.actions}>
      <p className={styles.count} role="status">{full ? t("drill.wordPractice.full", { max: TUTOR_WORD_PRACTICE_MAX }) : t("drill.wordPractice.count", { count: picked.size, max: TUTOR_WORD_PRACTICE_MAX })}</p>
      <Button variant="quiet" onClick={onClose}>{t("common.cancel")}</Button>
      <Button type="submit" disabled={!picked.size} loading={start.isPending}>{t("drill.wordPractice.start")}</Button>
    </div>
  </form>;
}

export function WordPracticeDialog({ opened, onClose, ...props }: {
  opened: boolean; drillWords: readonly PracticeWord[]; lessonIds: readonly string[]; onClose: () => void; onStarted: (conversationId: string) => void;
}) {
  const { t } = useTranslation();
  return <AdaptiveDialog opened={opened} onClose={onClose} title={t("drill.wordPractice.title")}>
    {opened && <PracticeForm onClose={onClose} {...props} />}
  </AdaptiveDialog>;
}
