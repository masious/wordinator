import {
  COURSE_TEXT_MAX, COURSE_TITLE_MAX, okResponseSchema, outlineResponseSchema, type CourseLessonSummary, type CourseProgressResponse, type LessonInput, type LessonPosition,
} from "@wordinator/contracts";
import { lessonResponseSchema, type CourseDetailResponse, type CourseLesson, type LessonDocument as LessonDocumentData } from "@wordinator/contracts/lesson-document";
import type { LessonAiPracticesResponse } from "@wordinator/contracts/tutor";
import type { ActivityDescriptor } from "@wordinator/contracts/lesson-activities";
import { Drawer } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type FormEvent, lazy, type RefObject, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, BookA, Check, ChevronRight, ListTree, PencilLine } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, courseQueryOptions, courseWordsQueryOptions, lessonActivitiesQueryOptions, lessonAiPracticesQueryOptions, lessonQueryOptions, wordBookmarksKey } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { relativeTime } from "../../relativeTime";
import { lessonSpeech, SpeechScope } from "../../molecules/Speech";
import { AdaptiveDialog, Button, ButtonGroup, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, MetadataItem, MetadataRow, SectionHeader, Surface, TextAreaField, TextField } from "../../ui";
import { LessonDocument } from "../LessonDocument/LessonDocument";
import { LessonShareScope, ShareButton, useLessonShareScope } from "../LessonShare/LessonShare";
import { useLessonBookmarkTarget, WordBookmarkScope } from "../WordBookmark/WordBookmark";
import { WordRecap } from "../WordRecap/WordRecap";
import { RAIL_DRAWER_QUERY, useRailSlots } from "../GroupFrame/GroupFrame";
import { CourseErrorMessage } from "./CourseErrorMessage";
import { LessonResetAction } from "./CourseProgress";
import { LessonActions } from "./LessonActions";
import { lessonSteps, playableDocument } from "./LessonPlayer";
import styles from "./CourseLessons.module.css";
import { LessonReadingProgress, type ReadingTracking, saveLessonPosition, useResumeScroll } from "./LessonReadingProgress";
import { typicalMinutes, useReadingTime } from "./LessonTime";
import { CategoryBadge, entryStates, LessonIndex, lessonIndexEntries, LESSON_INDEX_MIN, stickyInset, useCurrentEntry, type LessonIndexEntry } from "./LessonIndex";
import { LessonBox, LessonBoxActions, SectionActivities, type LessonActivitySuggestion, type LessonBoxLesson } from "./LessonBox";
import { activityParts, activityPlacements, sectionActivities, useVisibleParts } from "./activitySections";
import { HeadingDot } from "./HeadingDot";
import { LessonStickyHeader } from "./LessonStickyHeader";
import { LessonWords, useVisibleWords, useWordsCollapsed, type LessonWordsPlacement } from "./LessonWords";
import { practiceFromBlock, PracticeSummary } from "./PracticeBlock";
import { PracticeStepper } from "./PracticeStepper";
import { AiPracticeToggle, useAiPracticeSlots, type AiPracticeScope } from "./AiPractices";

const NO_ENTRIES: LessonIndexEntry[] = [];
const NO_DESCRIPTORS: ActivityDescriptor[] = [];

// The editor and BlockNote load only when someone opens a lesson for editing.
const LessonEditor = lazy(() => import("../LessonEditor/LessonEditor"));

// The owner publishes; contributors edit every lesson draft and the details of unpublished lessons.
type Scope = { groupId: string; courseId: string; courseSlug: string; accountId: string; owner: boolean; contribute: boolean; removable: boolean };

const lessonsPath = ({ groupId, courseId }: Scope) => `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons`;
const swap = (ids: string[], index: number, offset: -1 | 1) => {
  const next = [...ids]; const target = index + offset;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};
const canEditDetails = (scope: Scope, lesson: { published: boolean }) => scope.owner || (scope.contribute && !lesson.published);

// Behind the start gate the lesson shows up to and including its first top-level dialogue (in Dutch Foundations the story that
// opens every lesson), then a short faded strip of what follows. A long dialogue on a narrow or short window is cut at two window
// heights (at least 48rem), so the button stays near. Without a dialogue the stylesheet's height cut applies. The cut follows
// resizes and orientation changes.
const GATE_FADE_PX = 96;
function useGateHeight(reading: RefObject<HTMLElement | null>, document: LessonDocumentData | null) {
  const [height, setHeight] = useState<number | null>(null);
  const dialogueId = document?.blocks.find((block) => block.type === "dialogue")?.id ?? null;
  useLayoutEffect(() => {
    const root = reading.current;
    if (!root || !dialogueId) { setHeight(null); return; }
    const measure = () => {
      const dialogue = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(dialogueId)}"]`);
      if (!dialogue) return setHeight(null);
      const rem = parseFloat(getComputedStyle(window.document.documentElement).fontSize) || 16;
      const limit = Math.max(2 * window.innerHeight, 48 * rem);
      setHeight(Math.min(Math.ceil(dialogue.getBoundingClientRect().bottom - root.getBoundingClientRect().top) + GATE_FADE_PX, limit));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const child of root.children) observer.observe(child);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [reading, dialogueId]);
  return height;
}

