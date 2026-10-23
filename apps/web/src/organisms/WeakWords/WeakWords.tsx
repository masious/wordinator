import { okResponseSchema } from "@wordinator/contracts";
import { WORD_RECENT_RESULTS_SHOWN, type WordDrillResult } from "@wordinator/contracts/lesson-document";
import type { WeakWord, WeakWordsPage } from "@wordinator/contracts/weak-words";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, weakWordsQueryOptions } from "../../api";
import { Button, EmptyState, ErrorState, LoadingState, Surface } from "../../ui";
import { WordBookmarkScope, WordBookmarkToggle } from "../WordBookmark/WordBookmark";
import { WordList, WordRow } from "../WordList/WordList";
import styles from "./WeakWords.module.css";

// Five dots for a word's last results, oldest left: success fill for Got it, danger fill for Again, hollow for missing ones.
// Assistive technology reads the results in words.
export function RecentDots({ recent }: { recent: readonly WordDrillResult[] }) {
  const { t } = useTranslation();
  const shown = recent.slice(-WORD_RECENT_RESULTS_SHOWN);
  const label = shown.length
    ? t("words.weak.dots", { count: shown.length, results: shown.map((result) => t(`words.weak.result.${result}`)).join(", ") })
    : t("words.weak.noResults");
  return <span className={styles.dots} role="img" aria-label={label}>
    {Array.from({ length: WORD_RECENT_RESULTS_SHOWN }, (_, index) => {
      const result = shown[index];
      return <span key={index} className={styles.dot} data-result={result ?? "empty"} />;
    })}
  </span>;
}

function WeakWordRow({ item, onKnown }: { item: WeakWord; onKnown: () => void }) {
  const { t } = useTranslation();
  return <WordRow word={item.word} course={item.course} lesson={item.lesson} status={<RecentDots recent={item.recent} />} actions={<>
    <WordBookmarkToggle wordId={item.word.id} lessonId={item.lesson.id} term={item.word.term} />
    <Button variant="quiet" onClick={onKnown} aria-label={t("words.weak.knownFor", { term: item.word.term })}>{t("words.weak.known")}</Button>
  </>} />;
}

type Pages = InfiniteData<WeakWordsPage, string | undefined>;

// The Weak words view (docs/words.md#weak-words-view): remembered words weakest first, as the API orders them. "I know this
// word" removes the row at once and puts it back with a message if the request fails.
export function WeakWords({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const options = weakWordsQueryOptions(groupId);
  const list = useInfiniteQuery(options);
  const [failure, setFailure] = useState<string | null>(null);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const resolve = useCallback((_wordId: string, lessonId?: string) => {
    const item = items.find((entry) => entry.lesson.id === lessonId);
    return item ? { groupId, courseId: item.course.id, lessonId: item.lesson.id } : null;
  }, [items, groupId]);
  const known = useMutation({
    mutationFn: (termKey: string) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/word-memory/${encodeURIComponent(termKey)}/known`, okResponseSchema, { method: "PUT" }),
    onMutate: async (termKey) => {
      setFailure(null);
      await queryClient.cancelQueries({ queryKey: options.queryKey });
      const previous = queryClient.getQueryData<Pages>(options.queryKey);
      queryClient.setQueryData<Pages>(options.queryKey, (data) => data && {
        ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.termKey !== termKey) })),
      });
      return { previous };
    },
    onError: (_error, _termKey, context) => {
      queryClient.setQueryData(options.queryKey, context?.previous);
      setFailure(t("words.weak.knownFailed"));
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const onLoad = useCallback(() => { if (!isFetchingNextPage) void fetchNextPage(); }, [fetchNextPage, isFetchingNextPage]);
  if (list.isPending) return <LoadingState label={t("words.weak.loading")} />;
  if (list.isError) return <ErrorState title={t("words.weak.unavailable")}><Button onClick={() => list.refetch()}>{t("common.retry")}</Button></ErrorState>;
  return <div className={styles.view}>
    {failure && <p className={styles.error} role="alert">{failure}</p>}
    {items.length || hasNextPage
      ? <WordBookmarkScope resolve={resolve}>
          <WordList label={t("words.weak.listLabel")} more={{ hasMore: Boolean(hasNextPage), loading: isFetchingNextPage, onLoad }}>
            {items.map((item) => <WeakWordRow key={item.termKey} item={item} onKnown={() => known.mutate(item.termKey)} />)}
          </WordList>
        </WordBookmarkScope>
      : <Surface tone="quiet"><EmptyState title={t("words.weak.emptyTitle")}>{t("words.weak.emptyBody")}</EmptyState></Surface>}
  </div>;
}
