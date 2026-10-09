import type { WordBookmark } from "@wordinator/contracts/lesson-document";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions, wordBookmarksQueryOptions } from "../api";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { WordBookmarkScope } from "../organisms/WordBookmark/WordBookmark";
import { WordRecap, type RecapWord } from "../organisms/WordRecap/WordRecap";
import { Button, EmptyState, ErrorState, LabelChip, LoadingState, PageHeader, Surface } from "../ui";
import styles from "./WordsPage.module.css";

const bookmarkKey = (lessonId: string, wordId: string) => `${lessonId}:${wordId}`;

// Every bookmark this visit has shown, in the order first seen, with the latest text. A refetch after removing a bookmark leaves
// its card in place (shown as not bookmarked), so the grid does not jump; leaving the page starts afresh.
function useStableBookmarks(pages: readonly { items: readonly WordBookmark[] }[] | undefined) {
  const seen = useRef(new Map<string, WordBookmark>());
  return useMemo(() => {
    for (const item of pages?.flatMap((page) => page.items) ?? []) seen.current.set(bookmarkKey(item.lesson.id, item.word.id), item);
    return [...seen.current.values()];
  }, [pages]);
}

// The Words tab: the viewer's bookmarked words in this group, newest bookmark first, as word cards. Nothing here is scheduled,
// scored, or counted; removing a bookmark is the only change it makes.
export function WordsPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  const list = useInfiniteQuery(wordBookmarksQueryOptions(groupId));
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
  if (session.isPending || list.isPending) return <main className={styles.center}><LoadingState label={t("words.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.page}>
      <PageHeader className={styles.header} eyebrow={<LabelChip>{t("words.eyebrow")}</LabelChip>} title={t("words.title")} intro={t("words.intro")} />
      {list.isError
        ? <ErrorState title={t("words.unavailable")}><Button onClick={() => list.refetch()}>{t("common.retry")}</Button></ErrorState>
        : words.length
          ? <WordBookmarkScope resolve={resolve}>
            <WordRecap words={words} source={source} more={{ hasMore: Boolean(hasNextPage), loading: isFetchingNextPage, onLoad }} />
          </WordBookmarkScope>
          : <Surface tone="quiet"><EmptyState title={t("words.emptyTitle")}>{t("words.emptyBody")}</EmptyState></Surface>}
    </div>
  </GroupFrame>;
}
