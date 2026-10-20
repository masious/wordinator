import { opaqueIdSchema } from "@wordinator/contracts";
import { wordDrillGradeResponseSchema, wordDrillModeSchema, wordDrillSourceSchema, type WordDrillCard as DrillCard, type WordDrillGradeRequest, type WordDrillResult } from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, ApiError, sessionQueryOptions, speechRecognitionTokenSource, wordDrillQueryOptions, type WordDrillSettings } from "../api";
import { useLearningClaim } from "../learningTime";
import { RevealSoundToggle } from "../molecules/Speech";
import { RECOGNITION_LOCALES, SpeechRecognitionScope, type AssessmentHandler } from "../molecules/speechRecognition";
import { sendPronunciationAttempt } from "../molecules/learningAttempts";
import { unscored } from "../molecules/SpeakControls";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { DrillResults, type FinishedDrill } from "../organisms/WordDrill/DrillResults";
import { averageScore, gradeDrill, readLastDrill, startDrill, writeLastDrill } from "../organisms/WordDrill/drillSession";
import { WordDrillCard } from "../organisms/WordDrill/WordDrillCard";
import { Button, EmptyState, ErrorState, Eyebrow, LoadingState, Surface } from "../ui";
import styles from "./WordDrillPage.module.css";

// The drill route's search (docs/words.md#setup). Unknown settings fall back to the defaults, and a lesson or course drill without
// a valid lesson or course becomes a Weak words drill, so the page never asks the API for a deck it would refuse. The lesson page's
// Practise words opens a course drill (`source=course&course=<id>`).
export function validateWordDrillSearch(search: Record<string, unknown>): WordDrillSettings {
  const source = wordDrillSourceSchema.safeParse(search.source);
  const direction = wordDrillModeSchema.safeParse(search.direction);
  const lesson = opaqueIdSchema.safeParse(search.lesson);
  const course = opaqueIdSchema.safeParse(search.course);
  const mode = direction.success ? direction.data : "mixed";
  if (source.success && source.data === "lesson" && lesson.success) return { source: "lesson", lesson: lesson.data, direction: mode };
  if (source.success && source.data === "course" && course.success) return { source: "course", course: course.data, direction: mode };
  return { source: "weak", direction: mode };
}

