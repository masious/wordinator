import { useDebouncedValue } from "@mantine/hooks";
import { wordSearchKey, type WordSearchResult } from "@wordinator/contracts/lesson-document";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { wordSearchQueryOptions } from "../../api";
import { Button, SearchField } from "../../ui";
import { WordBookmarkScope } from "../WordBookmark/WordBookmark";
import styles from "./LessonWords.module.css";
import { PanelWord } from "./PanelWord";

export type WordSearchMode = "lesson" | "library";
// Library requests wait until typing pauses.
export const WORD_SEARCH_DEBOUNCE_MS = 300;

// The search box of the New words panel, one row (the shared SearchField). When the panel can search the library, its start is a
// translate icon that switches the library on and off; without a library it stays a magnifier. The browser's own clear × ends it.
export function WordSearchControls({ query, onQuery, mode, onMode }: {
  query: string; onQuery: (value: string) => void; mode: WordSearchMode | null; onMode: (mode: WordSearchMode) => void;
}) {
  const { t } = useTranslation();
  const library = mode === "library";
  return <div className={styles.search}>
    <SearchField value={query} onChange={(event) => onQuery(event.currentTarget.value)}
      aria-label={library ? t("courses.words.search.libraryLabel") : t("courses.words.search.lessonLabel")}
      placeholder={library ? t("courses.words.search.libraryPlaceholder") : t("courses.words.search.lessonPlaceholder")}
      toggle={mode ? { icon: <Languages aria-hidden="true" />, label: t("courses.words.search.libraryToggle"), pressed: library, onToggle: () => onMode(library ? "lesson" : "library") } : undefined} />
  </div>;
}

// The lesson that introduced a library match, linked.
function WordSource({ item }: { item: WordSearchResult }) {
  const { t } = useTranslation();
  return <Link className={styles.source} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: item.course.slug, lessonSlug: item.lesson.slug }}>
    <BookOpen aria-hidden="true" size={14} />{t("courses.words.search.introducedIn", { course: item.course.title, lesson: item.lesson.title })}
  </Link>;
}

// Library matches for the debounced query, twenty at a time, each with the lesson that introduced it.
export function LibraryWordResults({ groupId, query }: { groupId: string; query: string }) {
  const { t } = useTranslation();
  const [debounced] = useDebouncedValue(query.trim(), WORD_SEARCH_DEBOUNCE_MS);
  const enabled = wordSearchKey(debounced) !== "";
  const search = useInfiniteQuery({ ...wordSearchQueryOptions(groupId, debounced), enabled });
  if (!wordSearchKey(query)) return <p className={styles.status}>{t("courses.words.search.libraryHint")}</p>;
  if (!enabled || search.isPending) return <p className={styles.status} role="status">{t("courses.words.search.searching")}</p>;
  if (search.isError) return <p className={styles.status} role="alert">{t("courses.words.search.failed")}</p>;
  const items = search.data.pages.flatMap((page) => page.items);
  if (!items.length) return <p className={styles.status} role="status">{t("courses.words.search.noLibraryMatches")}</p>;
  return <>
    <ul className={styles.list} aria-label={t("courses.words.search.results")}>{items.map((item) => {
      const target = { groupId, courseId: item.course.id, lessonId: item.lesson.id };
      return <WordBookmarkScope key={`${item.lesson.id}:${item.word.id}`} resolve={() => target}>
        <PanelWord word={item.word} termSpeech={item.word.speech.term} exampleSpeech={item.word.speech.example} className={`${styles.word} ${styles.result}`} source={<WordSource item={item} />} />
      </WordBookmarkScope>;
    })}</ul>
    {search.hasNextPage && <Button variant="quiet" loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>{t("courses.words.search.more")}</Button>}
  </>;
}
