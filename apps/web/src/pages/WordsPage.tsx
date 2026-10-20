import { opaqueIdSchema } from "@wordinator/contracts";
import type { WordBookmark, WordBookmarkLesson } from "@wordinator/contracts/lesson-document";
import { SegmentedControl } from "@mantine/core";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions, speechRecognitionTokenSource, weakWordsQueryOptions, wordBookmarkLessonsQueryOptions, wordBookmarksQueryOptions, type WordDrillSettings } from "../api";
import { useLearningClaim } from "../learningTime";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { WeakWords } from "../organisms/WeakWords/WeakWords";
import { WordBookmarkScope } from "../organisms/WordBookmark/WordBookmark";
import { WordDrillSetup } from "../organisms/WordDrill/WordDrillSetup";
import { RECOGNITION_LOCALES, SpeechRecognitionScope, type AssessmentHandler } from "../molecules/speechRecognition";
import { sendPronunciationAttempt } from "../molecules/learningAttempts";
import { WordRecap, type RecapWord } from "../organisms/WordRecap/WordRecap";
import { Button, EmptyState, ErrorState, Eyebrow, LoadingState, PageHeader, SelectField, Surface } from "../ui";
import styles from "./WordsPage.module.css";

// The route's search: `view=weak` shows the Weak words view (C14d), and otherwise `lesson` narrows the tab to one lesson's
// bookmarks (C12a); the lesson filter belongs to Bookmarks only. Anything else is dropped.
export type WordsView = "bookmarks" | "weak";
export function validateWordsSearch(search: Record<string, unknown>): { view?: "weak"; lesson?: string } {
  if (search.view === "weak") return { view: "weak" };
  const lesson = opaqueIdSchema.safeParse(search.lesson);
  return lesson.success ? { lesson: lesson.data } : {};
}

const bookmarkKey = (lessonId: string, wordId: string) => `${lessonId}:${wordId}`;
const ALL_LESSONS = "all";

// Every bookmark this visit has shown, in the order first seen, with the latest text. A refetch after removing a bookmark leaves
// its card in place (shown as not bookmarked), so the grid does not jump; leaving the page or changing the filter starts afresh.
function useStableBookmarks(pages: readonly { items: readonly WordBookmark[] }[] | undefined) {
  const seen = useRef(new Map<string, WordBookmark>());
  return useMemo(() => {
    for (const item of pages?.flatMap((page) => page.items) ?? []) seen.current.set(bookmarkKey(item.lesson.id, item.word.id), item);
    return [...seen.current.values()];
  }, [pages]);
}

// The lesson filter's lessons (C12a). A lesson seen this visit stays listed after its last bookmark is removed, so the chosen
// lesson's cards stay in place like any other removal; a lesson never seen is not available and falls back to All lessons.
function useFilterLessons(groupId: string, lessonId: string | null, onLesson: (next: string | null, replace?: boolean) => void) {
  const query = useQuery(wordBookmarkLessonsQueryOptions(groupId));
  const seen = useRef(new Map<string, WordBookmarkLesson>());
  const lessons = useMemo(() => {
    const current = query.data?.lessons ?? [];
    for (const entry of current) seen.current.set(entry.lesson.id, entry);
    const kept = lessonId && !current.some((entry) => entry.lesson.id === lessonId) ? seen.current.get(lessonId) : undefined;
    return kept ? [...current, { ...kept, count: 0 }] : current;
  }, [query.data, lessonId]);
  const settled = query.isSuccess && !query.isFetching;
  useEffect(() => {
    if (lessonId && settled && !seen.current.has(lessonId)) onLesson(null, true);
  }, [lessonId, settled, onLesson]);
  return lessons;
}

function LessonFilter({ lessons, lessonId, onLesson }: {
  lessons: readonly WordBookmarkLesson[]; lessonId: string | null; onLesson: (next: string | null) => void;
}) {
  const { t } = useTranslation();
  const data = useMemo(() => {
    const groups = new Map<string, { group: string; items: Array<{ value: string; label: string }> }>();
    for (const entry of lessons) {
      const group = groups.get(entry.course.id) ?? { group: entry.course.title, items: [] };
      group.items.push({ value: entry.lesson.id, label: t("words.lessonOption", { lesson: entry.lesson.title, count: entry.count }) });
      groups.set(entry.course.id, group);
    }
    return [{ value: ALL_LESSONS, label: t("words.allLessons") }, ...groups.values()];
  }, [lessons, t]);
  return <SelectField className={styles.filter} label={t("words.filterLabel")} data={data} value={lessonId ?? ALL_LESSONS} allowDeselect={false}
    onChange={(value) => onLesson(value && value !== ALL_LESSONS ? value : null)} />;
}