// One session's cards, shown one at a time. The first grade of each card is sent once, as soon as it is given; a failed save is
// kept to retry, and a word that is gone (404) finishes from the session's copy with its grade ignored. The session is timed from
// its first card to its last grade; with the pronunciation scores heard meanwhile, that is kept locally as the last session.
function DrillRun({ groupId, accountId, cards, language, scores, course, onAgain, onBack }: {
  groupId: string; accountId: string; cards: readonly DrillCard[]; language: string; scores: RefObject<number[]>; course: string | undefined; onAgain: () => void; onBack: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState(() => startDrill(cards.length));
  const [startedAt] = useState(() => Date.now());
  const [finished, setFinished] = useState<FinishedDrill | null>(null);
  useEffect(() => { scores.current = []; }, [scores]);
  const [revealed, setRevealed] = useState(false);
  const [unsaved, setUnsaved] = useState<ReadonlyMap<number, WordDrillResult>>(new Map());
  // Cards on screen count as drill time, against the course of a course drill (C15, docs/learning-time.md#what-is-measured).
  useLearningClaim(state.queue.length ? { groupId, target: () => (course ? { activity: "drill", courseId: course } : { activity: "drill" }) } : null);
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
    const next = gradeDrill(state, result);
    if (!next.queue.length) {
      const got = [...next.first.values()].filter((value) => value === "got").length;
      const summary = { durationMs: Date.now() - startedAt, pronunciation: averageScore(scores.current) };
      const previous = readLastDrill(accountId);
      writeLastDrill(accountId, { version: 1, accuracy: Math.round(got / cards.length * 100), ...summary, finishedAt: new Date().toISOString() });
      setFinished({ ...summary, previous });
    }
    setState(next);
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
    return <DrillResults groupId={groupId} cards={cards} first={state.first} finished={finished ?? { durationMs: Date.now() - startedAt, pronunciation: null, previous: null }}
      failure={failure} onAgain={onAgain} onBack={onBack} />;
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
function DrillSession({ groupId, accountId, settings, run, language, scores, onAgain, onBack }: {
  groupId: string; accountId: string; settings: WordDrillSettings; run: number; language: string; scores: RefObject<number[]>; onAgain: () => void; onBack: () => void;
}) {
  const { t } = useTranslation();
  const deck = useQuery(wordDrillQueryOptions(groupId, settings, run));
  if (deck.isPending) return <LoadingState label={t("drill.loading")} />;
  if (deck.isError) {
    if (deck.error instanceof ApiError && deck.error.status === 404) {
      return <Surface tone="quiet"><EmptyState title={t(settings.source === "course" ? "drill.courseUnavailable" : "drill.lessonUnavailable")} action={<Button onClick={onBack}>{t("drill.backToWords")}</Button>} /></Surface>;
    }
    return <ErrorState title={t("drill.unavailable")}><Button onClick={() => deck.refetch()}>{t("common.retry")}</Button></ErrorState>;
  }
  if (!deck.data.cards.length) {
    return <Surface tone="quiet"><EmptyState title={t("drill.emptyTitle")} action={<Button onClick={onBack}>{t("drill.backToWords")}</Button>}>
      {t({ weak: "drill.emptyWeak", lesson: "drill.emptyLesson", course: "drill.emptyCourse" }[settings.source])}
    </EmptyState></Surface>;
  }
  return <DrillRun groupId={groupId} accountId={accountId} cards={deck.data.cards} language={language} scores={scores} course={settings.source === "course" ? settings.course : undefined}
    onAgain={onAgain} onBack={onBack} />;
}

// The drill page (C12e): self-graded cards one at a time, then the results. Desktop only, like other new work.
export function WordDrillPage({ groupId, settings, onBack }: { groupId: string; settings: WordDrillSettings; onBack: () => void }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  const [run, setRun] = useState(0);
  const token = useMemo(() => speechRecognitionTokenSource(groupId), [groupId]);
  // Microsoft assessments of drill cards are stored as pronunciation attempts (docs/words.md#pronunciation-assessment), and their
  // overall scores make the session's pronunciation result.
  const scores = useRef<number[]>([]);
  const onAssessment = useCallback<AssessmentHandler>((reference, assessment, word) => {
    if (!unscored(assessment)) scores.current.push(assessment.overall);
    sendPronunciationAttempt(groupId, "drill", reference, assessment, word);
  }, [groupId]);
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("drill.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const libraryLanguage = session.data.groups[0]?.language;
  const language = libraryLanguage ? t(`languages.${libraryLanguage}`) : "";
  const recognitionLocale = libraryLanguage ? RECOGNITION_LOCALES[libraryLanguage] : null;
  const subtitle = t(`drill.setup.${settings.source}`);
  const direction = settings.direction === "mixed" ? t("drill.setup.mixed") : t(`drill.setup.${settings.direction}`, { language });
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.page}>
      <header className={styles.header}>
        <Eyebrow>{t("drill.eyebrow")}</Eyebrow>
        <h1 className={styles.title}>{t("drill.title")}</h1>
        <p className={styles.settings}>{t("drill.settings", { source: subtitle, direction })}</p>
      </header>
      <SpeechRecognitionScope locale={recognitionLocale} token={token} onAssessment={onAssessment}><DrillSession key={`${run}:${settings.source}:${settings.lesson ?? settings.course ?? ""}:${settings.direction}`} groupId={groupId} accountId={session.data.user.id} settings={settings} run={run}
        language={language} scores={scores} onAgain={() => setRun((value) => value + 1)} onBack={onBack} /></SpeechRecognitionScope>
    </div>
  </GroupFrame>;
}
