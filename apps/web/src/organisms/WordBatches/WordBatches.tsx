import { lessonWordBatches, type CourseLesson, type WordBatchStats } from "@wordinator/contracts/lesson-document";
import { TUTOR_WORD_PRACTICE_MAX, tutorConversationResponseSchema, type CreateTutorConversationRequest } from "@wordinator/contracts/tutor";
import { okResponseSchema } from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Popover } from "@mantine/core";
import { Check, ChevronLeft, ChevronRight, Layers, Sparkles } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, wordBatchesKey, wordBatchesQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import cardStyles from "../../molecules/PracticeWord.module.css";
import { lessonSpeech, SpeechScope } from "../../molecules/Speech";
import { AdaptiveDialog, Button, IconButton } from "../../ui";
import { lessonSteps, playableDocument, type PlayerScope } from "../CourseLessons/LessonPlayer";
import { useLessonBookmarkTarget, WordBookmarkScope } from "../WordBookmark/WordBookmark";
import { runWords, WordRecap, type RecapWord } from "../WordRecap/WordRecap";
import styles from "./WordBatches.module.css";

type Batch = { number: number; words: RecapWord[]; headings: string[] };

// A batch's words in the memory bands, as the library dashboard draws them: Strong, Fading, then New.
function BandBar({ stats }: { stats: WordBatchStats }) {
  const { t } = useTranslation();
  const summary = t("words.batches.bands", stats);
  return <div className={styles.bands}>
    <div className={styles.bar} role="img" aria-label={summary}>
      {(["strong", "fading", "new"] as const).map((band) => <span key={band} data-band={band} style={{ flexGrow: stats[band] }} />)}
    </div>
    <span className={styles.caption}>{t("words.batches.strong", { count: stats.strong, total: stats.total })}
      {stats.seen > 0 && <> · {t("words.batches.seen", { count: stats.seen })}</>}</span>
  </div>;
}

// One word of a batch's line: its term, showing its meaning in a card on hover or keyboard focus, like the tutor's practice words.
function BatchWord({ word }: { word: RecapWord }) {
  const [opened, setOpened] = useState(false);
  const open = () => setOpened(true); const close = () => setOpened(false);
  return <Popover opened={opened} onChange={setOpened} position="top" withArrow shadow="md" width="var(--size-word-card-roomy)">
    <Popover.Target>
      <span className={styles.word} tabIndex={0} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
        onKeyDown={(event) => { if (event.key === "Escape") close(); }}>{word.term}</span>
    </Popover.Target>
    <Popover.Dropdown className={cardStyles.card}>
      <p className={cardStyles.term}>{word.term}{word.forms && <span className={cardStyles.forms}>{word.forms}</span>}</p>
      <p className={cardStyles.meaning}><PlainText>{word.meaning}</PlainText></p>
    </Popover.Dropdown>
  </Popover>;
}

// Where each page of a batch's words starts, laid out like the badges wrap: two rows of `width`, items `gap` apart. From the second
// page on, the top row starts with the Back control; while words remain, the bottom row ends with the Next control. Every page
// takes at least one word; without a width yet, every word is on one page.
export function wordPageStarts(widths: readonly number[], width: number, gap: number, control: number): number[] {
  // Nothing laid out yet (a hidden tile): one page until there is a width to fill.
  if (width <= 0) return widths.length ? [0] : [];
  const starts: number[] = [];
  let index = 0;
  while (index < widths.length) {
    starts.push(index);
    const rows: number[][] = [index > 0 ? [control] : []];
    let next = index;
    const used = (row: readonly number[]) => row.reduce((total, item) => total + item, 0) + Math.max(0, row.length - 1) * gap;
    while (next < widths.length) {
      const row = rows.at(-1)!;
      if (!row.length || used(row) + gap + widths[next]! <= width) { row.push(widths[next]!); next += 1; continue; }
      if (rows.length === 2) break;
      rows.push([]);
    }
    // More words follow: the bottom row keeps room for Next at its end.
    const last = rows.at(-1)!;
    while (next < widths.length && next > index + 1 && last.length && used(last) + gap + control > width) { last.pop(); next -= 1; }
    index = Math.max(next, index + 1);
  }
  return starts;
}