// One filter's cards; the page remounts it when the filter changes, which starts its stable list afresh.
function BookmarkedWords({ groupId, lessonId }: { groupId: string; lessonId: string | null }) {
  const { t } = useTranslation();
  const list = useInfiniteQuery(wordBookmarksQueryOptions(groupId, lessonId ?? undefined));
  const bookmarks = useStableBookmarks(list.data?.pages);
  const words = useMemo<RecapWord[]>(() => bookmarks.map((item) => item.word), [bookmarks]);
  const sources = useMemo(() => new Map(bookmarks.map((item) => [bookmarkKey(item.lesson.id, item.word.id), item])), [bookmarks]);
  const source = useCallback((word: RecapWord) => {
    const item = word.lessonId ? sources.get(bookmarkKey(word.lessonId, word.id)) : undefined;
    return item ? t("words.source", { course: item.course.title, lesson: item.lesson.title }) : null;
  }, [sources, t]);
  const resolve = useCallback((_wordId: string, lessonId?: string) => {
    const item = bookmarks.find((entry) => entry.lesson.id === lessonId);
    return item ? { groupId, courseId: item.course.id, lessonId: item.lesson.id } : null;
  }, [bookmarks, groupId]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const onLoad = useCallback(() => { void fetchNextPage(); }, [fetchNextPage]);
  if (list.isPending) return <LoadingState label={t("words.loading")} />;
  if (list.isError) return <ErrorState title={t("words.unavailable")}><Button onClick={() => list.refetch()}>{t("common.retry")}</Button></ErrorState>;
  if (!words.length) return <Surface tone="quiet"><EmptyState title={t("words.emptyTitle")}>{t("words.emptyBody")}</EmptyState></Surface>;
  return <WordBookmarkScope resolve={resolve}>
    <WordRecap words={words} source={source} more={{ hasMore: Boolean(hasNextPage), loading: isFetchingNextPage, onLoad }} />
  </WordBookmarkScope>;
}

// The Words tab: the viewer's bookmarked words, newest bookmark first, as word cards, optionally of one lesson; or the Weak
// words view (C14d). Nothing here is scheduled or scored; the Weak words dots are the only sign of how well a word is known.
// Drill opens the drill setup (C12e); Drill these words starts a Weak words drill.
export function WordsPage({ groupId, view = "bookmarks", lessonId, onView, onLesson, onDrill }: {
  groupId: string; view?: WordsView; lessonId: string | null; onView?: (next: WordsView) => void;
  onLesson: (next: string | null, replace?: boolean) => void; onDrill: (settings: WordDrillSettings) => void;
}) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  const lessons = useFilterLessons(groupId, lessonId, onLesson);
  // The Weak words read also says whether there is memory to drill without bookmarks.
  const weak = useInfiniteQuery(weakWordsQueryOptions(groupId));
  const hasMemory = weak.data?.pages[0]?.hasMemory ?? false;
  const hasWeakRows = Boolean(weak.data?.pages.some((page) => page.items.length));
  const [drillOpen, setDrillOpen] = useState(false);
  // The open Words tab counts as learning time (C15, docs/learning-time.md#what-is-measured).
  useLearningClaim({ groupId, target: () => ({ activity: "words" }) });
  const token = useMemo(() => speechRecognitionTokenSource(groupId), [groupId]);
  // Microsoft assessments of word cards are stored as pronunciation attempts (docs/words.md#pronunciation-assessment).
  const onAssessment = useCallback<AssessmentHandler>((reference, assessment, word) => sendPronunciationAttempt(groupId, "word_card", reference, assessment, word), [groupId]);
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("words.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  const libraryLanguage = session.data.groups[0]?.language;
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.page}>
      <PageHeader className={styles.header} eyebrow={<Eyebrow>{t("words.eyebrow")}</Eyebrow>} title={t("words.title")}
        intro={view === "weak" ? t("words.weakIntro") : t("words.intro")}
        actions={<div className={styles.actions}>
          {onView && <div role="group" aria-label={t("words.view.label")} className={styles.views}>
            <SegmentedControl value={view} onChange={(value) => onView(value === "weak" ? "weak" : "bookmarks")}
              data={[{ value: "bookmarks", label: t("words.view.bookmarks") }, { value: "weak", label: t("words.view.weak") }]} />
          </div>}
          {view === "bookmarks" && lessons.length > 0 && <LessonFilter lessons={lessons} lessonId={lessonId} onLesson={onLesson} />}
          {view === "weak"
            ? <Button variant="secondary" disabled={!hasWeakRows} onClick={() => onDrill({ source: "weak", direction: "mixed" })}>{t("words.drillWeak")}</Button>
            : <Button variant="secondary" onClick={() => setDrillOpen(true)}>{t("words.drill")}</Button>}
        </div>} />
      {view === "weak"
        ? <WeakWords groupId={groupId} />
        : <SpeechRecognitionScope locale={libraryLanguage ? RECOGNITION_LOCALES[libraryLanguage] : null} token={token} onAssessment={onAssessment}>
            <BookmarkedWords key={lessonId ?? ALL_LESSONS} groupId={groupId} lessonId={lessonId} />
          </SpeechRecognitionScope>}
    </div>
    <WordDrillSetup opened={drillOpen} onClose={() => setDrillOpen(false)} lessons={lessons} lessonId={lessonId} hasMemory={hasMemory}
      language={libraryLanguage ? t(`languages.${libraryLanguage}`) : ""} onStart={(settings) => { setDrillOpen(false); onDrill(settings); }} />
  </GroupFrame>;
}
