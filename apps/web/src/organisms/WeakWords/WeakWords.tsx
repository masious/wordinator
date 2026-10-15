import { okResponseSchema } from "@wordinator/contracts";
import { WORD_RECENT_RESULTS_SHOWN, type WordDrillResult } from "@wordinator/contracts/lesson-document";
import type { WeakWord, WeakWordsPage } from "@wordinator/contracts/weak-words";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, weakWordsQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton } from "../../molecules/Speech";
import { Button, EmptyState, ErrorState, LoadingState, Surface } from "../../ui";
import { WordBookmarkScope, WordBookmarkToggle } from "../WordBookmark/WordBookmark";
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
  return <li className={styles.row} aria-label={item.word.term}>
    <div className={styles.word}>
      <p className={styles.term}>{item.word.term}
        <SpeechButton url={item.word.speech.term} label={t("courses.speech.term", { term: item.word.term })} className={styles.speech} /></p>
      <p className={styles.meaning}><PlainText>{item.word.meaning}</PlainText></p>
      <p className={styles.source}>{t("words.source", { course: item.course.title, lesson: item.lesson.title })}</p>
    </div>
    <RecentDots recent={item.recent} />
    <div className={styles.actions}>
      <WordBookmarkToggle wordId={item.word.id} lessonId={item.lesson.id} term={item.word.term} />
      <Button variant="quiet" onClick={onKnown} aria-label={t("words.weak.knownFor", { term: item.word.term })}>{t("words.weak.known")}</Button>
    </div>
  </li>;
}

// Loads the next page as its marker scrolls into view; the button stays for keyboards and browsers without an observer.
function MoreRows({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || loading || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) onLoad(); }, { rootMargin: "0px 0px 20%" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, onLoad]);
  return <div ref={ref} className={styles.more}><Button variant="quiet" loading={loading} onClick={onLoad}>{t("words.weak.more")}</Button></div>;
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
          <ul className={styles.list} aria-label={t("words.weak.listLabel")}>
            {items.map((item) => <WeakWordRow key={item.termKey} item={item} onKnown={() => known.mutate(item.termKey)} />)}
          </ul>
          {hasNextPage && <MoreRows loading={isFetchingNextPage} onLoad={onLoad} />}
        </WordBookmarkScope>
      : <Surface tone="quiet"><EmptyState title={t("words.weak.emptyTitle")}>{t("words.weak.emptyBody")}</EmptyState></Surface>}
  </div>;
}