// A return from an activity lands on the section it came from (docs/lesson-activities.md): the block the URL's hash names goes just
// under the sticky inset, as the resume scroll places a step, with an instant jump under reduced motion. It happens once per hash,
// never behind the start gate, and a block that is no longer on the page leaves the lesson at its normal place.
function useHashScroll({ hash, reading, inset, gated }: { hash: string; reading: RefObject<HTMLElement | null>; inset: () => number; gated: boolean }) {
  const done = useRef<string | null>(null);
  const insetRef = useRef(inset); insetRef.current = inset;
  useEffect(() => {
    if (!hash || gated || done.current === hash) return;
    const frame = requestAnimationFrame(() => {
      done.current = hash;
      const target = reading.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(hash)}"]`);
      if (!target) return;
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - insetRef.current()), behavior: still ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, gated, reading]);
}

function StateChips({ lesson }: { lesson: Pick<CourseLessonSummary, "published" | "changed"> }) {
  const { t } = useTranslation();
  return <>
    {!lesson.published && <LabelChip>{t("courses.lessons.unpublished")}</LabelChip>}
    {lesson.changed && <LabelChip>{t("courses.lessons.changed")}</LabelChip>}
  </>;
}

// Readers see the published document. Editors of a lesson that is not published yet see its draft, marked as a preview. A practice
// shows only its first prompts; its answer set opens in a dialog that, beside the vocabulary panel, sits over the text. New words
// are not shown in the text. The page fills the frame's lesson rail (docs/courses.md#lesson-pages): the lesson box at its top, the
// lesson's index (its headings, following the reader) under it, the lesson's actions above the profile row, and the
// vocabulary panel, where the words of the blocks on screen are highlighted, in the right rail. Below 62em the panel sits under the
// text; phones get a lesson action bar whose Contents opens the rail drawer and whose Words opens the panel as a bottom sheet.
// `aiPractices`, once expanded and read, places the lesson's AI practices after their anchor blocks and at the end.
// `gate` shows only the lesson's beginning, faded, behind Start reading this lesson (docs/courses.md#lesson-pages), with nothing
// tracked or indexed until it is pressed. `started` is set once it has been pressed, which starts the reading clock at once.
// `header` is the page's sticky header slot, which the lesson fills with its title, `cover` and current section once started.
function LessonBody({ scope, lesson, tracking, resume, archived, aiPractices, box, gate, started, header, cover }: {
  scope: Scope; lesson: CourseLesson; tracking: ReadingTracking; resume: LessonPosition | undefined; archived: boolean;
  aiPractices?: { scope: AiPracticeScope; data: LessonAiPracticesResponse | undefined }; box: LessonBoxLesson;
  gate?: () => void; started: boolean; header?: HTMLElement | null; cover?: string | null;
}) {
  const { t } = useTranslation();
  const document = playableDocument(lesson);
  const activityDescriptorsQuery = useQuery({ ...lessonActivitiesQueryOptions(scope.groupId, scope.courseId, lesson.id), enabled: Boolean(lesson.published && document && !gate && !archived) });
  const allActivityDescriptors = activityDescriptorsQuery.data?.descriptors ?? NO_DESCRIPTORS;
  // The viewer's completed activities (current versions only), keyed as `sourceId:type`, mark their suggestions Done.
  const doneActivities = new Set((activityDescriptorsQuery.data?.completed ?? []).map((entry) => `${entry.sourceId}:${entry.type}`));
  // Draft previews show no AI practices; they are tagged to the published document only.
  const slots = useAiPracticeSlots(aiPractices?.scope ?? null, lesson.document, aiPractices?.data);
  const steps = useMemo(() => lessonSteps(lesson), [lesson]);
  const entries = useMemo(() => document ? lessonIndexEntries(document) : [], [document]);
  const reading = useRef<HTMLDivElement>(null); const side = useRef<HTMLDivElement>(null);
  const active = useVisibleWords(reading, side, steps);
  // The URL's hash, set when an activity returns to its section, wins over the saved step for that load.
  const hash = useRouterState({ select: (state) => state.location.hash });
  const inset = () => stickyInset(side.current);
  useResumeScroll({ steps, reading, position: resume, inset, anchor: hash || undefined });
  useHashScroll({ hash, reading, inset, gated: Boolean(gate) });
  // Only published lessons record time; draft previews never do.
  useReadingTime({ reading, document: lesson.document, enabled: lesson.document !== null && !gate, started, groupId: scope.groupId, courseId: scope.courseId, lessonId: lesson.id });
  const [wordsCollapsed, toggleWords] = useWordsCollapsed();
  const rail = useRailSlots();
  const phone = useMediaQuery("(max-width: 48em)", undefined, { getInitialValueInEffect: false });
  // Below the rail's drawer breakpoint the lesson's actions are in the drawer; above it they sit in the New words panel's footer.
  const railDrawer = useMediaQuery(RAIL_DRAWER_QUERY, undefined, { getInitialValueInEffect: false });
  const inline = useMediaQuery("(max-width: 62em)", undefined, { getInitialValueInEffect: false });
  // Up to 75em the right rail is narrowed for the reading column, so there the docked panel can collapse to a column of icons;
  // wider, there is room for both and it stays open.
  const roomy = !useMediaQuery("(max-width: 75em)", undefined, { getInitialValueInEffect: false });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [percent, setPercent] = useState(0);
  const [reachedStep, setReachedStep] = useState(-1);
  const gateHeight = useGateHeight(reading, gate ? document : null);
  // Only words of the published document can be bookmarked, so a draft preview shows no toggles.
  const bookmarkTarget = useLessonBookmarkTarget(scope.groupId, scope.courseId, lesson.id, lesson.document);
  const speech = useMemo(() => lessonSpeech(lesson), [lesson]);
  const resolveSpeech = useCallback((key: string) => speech[key] ?? null, [speech]);
  // Examples and dialogues of a shareable lesson are selectable and reveal their Share action (docs/lesson-shares.md).
  const share = useLessonShareScope(scope.groupId, scope.courseId, lesson);
  const practiceScope = { groupId: scope.groupId, courseId: scope.courseId, lessonId: lesson.id, accountId: scope.accountId };
  // The index and the headings it lists share each entry's state: current, passed, or locked until the reader reaches it. Behind
  // the start gate there is neither.
  // The current entry is followed even when the index is too short to show, since Do more with AI follows it too.
  const tracked = gate ? NO_ENTRIES : entries;
  const indexed = tracked.length >= LESSON_INDEX_MIN ? tracked : NO_ENTRIES;
  const current = useCurrentEntry(tracked, reading, side);
  const [visited, setVisited] = useState(-1);
  useEffect(() => setVisited((furthest) => Math.max(furthest, current)), [current]);
  const states = useMemo(() => entryStates(indexed, current, reachedStep, visited), [indexed, current, reachedStep, visited]);
  const badges = useMemo(() => new Map(indexed.flatMap((entry, index) => entry.color ? [] : [[entry.id, { category: entry.category, locked: states[index] === "locked" }] as const])), [indexed, states]);
  // Do more with AI offers the current entry's section's activities, with only the grammar parts on screen
  // (docs/lesson-activities.md#scope-and-entry-point). Every level-3 heading carries its colour dot, in the text as in the index.
  const parts = useMemo(() => activityParts(tracked, allActivityDescriptors), [tracked, allActivityDescriptors]);
  const visibleParts = useVisibleParts(parts, tracked, reading, side);
  const section = sectionActivities(tracked, current, allActivityDescriptors, visibleParts);
  const activitySuggestions: LessonActivitySuggestion[] = section.activities.flatMap(({ descriptor, part }) => descriptor.activityTypes.map((type) => ({ descriptor, type, part, done: doneActivities.has(`${descriptor.sourceId}:${type}`) })));
  // Each source's activities also sit in the text, after its section's last block (docs/lesson-activities.md#in-the-text).
  const placements = useMemo(() => document ? activityPlacements(document, tracked, allActivityDescriptors) : new Map<string, never[]>(), [document, tracked, allActivityDescriptors]);
  const renderAfterBlock = (id: string) => {
    const placed = placements.get(id);
    const practices = slots?.afterBlock(id);
    if (!placed?.length) return practices;
    return <>{practices}<SectionActivities courseSlug={scope.courseSlug} lessonSlug={lesson.slug}
      suggestions={placed.flatMap(({ descriptor, part }) => descriptor.activityTypes.map((type) => ({ descriptor, type, part, done: doneActivities.has(`${descriptor.sourceId}:${type}`) })))} /></>;
  };
  const colors = useMemo(() => new Map(indexed.flatMap((entry) => entry.color ? [[entry.id, entry.color] as const] : [])), [indexed]);
  const renderHeadingBadge = useCallback((id: string) => {
    const badge = badges.get(id);
    if (badge) return <CategoryBadge category={badge.category} locked={badge.locked} content />;
    const color = colors.get(id);
    return color ? <HeadingDot color={color} /> : null;
  }, [badges, colors]);
  // The level-1 or level-2 entry the current one is in, which the sticky header names before a level-3 entry.
  let sectionIndex = current;
  while (sectionIndex > 0 && tracked[sectionIndex]?.level === 3) sectionIndex -= 1;
  const sectionEntry = tracked[sectionIndex]?.level === 3 ? undefined : tracked[sectionIndex];
  const lessonBox = <>
    {header && !gate && createPortal(<LessonStickyHeader title={box.title} cover={cover ?? null} entry={tracked[current]} section={sectionEntry} />, header)}
    {rail.box && createPortal(<LessonBox lesson={box} percent={percent} />, rail.box)}
    {rail.actions && createPortal(<LessonBoxActions lesson={box} courseSlug={scope.courseSlug} lessonSlug={lesson.slug} suggestions={activitySuggestions} completedCount={doneActivities.size} sectionLabel={section.label} sectionCategory={section.category} />, rail.actions)}
  </>;
  if (!document || !steps.length) return <div className={styles.body}><p className={styles.emptyLesson}>{t("courses.lessons.empty")}</p>{lessonBox}</div>;
  const hasWords = steps.some((step) => step.words.length > 0);
  // Where the vocabulary panel goes: the right rail on wide screens, under the text below 62em (or outside the frame), a sheet on phones.
  const placement = !hasWords ? null : phone ? "sheet" : !inline && rail.reference ? "rail" : "under";
  const docked = placement === "rail";
  const actions = (compact: boolean) => <LessonBoxActions lesson={box} compact={compact} courseSlug={scope.courseSlug} lessonSlug={lesson.slug} suggestions={activitySuggestions} completedCount={doneActivities.size} sectionLabel={section.label} sectionCategory={section.category} />;
  const words = (props: { placement: LessonWordsPlacement; collapsible?: boolean }) =>
    <LessonWords steps={steps} active={active} groupId={scope.groupId} collapsed={wordsCollapsed} onToggle={toggleWords}
      footer={railDrawer ? undefined : actions} {...props} />;
  // Without a New words panel the actions it would carry stand alone in the same place: the right rail, or under the text.
  const actionsAlone = !hasWords && !railDrawer && !rail.actions ?(!inline && rail.reference ? "rail" : "under") : null;
  return <LessonShareScope scope={share}><WordBookmarkScope resolve={bookmarkTarget}><SpeechScope resolve={resolveSpeech}><div className={styles.reader} data-action-bar={phone || undefined}>
    {!gate && <LessonReadingProgress steps={steps} reading={reading} tracking={tracking} onPercent={setPercent} onReached={setReachedStep} />}
    <div ref={reading} className={gate ? `${styles.body} ${styles.gated}` : styles.body} style={gate && gateHeight !== null ? { maxBlockSize: gateHeight } : undefined}>
      {!lesson.document && <p className={styles.preview}>{t("courses.lessons.draftPreview")}</p>}
      <LessonDocument document={document} anchored vocabulary={false} renderAfterBlock={renderAfterBlock} renderHeadingBadge={renderHeadingBadge}
        renderShare={share ? (block) => <ShareButton piece={block.type === "example" ? { kind: "example", block } : { kind: "dialogue", block }}
          label={t(`lessonShares.shareNamed.${block.type}`)} /> : undefined}
        renderPractice={(block) =>
        <PracticeSummary scope={practiceScope} block={practiceFromBlock(block, lesson.practiceProgress)} published={lesson.document !== null} archived={archived} />}
        renderPracticeGroup={(items) => <PracticeStepper items={items} scope={practiceScope} progress={lesson.practiceProgress}
          published={lesson.document !== null} archived={archived} />} />
      {slots?.end}
      {gate && <div className={styles.gateFade} aria-hidden="true" />}
    </div>
    {gate && <div className={styles.gate}>
      <p className={styles.gateNotice}>{t("courses.lessons.startNotice")}</p>
      <Button onClick={gate}>{t("courses.lessons.startReading")}</Button>
    </div>}
    {docked && rail.reference && createPortal(<div ref={side} className={styles.side}>{words({ placement: "rail", collapsible: !roomy })}</div>, rail.reference)}
    {placement === "under" && <div ref={side} className={styles.under}>{words({ placement: "under" })}</div>}
    {actionsAlone === "rail" && rail.reference && createPortal(<div ref={side} className={styles.side}><div className={styles.actionsAlone}>{actions(false)}</div></div>, rail.reference)}
    {actionsAlone === "under" && <div ref={side} className={styles.under}><div className={styles.actionsAlone}>{actions(false)}</div></div>}
    {indexed.length > 0 && rail.index && createPortal(<LessonIndex entries={indexed} current={current} states={states} reading={reading} side={side} onJump={rail.closeRail} />, rail.index)}
    {lessonBox}
    {phone && createPortal(<nav className={styles.actionBar} aria-label={t("courses.lessons.actionBar")}>
      <button type="button" className={styles.barButton} onClick={rail.openRail}><ListTree aria-hidden="true" />{t("courses.lessons.contents")}</button>
      {hasWords && <button type="button" className={styles.barButton} aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}><BookA aria-hidden="true" />{t("courses.lessons.words")}</button>}
    </nav>, window.document.body)}
    {placement === "sheet" && <Drawer opened={sheetOpen} onClose={() => setSheetOpen(false)} position="bottom" size="75%" title={t("courses.words.title")}
      classNames={{ content: styles.sheet, header: styles.sheetHeader, body: styles.sheetBody }}>
      {words({ placement: "sheet" })}
    </Drawer>}
  </div></SpeechScope></WordBookmarkScope></LessonShareScope>;
}

function LessonForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: {
  initial?: CourseLessonSummary; submitLabel: string; pending: boolean; error: Error | null; onSubmit: (input: LessonInput) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? ""); const [goal, setGoal] = useState(initial?.goal ?? "");
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit({ title, goal: goal || null }); };
  return <form className={styles.form} onSubmit={submit}>
    <TextField label={t("courses.lessons.fields.title")} value={title} maxLength={COURSE_TITLE_MAX} required onChange={(event) => setTitle(event.currentTarget.value)} />
    <TextAreaField label={t("courses.lessons.fields.goal")} value={goal} maxLength={COURSE_TEXT_MAX} autosize minRows={2} onChange={(event) => setGoal(event.currentTarget.value)} />
    <CourseErrorMessage error={error} />
    <div className={styles.actions}><Button variant="quiet" onClick={onCancel}>{t("common.cancel")}</Button><Button type="submit" loading={pending} disabled={!title.trim()}>{submitLabel}</Button></div>
  </form>;
}

type LessonPractices = CourseProgressResponse["practices"][string];

// How many of the lesson's published practices remain for the viewer, and when they last practiced in it. Archived courses refuse
// practice progress, so they show only the last practice.
function PracticeActivity({ summary, practices, archived }: { summary: CourseLessonSummary; practices: LessonPractices | undefined; archived: boolean }) {
  const { t } = useTranslation();
  const remaining = Math.max(0, summary.practiceCount - (practices?.done ?? 0));
  const status = summary.practiceCount > 0 && !archived;
  if (!status && !practices) return null;
  return <>
    {status && (remaining ? <span className={styles.practices}>{t("courses.lessonActions.practicesRemain", { count: remaining })}</span>
      : <span className={styles.practicesDone}>{t("courses.lessonActions.practicesDone")}</span>)}
    {practices && <span className={styles.lastPractice}>
      <Trans i18nKey="courses.lessonActions.lastPractice" values={{ time: relativeTime(practices.practicedAt) }}
        components={{ time: <time dateTime={new Date(practices.practicedAt).toISOString()} title={new Date(practices.practicedAt).toLocaleString()} /> }} />
    </span>}
  </>;
}

