import { okResponseSchema } from "@wordinator/contracts";
import { collectLessonWords, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, wordBookmarkKeysQueryOptions, wordBookmarksKey } from "../../api";
import styles from "./WordBookmark.module.css";

export type BookmarkTarget = { groupId: string; courseId: string; lessonId: string };
// A word ID is unique within its lesson only, so surfaces that list words of several lessons pass the lesson too.
type ResolveTarget = (wordId: string, lessonId?: string) => BookmarkTarget | null;

// Surfaces that show words say which of them can be bookmarked, and where. Outside a scope, or for a word the scope does not
// resolve (a draft preview's words), no toggle renders.
const BookmarkScopeContext = createContext<ResolveTarget | null>(null);

export function WordBookmarkScope({ resolve, children }: { resolve: ResolveTarget; children: ReactNode }) {
  return <BookmarkScopeContext.Provider value={resolve}>{children}</BookmarkScopeContext.Provider>;
}

// Resolves the words of a lesson's published document. A lesson shown only as a draft preview has no published document, so
// none of its words resolve.
export function useLessonBookmarkTarget(groupId: string, courseId: string, lessonId: string, published: LessonDocument | null): ResolveTarget {
  const ids = useMemo(() => new Set(published ? collectLessonWords(published).map((entry) => entry.id) : []), [published]);
  return useMemo(() => (wordId: string) => ids.has(wordId) ? { groupId, courseId, lessonId } : null, [ids, groupId, courseId, lessonId]);
}

function BookmarkIcon() {
  return <svg aria-hidden="true" className={styles.icon} viewBox="0 0 20 20"><path d="M5.5 3.5h9v13L10 13.25 5.5 16.5v-13Z" /></svg>;
}

function Toggle({ target, wordId, term }: { target: BookmarkTarget; wordId: string; term: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const keysQuery = wordBookmarkKeysQueryOptions(target.groupId);
  const keys = useQuery(keysQuery);
  const bookmarked = keys.data?.keys.some((key) => key.lessonId === target.lessonId && key.wordId === wordId) ?? false;
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!failure) return;
    const timer = window.setTimeout(() => setFailure(null), 5000);
    return () => window.clearTimeout(timer);
  }, [failure]);
  const path = `/api/groups/${encodeURIComponent(target.groupId)}/courses/${encodeURIComponent(target.courseId)}/lessons/${encodeURIComponent(target.lessonId)}/words/${encodeURIComponent(wordId)}/bookmark`;
  const toggle = useMutation({
    mutationFn: (next: boolean) => apiRequest(path, okResponseSchema, { method: next ? "PUT" : "DELETE" }),
    // The toggle flips at once; a failed request puts the keys back and says why.
    onMutate: async (next) => {
      setFailure(null);
      await queryClient.cancelQueries({ queryKey: keysQuery.queryKey });
      const previous = queryClient.getQueryData(keysQuery.queryKey);
      queryClient.setQueryData(keysQuery.queryKey, (data) => {
        const rest = (data?.keys ?? []).filter((key) => key.lessonId !== target.lessonId || key.wordId !== wordId);
        return { keys: next ? [{ lessonId: target.lessonId, wordId }, ...rest] : rest };
      });
      return { previous };
    },
    onError: (error, _next, context) => {
      queryClient.setQueryData(keysQuery.queryKey, context?.previous);
      setFailure(error instanceof ApiError && error.code === "WORD_BOOKMARKS_FULL" ? error.message : t("courses.words.bookmarkFailed"));
    },
    // Other bookmark views (the Words tab) refetch; the keys already hold the outcome.
    onSettled: () => queryClient.invalidateQueries({ queryKey: wordBookmarksKey(target.groupId), predicate: (query) => query.queryKey[2] !== "keys" }),
  });
  return <span className={styles.wrap}>
    <button type="button" className={styles.toggle} aria-pressed={bookmarked} aria-label={t("courses.words.bookmark", { term })}
      disabled={!keys.isSuccess} onClick={() => toggle.mutate(!bookmarked)}>
      <BookmarkIcon />
    </button>
    {failure && <span className={styles.error} role="alert">{failure}</span>}
  </span>;
}

// A bookmark toggle for one word: pressed while the viewer has it bookmarked. Renders nothing where the word cannot be bookmarked.
export function WordBookmarkToggle({ wordId, lessonId, term }: { wordId: string; lessonId?: string; term: string }) {
  const resolve = useContext(BookmarkScopeContext);
  const target = resolve?.(wordId, lessonId) ?? null;
  return target ? <Toggle target={target} wordId={wordId} term={term} /> : null;
}
