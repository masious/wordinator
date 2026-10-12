import { opaqueIdSchema } from "@wordinator/contracts";
import { wordDrillGradeResponseSchema, wordDrillModeSchema, wordDrillSourceSchema, type WordDrillCard as DrillCard, type WordDrillGradeRequest, type WordDrillResult } from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, ApiError, sessionQueryOptions, wordDrillQueryOptions, type WordDrillSettings } from "../api";
import { RevealSoundToggle } from "../molecules/Speech";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { gradeDrill, startDrill } from "../organisms/WordDrill/drillSession";
import { WordDrillCard } from "../organisms/WordDrill/WordDrillCard";
import { Button, EmptyState, ErrorState, LabelChip, LoadingState, Surface } from "../ui";
import styles from "./WordDrillPage.module.css";

// The drill route's search (docs/words.md#setup). Unknown settings fall back to the defaults, and a lesson drill without a valid
// lesson becomes a Weak words drill, so the page never asks the API for a deck it would refuse.
export function validateWordDrillSearch(search: Record<string, unknown>): WordDrillSettings {
  const source = wordDrillSourceSchema.safeParse(search.source);
  const direction = wordDrillModeSchema.safeParse(search.direction);
  const lesson = opaqueIdSchema.safeParse(search.lesson);
  const mode = direction.success ? direction.data : "mixed";
  return source.success && source.data === "lesson" && lesson.success ? { source: "lesson", lesson: lesson.data, direction: mode } : { source: "weak", direction: mode };
}

// One session's cards, shown one at a time. The first grade of each card is sent once, as soon as it is given; a failed save is
// kept to retry, and a word that is gone (404) finishes from the session's copy with its grade ignored.
function DrillRun({ groupId, cards, language, onAgain, onBack }: {
  groupId: string; cards: readonly DrillCard[]; language: string; onAgain: () => void; onBack: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState(() => startDrill(cards.length));
  const [revealed, setRevealed] = useState(false);
  const [unsaved, setUnsaved] = useState<ReadonlyMap<number, WordDrillResult>>(new Map());
  const save = useMutation({
    mutationFn: ({ index, result }: { index: number; result: WordDrillResult }) => {
      const { word, course, direction } = cards[index]!;
      const path = `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(course.id)}/lessons/${encodeURIComponent(word.lessonId)}/words/${encodeURIComponent(word.id)}/drill/${direction}`;
      return apiRequest(path, wordDrillGradeResponseSchema, { method: "PUT", body: JSON.stringify({ result } satisfies WordDrillGradeRequest) });
    },
    onError: (error, { index, result }) => {
      if (error instanceof ApiError && error.status === 404) return;
      setUnsaved((current) => new Map(current).set(index, result));
    },
  });
  const grade = (result: WordDrillResult) => {
    const index = state.queue[0];
    if (index === undefined) return;
    if (!state.first.has(index)) save.mutate({ index, result });
    setState(gradeDrill(state, result));
    setRevealed(false);
  };
  const retry = () => {
    const pending = [...unsaved];
    setUnsaved(new Map());
    for (const [index, result] of pending) save.mutate({ index, result });
  };
  const failure = unsaved.size > 0 && <p className={styles.failure} role="status">
    {t("drill.unsaved", { count: unsaved.size })} <Button variant="quiet" onClick={retry}>{t("common.retry")}</Button>
  </p>;
  const current = state.queue[0];
  if (current === undefined) {
    const firstResults = [...state.first.values()];
    return <Surface className={styles.summary}>
      <h2 className={styles.summaryTitle}>{t("drill.summary.title")}</h2>
      <dl className={styles.counts}>
        <div><dt>{t("drill.summary.got")}</dt><dd>{firstResults.filter((result) => result === "got").length}</dd></div>
        <div><dt>{t("drill.summary.again")}</dt><dd>{firstResults.filter((result) => result === "again").length}</dd></div>
      </dl>
      {failure}
      <div className={styles.summaryActions}>
        <Button variant="secondary" onClick={onBack}>{t("drill.backToWords")}</Button>
        <Button onClick={onAgain}>{t("drill.drillAgain")}</Button>
      </div>
    </Surface>;
  }
  return <div className={styles.session}>
    <div className={styles.toolbar}>
      <span className={styles.status}>
        <p className={styles.counter}>{t("drill.counter", { retired: state.retired, total: cards.length })}</p>
        <RevealSoundToggle />
      </span>
      <Button variant="quiet" onClick={onBack}>{t("drill.backToWords")}</Button>
    </div>
    <WordDrillCard key={state.shown} card={cards[current]!} language={language} revealed={revealed} autoFocus={state.shown > 0}
      onReveal={() => setRevealed(true)} onGrade={grade} />
    {failure}
  </div>;
}

// A session: its deck, fetched once, then the cards; Drill again starts the next session with a fresh deck.
function DrillSession({ groupId, settings, run, language, onAgain, onBack }: {
  groupId: string; settings: WordDrillSettings; run: number; language: string; onAgain: () => void; onBack: () => void;
}) {
  const { t } = useTranslation();
  const deck = useQuery(wordDrillQueryOptions(groupId, settings, run));
  if (deck.isPending) return <LoadingState label={t("drill.loading")} />;
  if (deck.isError) {
    if (deck.error instanceof ApiError && deck.error.status === 404) {
      return <Surface tone="quiet"><EmptyState title={t("drill.lessonUnavailable")} action={<Button onClick={onBack}>{t("drill.backToWords")}</Button>} /></Surface>;
    }
    return <ErrorState title={t("drill.unavailable")}><Button onClick={() => deck.refetch()}>{t("common.retry")}</Button></ErrorState>;
  }
  if (!deck.data.cards.length) {
    return <Surface tone="quiet"><EmptyState title={t("drill.emptyTitle")} action={<Button onClick={onBack}>{t("drill.backToWords")}</Button>}>
      {settings.source === "weak" ? t("drill.emptyWeak") : t("drill.emptyLesson")}
    </EmptyState></Surface>;
  }
  return <DrillRun groupId={groupId} cards={deck.data.cards} language={language} onAgain={onAgain} onBack={onBack} />;
}

// The drill page (C12e): self-graded cards one at a time, then a short summary. Desktop only, like other new work.
export function WordDrillPage({ groupId, settings, onBack }: { groupId: string; settings: WordDrillSettings; onBack: () => void }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  const [run, setRun] = useState(0);
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("drill.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const libraryLanguage = session.data.groups[0]?.language;
  const language = libraryLanguage ? t(`languages.${libraryLanguage}`) : "";
  const subtitle = settings.source === "weak" ? t("drill.setup.weak") : t("drill.setup.lesson");
  const direction = settings.direction === "mixed" ? t("drill.setup.mixed") : t(`drill.setup.${settings.direction}`, { language });
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.page}>
      <header className={styles.header}>
        <LabelChip>{t("drill.eyebrow")}</LabelChip>
        <h1 className={styles.title}>{t("drill.title")}</h1>
        <p className={styles.settings}>{t("drill.settings", { source: subtitle, direction })}</p>
      </header>
      <DrillSession key={`${run}:${settings.source}:${settings.lesson ?? ""}:${settings.direction}`} groupId={groupId} settings={settings} run={run}
        language={language} onAgain={() => setRun((value) => value + 1)} onBack={onBack} />
    </div>
  </GroupFrame>;
}