// One entry of the course's lesson list. It links to the lesson page, reports where the reader stands, and offers the lesson's own
// actions: play it, review its words, and practice again. `saved` is the viewer's saved position, also in a finished lesson.
function LessonRow({ scope, summary, number, completed, saved, practices, archived, onPlay }: {
  scope: Scope; summary: CourseLessonSummary; number: number; completed: boolean; saved: LessonPosition | undefined;
  practices: LessonPractices | undefined; archived: boolean; onPlay: (lessonId: string) => void;
}) {
  const { t } = useTranslation();
  const position = completed ? undefined : saved;
  const activity = summary.published && (summary.practiceCount > 0 || practices);
  // The lesson's typical reading plus practice time, from the course read (C15, docs/learning-time.md#lesson-and-practice-times).
  const typical = summary.typicalSeconds ?? null;
  // The number circle: a success check once finished, the accent while a saved step is waiting, otherwise the plain number.
  const marker = completed ? "done" : position ? "current" : "upcoming";
  return <li className={summary.imageUrl ? `${styles.item} ${styles.itemWithImage}` : styles.item}>
    <div className={styles.itemMain}>
      <Link className={styles.itemLink} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: scope.courseSlug, lessonSlug: summary.slug }}
        aria-label={t("courses.lessons.open", { number, title: summary.title })}>
        {/* The link's label names the lesson, so its first image is decorative here; it is positioned against the whole row. */}
        {summary.imageUrl && <span className={styles.itemImage}><img src={summary.imageUrl} alt="" loading="lazy" decoding="async" /></span>}
        <span className={styles.itemNumber} data-state={marker}>
          {completed ? <Check role="img" aria-label={t("courses.progress.completed")} /> : number}
        </span>
        <span className={styles.itemCopy}>
          <span className={styles.itemTitle}>{summary.title}</span>
          {summary.goal && <span className={styles.itemGoal}>{summary.goal}</span>}
          {(completed || position || activity || typical !== null) && <span className={styles.itemStatus}>
            {completed && <span className={styles.completed}>{t("courses.progress.completed")}</span>}
            {!completed && position && <span className={styles.position}>{t("courses.player.step", { current: position.stepIndex + 1, total: position.totalSteps })}</span>}
            {activity && <PracticeActivity summary={summary} practices={practices} archived={archived} />}
            {typical !== null && <span className={styles.typical}>{t("courses.lessons.typical", { minutes: typicalMinutes(typical) })}</span>}
          </span>}
        </span>
      </Link>
      <LessonActions scope={scope} summary={summary} number={number} completed={completed} position={saved} practices={practices} archived={archived} onPlay={onPlay} />
    </div>
    {/* Editors still see which lessons readers cannot see yet; changing lessons happens on the manage page. */}
    {scope.contribute && (!summary.published || summary.changed) && <div className={styles.itemChips}><StateChips lesson={summary} /></div>}
  </li>;
}