// A batch's words as badges on two lines. Words that do not fit go to later pages, side by side on a track that slides sideways
// to the chosen page. Back starts a page's top row and Next ends its bottom row, each only when there is a page that way. Pages are
// measured from a hidden copy of the badges at the track's width.
function BatchWords({ number, words }: { number: number; words: readonly RecapWord[] }) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement>(null); const measureRef = useRef<HTMLUListElement>(null);
  const [starts, setStarts] = useState<number[]>([0]);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const viewport = viewportRef.current; const list = measureRef.current;
    if (!viewport || !list) return;
    const measure = () => {
      const style = getComputedStyle(list);
      const gap = parseFloat(style.columnGap) || 4; const control = parseFloat(style.getPropertyValue("--batch-control")) || 22;
      const widths = ([...list.children] as HTMLElement[]).map((item) => item.offsetWidth);
      const next = wordPageStarts(widths, viewport.clientWidth, gap, control);
      setStarts((current) => current.length === next.length && current.every((value, index) => value === next[index]) ? current : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    return () => observer?.disconnect();
  }, [words]);
  const pages = starts.map((first, index) => words.slice(first, starts[index + 1] ?? words.length));
  const current = Math.min(page, pages.length - 1);
  return <div ref={viewportRef} className={styles.viewport}>
    <ul ref={measureRef} className={`${styles.words} ${styles.measure}`} aria-hidden="true">
      {words.map((word) => <li key={word.id} className={styles.word}>{word.term}</li>)}
    </ul>
    <div className={styles.track} style={{ transform: `translateX(${-100 * current}%)` }}>
      {pages.map((entries, index) => <ul key={index} className={styles.words} inert={index !== current}
        aria-label={pages.length > 1 ? t("words.batches.wordPage", { number, page: index + 1, pages: pages.length }) : t("words.batches.wordList", { number })}>
        {index > 0 && <li className={styles.control}><IconButton size="sm" tone="quiet" className={styles.chevron} label={t("words.batches.previousWords", { number })}
          onClick={() => setPage(index - 1)}><ChevronLeft aria-hidden="true" /></IconButton></li>}
        {entries.map((word) => <li key={word.id}><BatchWord word={word} /></li>)}
        {index < pages.length - 1 && <li className={`${styles.control} ${styles.next}`}><IconButton size="sm" tone="quiet" className={styles.chevron} label={t("words.batches.nextWords", { number })}
          onClick={() => setPage(index + 1)}><ChevronRight aria-hidden="true" /></IconButton></li>}
      </ul>)}
    </div>
  </div>;
}

// A Peek: the batch as word cards. Opening it counts each word as seen once, and each card can mark its word known, which counts
// it Strong; the toggles start off with each Peek.
function Peek({ scope, lesson, batch, recorded, onDone }: { scope: PlayerScope; lesson: CourseLesson; batch: Batch; recorded: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const lessonPath = `/api/groups/${encodeURIComponent(scope.groupId)}/courses/${encodeURIComponent(scope.courseId)}/lessons/${encodeURIComponent(lesson.id)}`;
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: wordBatchesKey(scope.groupId, scope.courseId, lesson.id) }), [queryClient, scope, lesson.id]);
  const seen = useMutation({
    mutationFn: () => apiRequest(`${lessonPath}/word-exposures`, okResponseSchema, { method: "POST", body: JSON.stringify({ wordIds: batch.words.map((word) => word.id) }) }),
    onSettled: refresh,
  });
  const { mutate: markSeen } = seen;
  // Once per Peek, also when development mounts it twice.
  const counted = useRef(false);
  useEffect(() => { if (recorded && !counted.current) { counted.current = true; markSeen(); } }, [recorded, markSeen]);
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState(false);
  const mark = useMutation({
    mutationFn: ({ wordId, on }: { wordId: string; on: boolean }) => apiRequest(`${lessonPath}/words/${encodeURIComponent(wordId)}/known`, okResponseSchema, { method: on ? "PUT" : "DELETE" }),
    onMutate: ({ wordId, on }) => { setFailure(false); setKnown((current) => { const next = new Set(current); if (on) next.add(wordId); else next.delete(wordId); return next; }); },
    onError: (_error, { wordId, on }) => { setFailure(true); setKnown((current) => { const next = new Set(current); if (on) next.delete(wordId); else next.add(wordId); return next; }); },
    onSettled: refresh,
  });
  const action = recorded ? (word: RecapWord) => {
    const on = known.has(word.id);
    return <IconButton label={t("words.batches.knownFor", { term: word.term })} pressed={on} tone="quiet" className={styles.known}
      onClick={() => mark.mutate({ wordId: word.id, on: !on })}><Check aria-hidden="true" /></IconButton>;
  } : undefined;
  return <div className={styles.peek}>
    {failure && <p className={styles.error} role="alert">{t("words.batches.knownFailed")}</p>}
    <WordRecap words={batch.words} doneLabel={t("words.batches.peekDone")} onDone={onDone} action={action} />
  </div>;
}

