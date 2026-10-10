import { SegmentedControl, TextInput, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { wordSearchKey, type WordSearchResult } from "@wordinator/contracts/lesson-document";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { wordSearchQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { SpeechButton } from "../../molecules/Speech";
import { Button } from "../../ui";
import styles from "./LessonWords.module.css";

export type WordSearchMode = "lesson" | "library";
// Library requests wait until typing pauses.
export const WORD_SEARCH_DEBOUNCE_MS = 300;

// The search box of the New words panel and, when the panel can search the library, the switch between this lesson and the library.
export function WordSearchControls({ query, onQuery, mode, onMode }: {
  query: string; onQuery: (value: string) => void; mode: WordSearchMode | null; onMode: (mode: WordSearchMode) => void;
}) {
  const { t } = useTranslation();
  return <div className={styles.search}>
    <TextInput type="search" size="xs" value={query} onChange={(event) => onQuery(event.currentTarget.value)}
      aria-label={mode === "library" ? t("courses.words.search.libraryLabel") : t("courses.words.search.lessonLabel")}
      placeholder={mode === "library" ? t("courses.words.search.libraryPlaceholder") : t("courses.words.search.lessonPlaceholder")}
      leftSection={<Search aria-hidden="true" size={14} />} />
    {mode && <div role="group" aria-label={t("courses.words.search.scope")}>
      <SegmentedControl size="xs" fullWidth value={mode} onChange={(value) => onMode(value as WordSearchMode)}
        data={[{ value: "lesson", label: t("courses.words.search.thisLesson") }, { value: "library", label: t("courses.words.search.library") }]} />
    </div>}
  </div>;
}

// The lesson that introduced a library match: an icon linking to it, with the course and lesson named in a tooltip.
function WordSource({ item }: { item: WordSearchResult }) {
  const { t } = useTranslation();
  const source = t("courses.words.search.source", { course: item.course.title, lesson: item.lesson.title });
  return <Tooltip label={source} position="left" withArrow events={{ hover: true, focus: true, touch: true }}>
    <Link className={styles.source} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: item.course.slug, lessonSlug: item.lesson.slug }}
      aria-label={t("courses.words.search.openSource", { course: item.course.title, lesson: item.lesson.title })}>
      <BookOpen aria-hidden="true" size={16} />
    </Link>
  </Tooltip>;
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
    <ul className={styles.list} aria-label={t("courses.words.search.results")}>{items.map((item) => <li key={`${item.lesson.id}:${item.word.id}`} className={`${styles.word} ${styles.result}`}>
      <p className={styles.head}><span className={styles.term}>{item.word.term}</span>
        <SpeechButton url={item.word.speech.term} label={t("courses.speech.term", { term: item.word.term })} />{item.word.forms && <span className={styles.forms}>{item.word.forms}</span>}
        <span className={styles.bookmark}><WordSource item={item} /></span></p>
      <p className={styles.meaning}><PlainText>{item.word.meaning}</PlainText></p>
    </li>)}</ul>
    {search.hasNextPage && <Button variant="quiet" loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>{t("courses.words.search.more")}</Button>}
  </>;
}