// One lesson on the manage page: its details, place in the outline, and deletion. Reading and practising stay on the course page.
function ManagedLessonRow({ scope, summary, number, outline }: { scope: Scope; summary: CourseLessonSummary; number: number; outline: CourseLessonSummary[] }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [detailsOpen, setDetailsOpen] = useState(false); const [deleting, setDeleting] = useState(false);
  const courseKey = courseQueryOptions(scope.groupId, scope.courseId).queryKey;
  const lessonKey = lessonQueryOptions(scope.groupId, scope.courseId, summary.id).queryKey;
  const lessonPath = `${lessonsPath(scope)}/${encodeURIComponent(summary.id)}`;
  const update = useMutation({
    mutationFn: (input: LessonInput) => apiRequest(lessonPath, lessonResponseSchema, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: async (data) => { queryClient.setQueryData(lessonKey, data); await queryClient.invalidateQueries({ queryKey: courseKey }); setDetailsOpen(false); },
  });
  const move = useMutation({
    mutationFn: (offset: -1 | 1) => apiRequest(`${lessonsPath(scope)}/order`, outlineResponseSchema, { method: "PUT", body: JSON.stringify({ ids: swap(outline.map((entry) => entry.id), number - 1, offset) }) }),
    onSuccess: ({ outline: next }) => queryClient.setQueryData(courseKey, (current: CourseDetailResponse | undefined) => current && { ...current, outline: next }),
    onError: () => void queryClient.invalidateQueries({ queryKey: courseKey }),
  });
  const remove = useMutation({
    mutationFn: () => apiRequest(lessonPath, okResponseSchema, { method: "DELETE" }),
    onSuccess: async () => {
      setDeleting(false); queryClient.removeQueries({ queryKey: lessonKey });
      // Deleting a lesson also deletes its words' bookmarks.
      void queryClient.invalidateQueries({ queryKey: wordBookmarksKey(scope.groupId) });
      await queryClient.invalidateQueries({ queryKey: courseKey });
    },
  });
  return <li className={styles.lesson}>
    <div className={styles.lessonMain}>
      <Link className={styles.lessonLink} to="/courses/$courseSlug/lessons/$lessonSlug" params={{ courseSlug: scope.courseSlug, lessonSlug: summary.slug }}
        aria-label={t("courses.lessons.open", { number, title: summary.title })}>
        <span className={styles.lessonNumber}>{number}</span>
        <span className={styles.lessonCopy}><span className={styles.lessonTitle}>{summary.title}</span></span>
      </Link>
    </div>
    <div className={styles.blockTools}>
      <StateChips lesson={summary} />
      <ButtonGroup className={styles.managedTools} label={t("courses.lessons.toolsNamed", { number, title: summary.title })}>
        {canEditDetails(scope, summary) && <Button variant="quiet" onClick={() => { update.reset(); setDetailsOpen(true); }}>{t("courses.lessons.editDetails")}</Button>}
        {scope.owner && <>
          <Button variant="quiet" disabled={number === 1} onClick={() => move.mutate(-1)} aria-label={t("courses.lessons.moveUpNamed", { number })}>{t("courses.moveUp")}</Button>
          <Button variant="quiet" disabled={number === outline.length} onClick={() => move.mutate(1)} aria-label={t("courses.lessons.moveDownNamed", { number })}>{t("courses.moveDown")}</Button>
        </>}
        {scope.removable && <Button variant="quiet" onClick={() => setDeleting(true)} aria-label={t("courses.lessons.deleteNamed", { number })}>{t("courses.delete")}</Button>}
      </ButtonGroup>
      <CourseErrorMessage error={move.error} />
    </div>
    <AdaptiveDialog opened={detailsOpen} onClose={() => setDetailsOpen(false)} title={t("courses.lessons.editTitle")}>
      {detailsOpen && <LessonForm initial={summary} submitLabel={t("common.save")} pending={update.isPending} error={update.error}
        onSubmit={(input) => update.mutate(input)} onCancel={() => setDetailsOpen(false)} />}
    </AdaptiveDialog>
    <ConfirmDialog opened={deleting} onClose={() => setDeleting(false)} title={t("courses.lessons.deleteTitle")} confirmLabel={t("courses.delete")} cancelLabel={t("common.cancel")} confirmLoading={remove.isPending} onConfirm={() => remove.mutate()}>
      {t("courses.lessons.deleteConfirm", { title: summary.title })}<CourseErrorMessage error={remove.error} />
    </ConfirmDialog>
  </li>;
}

const lessonScope = (groupId: string, courseId: string, accountId: string, detail: CourseDetailResponse): Scope => {
  const { permissions } = detail.course;
  return { groupId, courseId, courseSlug: detail.course.slug, accountId, owner: permissions.edit, contribute: permissions.contribute, removable: permissions.removeContent };
};

// The course page's lesson list. Each lesson's content lives on its own page.
export function CourseLessons({ groupId, courseId, accountId, detail }: { groupId: string; courseId: string; accountId: string; detail: CourseDetailResponse }) {
  const { t } = useTranslation(); const navigate = useNavigate();
  const scope = lessonScope(groupId, courseId, accountId, detail);
  const { outline } = detail;
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  const completed = new Set(progress.data?.completedLessonIds ?? []);
  // Saved steps, shown on each started lesson and resumed by its Continue action.
  const positions = progress.data?.positions ?? [];
  // Playing a lesson opens its page; a saved step, also in a finished lesson, opens it scrolled there.
  const play = (lesson: CourseLessonSummary) => void navigate({ to: "/courses/$courseSlug/lessons/$lessonSlug", params: { courseSlug: scope.courseSlug, lessonSlug: lesson.slug },
    search: positions.some((entry) => entry.lessonId === lesson.id) ? { resume: true } : {} });
  // The course recap covers the published lessons the viewer has finished; it is offered only when they carried words.
  const wordsQuery = useQuery(courseWordsQueryOptions(groupId, courseId));
  const words = useMemo(() => wordsQuery.data?.words ?? [], [wordsQuery.data]);
  const [reviewing, setReviewing] = useState(false);
  // Every recap word comes from the published index and carries its lesson, so each can be bookmarked there.
  const recapTarget = useCallback((_wordId: string, lessonId?: string) => lessonId ? { groupId, courseId, lessonId } : null, [groupId, courseId]);
  return <section className={styles.index} aria-label={t("courses.lessons.outline")}>
    <SectionHeader title={t("courses.lessons.outline")}
      description={outline.length ? t("courses.lessons.outlineCount", { count: outline.length }) : undefined} />
    {words.length > 0 && <Surface tone="quiet" className={styles.recap}>
      <p>{t("courses.words.courseHelp", { count: words.length })}</p>
      <Button variant="secondary" onClick={() => setReviewing(true)}>{t("courses.words.review")}</Button>
    </Surface>}
    {outline.length
      ? <ol className={styles.items}>{outline.map((lesson, index) => <LessonRow key={lesson.id} scope={scope} summary={lesson} number={index + 1}
        completed={completed.has(lesson.id)} saved={positions.find((entry) => entry.lessonId === lesson.id)} practices={progress.data?.practices[lesson.id]} archived={detail.course.status === "archived"} onPlay={() => play(lesson)} />)}</ol>
      : <Surface tone="quiet"><EmptyState title={t("courses.noLessonsTitle")}>{t("courses.noLessonsBody")}</EmptyState></Surface>}
    <AdaptiveDialog opened={reviewing && words.length > 0} onClose={() => setReviewing(false)} title={t("courses.words.recapTitle")}>
      {reviewing && <WordBookmarkScope resolve={recapTarget}>
        <WordRecap words={words} doneLabel={t("courses.words.backToCourse")} onDone={() => setReviewing(false)} />
      </WordBookmarkScope>}
    </AdaptiveDialog>
  </section>;
}

// One lesson on its own page: its blocks, with editing for contributors, and links to the neighbouring lessons.
// The manage page's lesson list: add lessons, edit their details, reorder, and delete. Lesson content is edited on each lesson's page.
export function CourseLessonTools({ groupId, courseId, accountId, detail }: { groupId: string; courseId: string; accountId: string; detail: CourseDetailResponse }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const navigate = useNavigate();
  const scope = lessonScope(groupId, courseId, accountId, detail);
  const { outline } = detail;
  const [addOpen, setAddOpen] = useState(false);
  const create = useMutation({
    mutationFn: (input: LessonInput) => apiRequest(lessonsPath(scope), lessonResponseSchema, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (data) => {
      queryClient.setQueryData(lessonQueryOptions(groupId, courseId, data.lesson.id).queryKey, data);
      await queryClient.invalidateQueries({ queryKey: courseQueryOptions(groupId, courseId).queryKey });
      setAddOpen(false);
      await navigate({ to: "/courses/$courseSlug/lessons/$lessonSlug", params: { courseSlug: detail.course.slug, lessonSlug: data.lesson.slug } });
    },
  });
  const addAction = scope.contribute && <Button onClick={() => { create.reset(); setAddOpen(true); }}>{t("courses.lessons.add")}</Button>;
  return <section className={styles.index} aria-label={t("courses.lessons.outline")}>
    <SectionHeader title={t("courses.lessons.outline")}
      description={outline.length ? t("courses.lessons.outlineCount", { count: outline.length }) : undefined} action={outline.length ? addAction || undefined : undefined} />
    {outline.length
      ? <ol className={styles.lessonList}>{outline.map((lesson, index) => <ManagedLessonRow key={lesson.id} scope={scope} summary={lesson} number={index + 1} outline={outline} />)}</ol>
      : <Surface tone="quiet"><EmptyState title={t("courses.noLessonsTitle")} action={addAction || undefined}>{t("courses.noLessonsBody")}</EmptyState></Surface>}
    <AdaptiveDialog opened={addOpen} onClose={() => setAddOpen(false)} title={t("courses.lessons.addTitle")}>
      {addOpen && <LessonForm submitLabel={t("courses.lessons.addSubmit")} pending={create.isPending} error={create.error} onSubmit={(input) => create.mutate(input)} onCancel={() => setAddOpen(false)} />}
    </AdaptiveDialog>
  </section>;
}

// `resume` opens the lesson at the viewer's saved step, also in a finished lesson they are going through again.
// `language` is the library language, for the microphone of AI practices.
export function LessonView({ groupId, courseId, accountId, detail, lessonId, dataUpdatedAt, resume = false, language }: {
  groupId: string; courseId: string; accountId: string; detail: CourseDetailResponse; lessonId: string; dataUpdatedAt: number; resume?: boolean; language?: string;
}) {
  const { t } = useTranslation(); const navigate = useNavigate();
  const scope = lessonScope(groupId, courseId, accountId, detail);
  const { outline } = detail; const index = outline.findIndex((entry) => entry.id === lessonId);
  const summary = outline[index];
  const preloaded = detail.lessons.find((entry) => entry.id === lessonId);
  const lesson = useQuery({ ...lessonQueryOptions(groupId, courseId, lessonId), initialData: preloaded && { lesson: preloaded }, initialDataUpdatedAt: dataUpdatedAt, enabled: index >= 0 });
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  // Pressing the start gate this visit; the saved position keeps the lesson open whole on later visits.
  const [started, setStarted] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  // AI practices (C14h) expand on request and are read only then; the choice is not remembered.
  const [aiShown, setAiShown] = useState(false);
  const aiPracticeCount = lesson.data?.lesson.document ? lesson.data.lesson.aiPracticeCount ?? 0 : 0;
  const aiOpen = aiShown && aiPracticeCount > 0 && !editing;
  const aiPractices = useQuery({ ...lessonAiPracticesQueryOptions(groupId, courseId, lessonId), enabled: aiOpen });
  const aiScope = useMemo<AiPracticeScope>(() => ({ groupId, courseId, lessonId, language }), [groupId, courseId, lessonId, language]);
  if (!summary) return <ErrorState title={t("courses.lessons.unavailable")} />;
  const number = index + 1; const data = lesson.data?.lesson;
  // The outline summary is fresher after a publish elsewhere; the loaded lesson is fresher after this viewer's own edits.
  const current = data ?? summary;
  const completed = progress.data?.completedLessonIds.includes(lessonId) ?? false;
  const saved = progress.data?.positions.find((entry) => entry.lessonId === lessonId);
  const position = completed ? undefined : saved;
  const playable = data ? lessonSteps(data).length > 0 : false;
  const resettable = Boolean(data?.published && data.document) && detail.course.status !== "archived";
  const previous = outline[index - 1]; const next = outline[index + 1];
  const steps = data ? lessonSteps(data) : [];
  const wordCount = new Set(steps.flatMap((step) => step.words.map((word) => word.id))).size;
  const archived = detail.course.status === "archived";
  const lessonPath = `${lessonsPath(scope)}/${encodeURIComponent(lessonId)}`;
  // A published lesson the viewer has neither started nor finished opens behind the start gate, once their progress is known.
  // Archived courses refuse positions, so nothing would record the start and they open whole.
  const gated = !started && !editing && Boolean(data?.published && data.document) && !archived && progress.isSuccess && !completed && !saved;
  const start = () => {
    setStarted(true);
    // The first step becomes the viewer's position, so the lesson is in progress.
    if (steps[0]) void saveLessonPosition(queryClient, { path: lessonPath, groupId, courseId }, steps[0]);
  };
  const lessonLink = (target: CourseLessonSummary) => ({ to: "/courses/$courseSlug/lessons/$lessonSlug" as const, params: { courseSlug: detail.course.slug, lessonSlug: target.slug } });
  return <article className={styles.page} aria-labelledby="lesson-title">
    {/* The sticky header's slot; the lesson body fills it while the lesson is read. */}
    <div ref={setHeaderSlot} className={styles.headerSlot} data-lesson-header />
    {/* The lesson's cover: its first image, as on the course page's lesson list; decorative beside the title. */}
    {summary.imageUrl && <div className={styles.cover} data-lesson-cover><img src={summary.imageUrl} alt="" decoding="async" /></div>}
    <header className={styles.lessonHeader}>
      <nav className={styles.breadcrumb} aria-label={t("courses.lessons.breadcrumb")}>
        <Link to="/courses/$courseSlug" params={{ courseSlug: detail.course.slug }}>{detail.course.title}</Link>
        <ChevronRight aria-hidden="true" />
        <span aria-current="page">{t("courses.lessons.number", { number })}</span>
      </nav>
      <LabelChip tone="accent">{t("courses.lessons.badge", { number: String(number).padStart(2, "0") })}</LabelChip>
      <h1 id="lesson-title">{current.title}</h1>
      {current.goal && <p className={styles.dek}><PlainText>{current.goal}</PlainText></p>}
      {(wordCount > 0 || current.practiceCount > 0) && <MetadataRow>
        {wordCount > 0 && <MetadataItem icon={<BookA />}>{t("courses.lessons.wordCount", { count: wordCount })}</MetadataItem>}
        {current.practiceCount > 0 && <MetadataItem icon={<PencilLine />}>{t("courses.lessons.practiceCount", { count: current.practiceCount })}</MetadataItem>}
      </MetadataRow>}
      {/* One row: the saved step or Finished label, then Reset (C14, published lessons in courses that are not archived) and, for
          editors, Edit lesson, as buttons side by side. */}
      {!editing && ((playable && (completed || position)) || resettable || (scope.contribute && data)) && <div className={styles.start}>
        {playable && completed && <span className={styles.completed}>{t("courses.progress.completed")}</span>}
        {playable && !completed && position && <span className={styles.position}>{t("courses.player.step", { current: position.stepIndex + 1, total: position.totalSteps })}</span>}
        <div className={styles.headerActions}>
          {resettable && data && <LessonResetAction groupId={groupId} courseId={courseId} accountId={accountId} lesson={data}
            onReset={() => void navigate({ to: "/courses/$courseSlug", params: { courseSlug: detail.course.slug } })} />}
          {scope.contribute && data && <Button variant="secondary" onClick={() => setEditing(true)} aria-label={t("courses.lessons.editContentNamed", { number })}>{t("courses.lessons.editContent")}</Button>}
        </div>
      </div>}
      {scope.contribute && <div className={styles.blockTools}><StateChips lesson={current} /></div>}
    </header>
    {aiPracticeCount > 0 && !editing && !gated && <AiPracticeToggle count={aiPracticeCount} shown={aiOpen} onToggle={() => setAiShown((shown) => !shown)}
      state={aiPractices.isError ? "error" : aiPractices.isSuccess ? "success" : "pending"} onRetry={() => void aiPractices.refetch()} />}
    {lesson.isPending ? <LoadingState label={t("courses.lessons.loading")} />
      : lesson.isError || !data ? <ErrorState title={t("courses.lessons.unavailable")} />
      : editing ? <Suspense fallback={<LoadingState label={t("courses.editor.loading")} />}>
        <LessonEditor groupId={groupId} courseId={courseId} accountId={accountId} owner={scope.owner} lesson={data} onClose={() => setEditing(false)} />
      </Suspense>
      : <LessonBody scope={scope} lesson={data} resume={resume ? saved : undefined} archived={archived} gate={gated ? start : undefined} started={started}
        header={headerSlot} cover={summary.imageUrl}
        box={{ groupId, courseId, courseTitle: detail.course.title, lessonId, title: current.title, number }}
        aiPractices={aiOpen ? { scope: aiScope, data: aiPractices.data } : undefined} tracking={{
        // Scrolling saves the furthest step of a published lesson the viewer has not finished; previews and archived courses never save.
        save: data.published && data.document !== null && !completed && !archived && progress.isSuccess,
        completed, position, practicesDone: progress.data?.practices[lessonId]?.done ?? 0, path: lessonPath, groupId, courseId, lessonId,
      }} />}
    {/* The pager: Previous, the next lesson's title under Up next, and Next lesson. The links' names carry the titles. */}
    {(previous || next) && !gated && <nav className={styles.pager} aria-label={t("courses.lessons.pager")}>
      {previous ? <Link className={styles.previous} {...lessonLink(previous)} aria-label={t("courses.lessons.previous", { title: previous.title })}>
        <ArrowLeft aria-hidden="true" />{t("courses.lessons.previousShort")}
      </Link> : <span />}
      {next && <p className={styles.upNext}><span>{t("courses.lessons.upNext")}</span><strong>{next.title}</strong></p>}
      {next && <Link className={styles.next} {...lessonLink(next)} aria-label={t("courses.lessons.next", { title: next.title })}>
        {t("courses.lessons.nextShort")}<ArrowRight aria-hidden="true" />
      </Link>}
    </nav>}
  </article>;
}