// A lesson's word batches (docs/words.md#word-batches) as compact tiles, each with its memory bands and three actions: Peek opens
// its words as cards, Drill opens a drill of just the batch, and Practice starts a tutor word practice of it. Drill, Practice, and
// what a Peek records need the published lesson; an editor's preview of an unpublished lesson offers Peek alone. `peekIn` says
// whether a Peek replaces the tiles (inside a dialog) or opens its own dialog (on a page).
export function WordBatches({ scope, lesson, peekIn = "dialog", title }: {
  scope: PlayerScope; lesson: CourseLesson; peekIn?: "inline" | "dialog"; title?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const published = lesson.document !== null;
  const batches = useMemo<Batch[]>(() => {
    const document = playableDocument(lesson); const byId = new Map(runWords(lessonSteps(lesson)).map((word) => [word.id, word]));
    return document ? lessonWordBatches(document).map((batch, index) => ({ number: index + 1, headings: batch.headings, words: batch.wordIds.flatMap((id) => byId.get(id) ?? []) })) : [];
  }, [lesson]);
  const stats = useQuery({ ...wordBatchesQueryOptions(scope.groupId, scope.courseId, lesson.id), enabled: published && batches.length > 0 });
  const [peeking, setPeeking] = useState<Batch | null>(null);
  const practice = useMutation({
    mutationFn: (batch: Batch) => apiRequest("/api/ai/conversations", tutorConversationResponseSchema, {
      method: "POST",
      body: JSON.stringify({ wordPractice: batch.words.slice(0, TUTOR_WORD_PRACTICE_MAX).map((word) => ({ lessonId: lesson.id, wordId: word.id, source: "batch" as const })) } satisfies CreateTutorConversationRequest),
    }),
    onSuccess: (response) => { void navigate({ to: "/ai", search: { conversation: response.conversation.id } }); },
  });
  const bookmarkTarget = useLessonBookmarkTarget(scope.groupId, scope.courseId, lesson.id, lesson.document);
  const speech = useMemo(() => lessonSpeech(lesson), [lesson]);
  const resolveSpeech = useCallback((key: string) => speech[key] ?? null, [speech]);
  if (!batches.length) return null;
  const peek = peeking && <Peek scope={scope} lesson={lesson} batch={peeking} recorded={published} onDone={() => setPeeking(null)} />;
  return <WordBookmarkScope resolve={bookmarkTarget}><SpeechScope resolve={resolveSpeech}>
    {peekIn === "inline" && peek ? peek : <div className={styles.view}>
      <ol className={styles.batches}>{batches.map((batch) => {
        const named = { number: batch.number };
        const standing = stats.data?.batches[batch.number - 1];
        return <li key={batch.number} className={styles.batch} aria-label={t("words.batches.batch", named)}>
          <div className={styles.head}>
            <h3 className={styles.name} aria-label={t("words.batches.batch", named)}><Layers aria-hidden="true" /><span aria-hidden="true">{batch.number}</span></h3>
            {batch.headings.length > 0 && <span className={styles.sections} title={batch.headings.join(" · ")}>· {batch.headings.join(" · ")}</span>}
            <span className={styles.count}>{t("words.batches.words", { count: batch.words.length })}</span>
          </div>
          <BatchWords number={batch.number} words={batch.words} />
          {standing && <BandBar stats={standing} />}
          <div className={styles.actions} role="group" aria-label={t("words.batches.actions", named)}>
            <Button variant="secondary" onClick={() => setPeeking(batch)} aria-label={t("words.batches.peekNamed", named)}>{t("words.batches.peek")}</Button>
            {published && <Button variant="quiet" aria-label={t("words.batches.drillNamed", named)}
              onClick={() => { void navigate({ to: "/words/drill", search: { source: "lesson", lesson: lesson.id, batch: batch.number, direction: "mixed" } }); }}>{t("words.batches.drill")}</Button>}
            {published && <Button variant="quiet" aria-label={t("words.batches.practiceNamed", named)} loading={practice.isPending && practice.variables?.number === batch.number}
              disabled={practice.isPending} onClick={() => practice.mutate(batch)}><Sparkles aria-hidden="true" className={styles.ai} />{t("words.batches.practice")}</Button>}
          </div>
        </li>;
      })}</ol>
      {practice.isError && <p className={styles.error} role="alert">{t("words.batches.practiceFailed")}</p>}
    </div>}
    {peekIn === "dialog" && <AdaptiveDialog opened={Boolean(peeking)} onClose={() => setPeeking(null)}
      title={peeking ? t("words.batches.peekTitle", { number: peeking.number, title: title ?? lesson.title }) : ""}>{peek}</AdaptiveDialog>}
  </SpeechScope></WordBookmarkScope>;
}
