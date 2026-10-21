import {
  answerMatches, blankMatches, countBlanks, hasAuthorsVersion, type PracticeProgress, practiceProgressResponseSchema, RESPONSE_ANSWER_MAX, splitPracticePayload, type LearnerPracticePayload,
} from "@wordinator/contracts";
import { readPracticeBlock, type LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { type FocusEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseProgressQueryOptions, lessonQueryOptions } from "../../api";
import { sendPracticeAttempt } from "../../molecules/learningAttempts";
import { PlainText } from "../../molecules/PlainText";
import { DialoguePrompt, dialogueTurns } from "./DialoguePrompt";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Button, IconButton, TextAreaField, TextField } from "../../ui";
import { PassageShareNote, ShareButton, type SharePiece } from "../LessonShare/LessonShare";
import { flushLearningTime, useLearningClaim } from "../../learningTime";
import { joinWordOrder, wordOrderFromAnswer, wordOrderWords } from "./wordOrder";
import styles from "./PracticeBlock.module.css";

// A practice as readers see it: its block ID, the prompts with the authors' versions the answer check needs (never rendered before
// a check misses), and who has answered how much of it.
export type Practice = { id: string; payload: LearnerPracticePayload; progress: PracticeProgress };
const NO_PROGRESS: PracticeProgress = { done: 0, started: 0, answered: null };
export const practiceFromBlock = (block: LessonBlockOf<"practice">, progress: Record<string, PracticeProgress>): Practice => ({
  id: block.id, payload: splitPracticePayload(readPracticeBlock(block)).payload, progress: progress[block.id] ?? NO_PROGRESS,
});
// One question of a practice, as a lesson share piece. A practice with a reading passage cannot be shared.
export const questionPiece = (practice: Practice, itemIndex: number): SharePiece => {
  const { instruction, passage, items } = practice.payload; const item = items[itemIndex]!;
  return { kind: "question", blockId: practice.id, itemIndex, instruction, prompt: item.prompt, authorsVersion: item.authorsVersion, passage: Boolean(passage) };
};
export type PracticeScope = { groupId: string; courseId: string; lessonId: string; accountId: string };
type AnswerDraft = { version: 1; answers: string[] };

// Answer drafts follow the shared draft-key rules: account, group, draft kind, and target. They are the only copy of the answers.
// A shared question's answer check keeps its single answer the same way, as a `share-answer` draft.
export const practiceDraftKey = (accountId: string, groupId: string, kind: "practice-answer" | "share-answer", targetId: string) => `wordinator:draft:v1:${accountId}:${groupId}:${kind}:${targetId}`;
export function readAnswers(key: string, count: number): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as AnswerDraft | null;
    if (value?.version === 1 && Array.isArray(value.answers)) return Array.from({ length: count }, (_, index) => String(value.answers[index] ?? ""));
  } catch { /* discard incompatible local data */ }
  return Array.from({ length: count }, () => "");
}
export function storeAnswers(key: string, answers: string[]) {
  if (answers.some(Boolean)) localStorage.setItem(key, JSON.stringify({ version: 1, answers } satisfies AnswerDraft));
  else localStorage.removeItem(key);
}
export const countAnswered = (answers: readonly string[]) => answers.filter((answer) => answer.trim()).length;
// The Enter hint explains checking and line breaks in the answer field. It shows only for a practice with exactly one question; a
// practice with two or more questions shows it nowhere (docs/courses.md#practice-answers).
export const showsEnterHint = (questionCount: number) => questionCount === 1;

export const blockPath = (scope: PracticeScope, blockId: string) => `/api/groups/${encodeURIComponent(scope.groupId)}/courses/${encodeURIComponent(scope.courseId)}/lessons/${encodeURIComponent(scope.lessonId)}/blocks/${encodeURIComponent(blockId)}`;

// Saves how many questions of a practice the viewer has answered, read from the local draft; the answers never leave the device.
// The server keeps the highest count, so nothing is sent when the count is not above the known one. Previews record nothing.
export function usePracticeProgress(scope: PracticeScope, published: boolean) {
  const queryClient = useQueryClient();
  const { accountId, groupId, courseId, lessonId } = scope;
  return useCallback((practice: Practice) => {
    if (!published) return;
    const answered = countAnswered(readAnswers(practiceDraftKey(accountId, groupId, "practice-answer", practice.id), practice.payload.items.length));
    const known = practice.progress.answered;
    if (known === null ? answered === 0 : answered <= known) return;
    const path = blockPath({ accountId, groupId, courseId, lessonId }, practice.id);
    // The time in the practice is sent first, so a save that finishes it keeps that time for the practice's typical time (C15).
    void flushLearningTime().then(() => apiRequest(`${path}/progress`, practiceProgressResponseSchema, { method: "PUT", body: JSON.stringify({ answered }) }))
      // The course page counts done practices and the last practice time from the course progress.
      .then(() => Promise.all([lessonQueryOptions(groupId, courseId, lessonId), courseProgressQueryOptions(groupId, courseId)]
        .map(({ queryKey }) => queryClient.invalidateQueries({ queryKey }))), () => undefined);
  }, [accountId, courseId, groupId, lessonId, published, queryClient]);
}

// A fill-in item with several blanks is answered blank by blank. The blanks travel as one item answer joined by the separator
// the author's version uses, so answer sets keep one entry per item.
const BLANK_SEPARATOR = " · ";
export function splitBlanks(value: string, blanks: number): string[] {
  const parts = value ? value.split(BLANK_SEPARATOR) : [];
  return Array.from({ length: blanks }, (_, index) => index === blanks - 1 ? parts.slice(index).join(BLANK_SEPARATOR) : parts[index] ?? "");
}
export const joinBlanks = (parts: string[]) => parts.some((part) => part.trim()) ? parts.join(BLANK_SEPARATOR) : "";
const plainEnter = (event: KeyboardEvent) =>
  event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing;

// Where the learner is within a practice: on the third question of eight the bar is three eighths full.
export function PracticePosition({ current, total, className, labelBelow = false }: { current: number; total: number; className?: string; labelBelow?: boolean }) {
  const { t } = useTranslation();
  return <div className={`${styles.position} ${labelBelow ? styles.positionLabelBelow : ""} ${className ?? ""}`}>
    {!labelBelow && <p className={styles.positionLabel}>{t("courses.practice.position", { current, total })}</p>}
    <ProgressMeter size="compact" value={total ? (current / total) * 100 : 0} label={t("courses.practice.progressLabel")} />
    {labelBelow && <p className={styles.positionLabel}>{t("courses.practice.position", { current, total })}</p>}
  </div>;
}

// Records each answer check of a published practice as a practice attempt (docs/courses.md#practice-attempts), after the check has
// shown its result. Previews and archived courses record nothing (`enabled` false); a failed save is ignored.
export function usePracticeAttempt(scope: PracticeScope, enabled: boolean) {
  const { groupId, courseId, lessonId } = scope;
  return useCallback((practiceId: string, item: number, answer: string) => {
    if (enabled) sendPracticeAttempt({ groupId, courseId, lessonId }, practiceId, item, answer);
  }, [courseId, enabled, groupId, lessonId]);
}

// Enter checks the answer on this device against the author's version, with the same matching the contracts define for every
// surface; Shift+Enter keeps a new line. A match is celebrated and calls `onAdvance`, which moves to the next question. A miss
// keeps focus and shows the author's version as a reference, never as a verdict, because a sentence can be translated in several
// ways; it stays while the learner edits, until the next check. Enter on an empty answer, an unchanged checked answer, or an item
// without a complete author's version (nothing to check against) also calls `onAdvance`.
// `submitRef` lets a caller's own Next action check a filled answer before it moves on, exactly as Enter does. `onCheck` gets each
// whole-item check of a non-empty answer (an item with nothing to check counts, with its answer only) once per changed answer;
// blank-by-blank checks of a fill-in item are not reported, only the check of its last blank.
export type AnswerSubmit = RefObject<(() => void) | null>;
type PracticeQuestion = LearnerPracticePayload["items"][number];
// `blank` names the blank a check covered, or null for the whole item.
type Check = { answer: string; match: boolean; blank: number | null };
// `initialFocus` marks the field a dialog's focus trap focuses when it opens. `hidePromptLabel` lets the composer show the prompt at
// the top of its answer box while keeping the field's accessible name; `share` is an optional icon-only control at the row's end.
export function AnswerField({ question, label, description, value, onChange, minRows, onAdvance, submitRef, onCheck, initialFocus = false, hidePromptLabel = false, replaceOnMatch = false, initiallyMatched = false, share }: {
  question: PracticeQuestion; label: string; description?: ReactNode; value: string; onChange: (value: string) => void; minRows: number;
  onAdvance?: () => void; submitRef?: AnswerSubmit; onCheck?: (answer: string) => void; initialFocus?: boolean; hidePromptLabel?: boolean; replaceOnMatch?: boolean; initiallyMatched?: boolean; share?: ReactNode;
}) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<Check | null>(null);
  const current = checked?.answer === value; const matched = (current && checked.match && checked.blank === null) || (initiallyMatched && !checked);
  const reference = checked && !checked.match && question.authorsVersion.length ? question.authorsVersion : null;
  // The last answer reported to `onCheck`, so pressing Enter again on an unchanged answer reports nothing.
  const reported = useRef<string | null>(null);
  const report = (answer: string) => { if (reported.current === answer) return; reported.current = answer; onCheck?.(answer); };
  const submit = () => {
    if (!value.trim() || (current && checked.blank === null)) { onAdvance?.(); return; }
    if (!hasAuthorsVersion(question)) { report(value); onAdvance?.(); return; }
    const match = answerMatches(question, value);
    setChecked({ answer: value, match, blank: null });
    report(value);
    if (match) onAdvance?.();
  };
  useEffect(() => {
    if (!submitRef) return;
    submitRef.current = submit;
    return () => { submitRef.current = null; };
  });
  const words = wordOrderWords(question.prompt);
  const blanks = countBlanks(question.prompt); const blankInputs = useRef<(HTMLInputElement | null)[]>([]);
  const parts = blanks > 1 ? splitBlanks(value, blanks) : [];
  // Enter in a blank checks that blank against its own entry and moves to the next blank on a match; a miss keeps focus and shows
  // the reference. An empty blank, an unchanged checked one, or one without an entry moves on. Enter in the last blank checks the item.
  const blankKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (!plainEnter(event)) return;
    event.preventDefault();
    if (index === blanks - 1) { submit(); return; }
    const part = parts[index] ?? ""; const entry = question.authorsVersion[index];
    const next = () => blankInputs.current[index + 1]?.focus();
    if (!part.trim() || !entry || (current && checked.blank === index)) { next(); return; }
    const match = blankMatches(entry, part);
    setChecked({ answer: value, match, blank: index });
    if (match) next();
  };
  return <div className={styles.answerField} data-answer-field>
    <div className={styles.answerRow}>
      <div className={styles.answerBox}>
        {matched && replaceOnMatch
          ? <p className={styles.match} role="status"><span className={styles.matchMark} aria-hidden="true">✓</span>{t("courses.practice.match")}</p>
          : words
            ? <WordOrderField words={words} label={label} hidePromptLabel={hidePromptLabel} description={description} value={value} onChange={onChange} onEnter={submit} matched={matched} initialFocus={initialFocus} />
            : blanks > 1
              ? <fieldset className={`${styles.blanks} ${matched ? styles.matched : ""}`}>
                <legend className={hidePromptLabel ? styles.visuallyHidden : undefined}>{label}</legend>
                {description && <p className={styles.help}>{description}</p>}
                <div className={styles.blankRow}>{parts.map((part, index) => <TextField key={index} ref={(input) => { blankInputs.current[index] = input; }}
                  label={t("discussion.blankNumber", { number: index + 1 })} value={part} data-autofocus={(initialFocus && index === 0) || undefined} maxLength={RESPONSE_ANSWER_MAX} onKeyDown={blankKeyDown(index)}
                  onChange={(event) => { const text = event.currentTarget.value; onChange(joinBlanks(parts.map((entry, current) => current === index ? text : entry))); }} />)}</div>
              </fieldset>
              : <TextAreaField label={hidePromptLabel ? undefined : label} aria-label={label} description={description} value={value} data-autofocus={initialFocus || undefined} maxLength={RESPONSE_ANSWER_MAX} autosize minRows={minRows}
                className={matched ? styles.matched : undefined} onKeyDown={(event) => { if (plainEnter(event)) { event.preventDefault(); submit(); } }} onChange={(event) => onChange(event.currentTarget.value)} />}
      </div>
      {share && !matched && <div className={styles.answerShare}>{share}</div>}
    </div>
    <div aria-live="polite">
      {matched && !replaceOnMatch && <p className={styles.match}><span className={styles.matchMark} aria-hidden="true">✓</span>{t("courses.practice.match")}</p>}
      {reference && <div className={styles.checkReference}>
        <p className={styles.checkReferenceLabel}>{t("courses.practice.reference")}</p>
        <p className={styles.checkReferenceText}><PlainText>{reference.map((entry) => entry ?? "—").join(BLANK_SEPARATOR)}</PlainText></p>
        <p className={styles.help}>{t("courses.practice.checkReferenceHelp")}</p>
      </div>}
    </div>
  </div>;
}

// A "Put in order" question: its words are chips the learner moves into order with the move controls, or with the left and right arrow
// keys on a word. The chips start in the prompt's order and the answer stays empty until one moves, so an untouched question counts as
// unanswered, like an empty typed answer. A saved answer restores its order; one that is not these words in some order falls back to
// the prompt's order and is cleared, so it cannot count as an answer. Enter anywhere in the row checks the current order.
function WordOrderField({ words, label, hidePromptLabel, description, value, onChange, onEnter, matched, initialFocus }: {
  words: string[]; label: string; hidePromptLabel: boolean; description?: ReactNode; value: string; onChange: (value: string) => void; onEnter: () => void; matched: boolean; initialFocus: boolean;
}) {
  const { t } = useTranslation();
  const [order, setOrder] = useState(() => (value && wordOrderFromAnswer(words, value)) || words);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const dragged = useRef<number | null>(null);
  // The chip that keeps focus after a move, focused once the moved order has rendered.
  const focusIndex = useRef<number | null>(null);
  useEffect(() => { if (value && !wordOrderFromAnswer(words, value)) onChange(""); }, []);
  useEffect(() => {
    if (focusIndex.current === null) return;
    chips.current[focusIndex.current]?.focus();
    focusIndex.current = null;
  });
  const move = (index: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[index], next[to]] = [next[to]!, next[index]!];
    setOrder(next); onChange(joinWordOrder(next)); focusIndex.current = to;
  };
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    const next = [...order];
    const [word] = next.splice(from, 1);
    next.splice(to, 0, word!);
    setOrder(next); onChange(joinWordOrder(next)); focusIndex.current = to;
  };
  return <fieldset className={`${styles.blanks} ${matched ? styles.matched : ""}`} onKeyDown={(event) => { if (plainEnter(event)) { event.preventDefault(); onEnter(); } }}>
    <legend className={hidePromptLabel ? styles.visuallyHidden : undefined}>{label}</legend>
    {description && <p className={styles.help}>{description}</p>}
    <p className={styles.help}>{t("courses.practice.wordOrderHelp")}</p>
    <ol className={styles.words}>
      {order.map((word, index) => <li key={index} className={styles.word}>
        <button type="button" ref={(node) => { chips.current[index] = node; }} data-word-chip data-autofocus={(initialFocus && index === 0) || undefined} className={styles.chip} draggable
          onDragStart={(event) => { dragged.current = index; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", word); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={(event) => { event.preventDefault(); if (dragged.current !== null) moveTo(dragged.current, index); dragged.current = null; }}
          onDragEnd={() => { dragged.current = null; }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); move(index, index - 1); }
            if (event.key === "ArrowRight") { event.preventDefault(); move(index, index + 1); }
          }}>{word}</button>
        <IconButton tone="quiet" label={t("courses.practice.moveWordEarlier", { word })} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowLeft aria-hidden="true" /></IconButton>
        <IconButton tone="quiet" label={t("courses.practice.moveWordLater", { word })} disabled={index === order.length - 1} onClick={() => move(index, index + 1)}><ArrowRight aria-hidden="true" /></IconButton>
      </li>)}
    </ol>
  </fieldset>;
}

// Learners see the instruction, optional passage, and prompts, never the authors' versions.
// The answer dialog leaves the prompts out, because the answer set labels each field with its prompt.
export function PracticeContent({ block, prompts = true }: { block: Practice; prompts?: boolean }) {
  const { t } = useTranslation();
  const { payload } = block;
  return <div className={styles.practice}>
    <p className={styles.eyebrow}>{t("courses.practice.label")}</p>
    <p className={styles.instruction}><PlainText>{payload.instruction}</PlainText></p>
    {payload.passage && <PracticePassage passage={payload.passage} />}
    {prompts && <ol className={styles.prompts}>{payload.items.map((item, index) => <li key={index}><PlainText>{item.prompt}</PlainText></li>)}</ol>}
  </div>;
}

// A reading passage, shown above its answer set. Neither it nor its questions can be shared (docs/lesson-shares.md).
function PracticePassage({ passage }: { passage: NonNullable<LearnerPracticePayload["passage"]> }) {
  const { t } = useTranslation();
  return <article className={styles.passage} aria-label={passage.title ?? t("courses.practice.passage")}>
    {passage.title && <h4>{passage.title}</h4>}
    <p><PlainText>{passage.content}</PlainText></p>
  </article>;
}

// The lesson page lists at most this many prompts of a practice; the answers show them all.
export const SUMMARY_PROMPTS = 3;

// The viewer's own state: done once their saved count reaches the current number of questions, otherwise what is left.
export function ownStatus(practice: Practice) {
  const total = practice.payload.items.length;
  return { done: (practice.progress.answered ?? 0) >= total, left: Math.max(total - (practice.progress.answered ?? 0), 0) };
}

// A practice on the lesson page: its instruction and first prompts, and an Answer button that opens and closes the answer set in place,
// below the prompts. There is no dialog: the answers open
// in the reading column, and on the lesson page they appear one question at a time (`staged`).
// `step` shows it inside the practice stepper, which supplies the card and the Practice label.
export function PracticeSummary({ scope, block, published, archived = false, step = false }: {
  scope: PracticeScope; block: Practice; published: boolean; archived?: boolean; step?: boolean;
}) {
  const { t } = useTranslation(); const [answering, setAnswering] = useState(false);
  const saveProgress = usePracticeProgress(scope, published);
  const toggle = useId(); const panel = useId();
  const { payload } = block; const more = payload.items.length - SUMMARY_PROMPTS;
  const draftKey = practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id);
  const [savedAnswers] = useState(() => readAnswers(draftKey, payload.items.length));
  const [acceptedQuestions, setAcceptedQuestions] = useState(() => {
    return payload.items.map((item, index) => hasAuthorsVersion(item) && answerMatches(item, savedAnswers[index] ?? ""));
  });
  const [activeQuestion, setActiveQuestion] = useState(() => Math.max(0, revealedThrough(payload.items, savedAnswers) - 1));
  // Closing saves progress and restores focus after the Answer button remounts.
  const close = () => { saveProgress(block); setAnswering(false); requestAnimationFrame(() => document.getElementById(toggle)?.focus()); };
  // Leaving the practice while its answers are open, such as moving to another step of the stepper, saves them like closing does.
  const latest = useRef({ answering, block, saveProgress });
  useEffect(() => { latest.current = { answering, block, saveProgress }; });
  useEffect(() => () => { const last = latest.current; if (last.answering) last.saveProgress(last.block); }, []);
  return <div className={step ? `${styles.summary} ${styles.step}` : `${styles.practice} ${styles.summary}`}>
    {!step && <p className={styles.summaryHeader}><span className={styles.eyebrow}>{t("courses.practice.label")}</span></p>}
    <p className={styles.instruction}><PlainText>{payload.instruction}</PlainText></p>
    <div className={styles.summaryBody}>
      <div className={styles.summaryPrompts}>
        <ol className={styles.summaryList}>{payload.items.slice(0, answering ? payload.items.length : SUMMARY_PROMPTS).map((item, index) => {
          const accepted = acceptedQuestions[index] ?? false;
          const active = index === activeQuestion && !accepted;
          return <li key={index} className={active ? styles.summaryActive : accepted ? styles.summaryAccepted : undefined}>
            <PlainText>{item.prompt}</PlainText>{accepted && <span className={styles.summaryCheck} aria-label={t("courses.practice.match")}>✓</span>}
          </li>;
        })}</ol>
        {!answering && more > 0 && <p className={styles.help}>{t("courses.practice.morePrompts", { count: more })}</p>}
      </div>
      {!answering && <Button id={toggle} className={styles.summaryAnswer} aria-expanded={false} aria-controls={panel}
        onClick={() => setAnswering(true)}>{t("courses.practice.answer")}</Button>}
    </div>
    {answering && <section id={panel} aria-label={t("courses.practice.dialogTitle")} className={styles.expansion}
      onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <PracticePosition current={activeQuestion + 1} total={payload.items.length} labelBelow />
      {payload.passage && <PracticePassage passage={payload.passage} />}
      <AnswerSetComposer staged scope={scope} block={block} recordAttempts={published && !archived} timed={published} onDone={close} onActiveChange={setActiveQuestion}
        onAcceptanceChange={(index, accepted) => setAcceptedQuestions((current) => current.map((value, currentIndex) => currentIndex === index ? accepted : value))} />
    </section>}
  </div>;
}

// How many questions show when an answer set opens: through the first one whose saved answer is not matched yet (see
// `AnswerSetComposer`), or all of them when every one is matched.
const matchedAnswer = (question: PracticeQuestion, answer: string) => hasAuthorsVersion(question) ? answerMatches(question, answer) : answer.trim() !== "";
function revealedThrough(questions: readonly PracticeQuestion[], answers: readonly string[]) {
  const open = questions.findIndex((question, index) => !matchedAnswer(question, answers[index] ?? ""));
  return open < 0 ? questions.length : open + 1;
}

// The answers stay in the local draft so the learner can come back and change them. Done (or Finish later, while some questions are
// blank) closes the answers, which saves the answered count. The set opens focused on its first unanswered question (on the first
// unmatched one when answers are saved), and a matching answer (or Enter where there is nothing to check) moves focus to the next question's field, and from the last question to
// Done. With `staged` only the questions up to the first unmatched one show, and moving on reveals the next question before it is
// focused. A saved answer counts as matched when it matches the author's version; an item with nothing to check counts once it has
// an answer. The position bar follows the focused question. With `recordAttempts` (a published practice outside an archived course)
// each answer check is recorded as a practice attempt. With `timed` (a published practice) the open answer set runs the practice's
// learning time clock (C15).
export function AnswerSetComposer({ scope, block, recordAttempts = false, timed = false, staged = false, onDone, onActiveChange, onAcceptanceChange }: {
  scope: PracticeScope; block: Practice; recordAttempts?: boolean; timed?: boolean; staged?: boolean; onDone: () => void;
  onActiveChange?: (index: number) => void; onAcceptanceChange?: (index: number, accepted: boolean) => void;
}) {
  const { t } = useTranslation();
  useLearningClaim(timed ? { groupId: scope.groupId, target: () => ({ activity: "practice", courseId: scope.courseId, lessonId: scope.lessonId, practiceId: block.id }) } : null);
  const recordAttempt = usePracticeAttempt(scope, recordAttempts);
  const key = practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id);
  const questions = block.payload.items;
  const [answers, setAnswers] = useState(() => readAnswers(key, questions.length));
  const [restoredAnswers] = useState(() => readAnswers(key, questions.length));
  useEffect(() => storeAnswers(key, answers), [answers, key]);
  const [revealed, setRevealed] = useState(() => staged ? revealedThrough(questions, answers) : questions.length);
  const shown = staged ? revealed : questions.length;
  const [active, setActive] = useState(() => {
    if (staged) return revealed - 1;
    const blank = answers.findIndex((answer) => !answer.trim()); return blank < 0 ? questions.length - 1 : blank;
  });
  const [matchedItems, setMatchedItems] = useState<Set<number>>(() => new Set());
  const [skippedItems, setSkippedItems] = useState<Set<number>>(() => new Set());
  const form = useRef<HTMLFormElement>(null);
  const passageNote = useId();
  const focusQuestion = (index: number) => {
    const field = form.current?.querySelector<HTMLElement>(`[data-question-index="${index}"] [data-answer-field]`)?.querySelector<HTMLElement>("textarea, input, [data-word-chip]");
    (field ?? form.current?.querySelector<HTMLElement>("button[type=submit]"))?.focus();
  };
  // Moving on focuses the next question once it has rendered, so a staged question is revealed first.
  const [focusRequest, setFocusRequest] = useState<{ index: number } | null>(null);
  useLayoutEffect(() => { if (focusRequest) focusQuestion(focusRequest.index); }, [focusRequest]);
  const hasAdvanced = useRef(false);
  const advance = (index: number) => {
    hasAdvanced.current = true;
    if (staged) setRevealed((count) => Math.max(count, Math.min(index + 2, questions.length)));
    const next = Math.min(index + 1, questions.length - 1);
    setActive(next); onActiveChange?.(next);
    setFocusRequest({ index: index + 1 });
  };
  const skip = (index: number) => {
    setSkippedItems((current) => new Set(current).add(index));
    advance(index);
  };
  // A centred dialog's focus trap focuses the `initialFocus` field; without a trap, the field is focused here.
  const [initial] = useState(active);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (!hasAdvanced.current && document.activeElement === document.body) focusQuestion(initial); });
    return () => cancelAnimationFrame(frame);
  }, [initial]);
  const onFocus = (event: FocusEvent<HTMLFormElement>) => {
    const field = event.target.closest<HTMLElement>("[data-question-index]");
    const index = field ? Number(field.dataset.questionIndex) : -1;
    if (index >= 0) {
      setActive(index);
      onActiveChange?.(index);
      setSkippedItems((current) => { if (!current.has(index)) return current; const next = new Set(current); next.delete(index); return next; });
    }
  };
  const complete = countAnswered(answers) === questions.length;
  const submit = (event: FormEvent) => { event.preventDefault(); onDone(); };
  return <form ref={form} className={styles.composer} onSubmit={submit} onFocus={onFocus} aria-label={t("courses.practice.yourAnswers")}>
    {!staged && <PracticePosition current={active + 1} total={questions.length} />}
    {staged
      ? (() => {
        // A dialogue prompt ("Noor: … / Sofia: …") shows its turns separately; any other prompt stays one heading.
        const prompt = questions[active]?.prompt ?? ""; const turns = dialogueTurns(prompt);
        return turns ? <DialoguePrompt turns={turns} className={styles.activeQuestion} /> : <h4 className={styles.activeQuestion}><PlainText>{prompt}</PlainText></h4>;
      })()
      : <h4>{t("courses.practice.yourAnswers")}</h4>}
    {/* Each question can be shared on its own, except in a reading practice (docs/lesson-shares.md#where-to-share). */}
    {block.payload.passage && <PassageShareNote id={passageNote} />}
    {questions.slice(0, shown).map((question, index) => staged && index !== active ? null : <div key={index} data-question-index={index} className={staged ? `${styles.question} ${styles.reveal}` : styles.question}>
      <AnswerField question={question} label={t("courses.practice.answerLabel", { number: index + 1, prompt: question.prompt })} value={answers[index] ?? ""} minRows={1} initialFocus={index === initial} hidePromptLabel={staged} replaceOnMatch={staged}
        initiallyMatched={staged && hasAuthorsVersion(question) && answerMatches(question, restoredAnswers[index] ?? "")}
        onChange={(text) => {
          const next = answers.map((entry, current) => current === index ? text : entry);
          setAnswers(next);
          onAcceptanceChange?.(index, false);
          setMatchedItems((current) => { if (!current.has(index)) return current; const next = new Set(current); next.delete(index); return next; });
        }} onAdvance={() => advance(index)}
        onCheck={(answer) => {
          const matches = hasAuthorsVersion(question) && answerMatches(question, answer);
          onAcceptanceChange?.(index, matches);
          setMatchedItems((current) => {
            if (current.has(index) === matches) return current;
            const next = new Set(current);
            if (matches) next.add(index); else next.delete(index);
            return next;
          });
          recordAttempt(block.id, index, answer);
        }}
        share={<ShareButton iconOnly piece={questionPiece(block, index)} label={t("lessonShares.shareNamed.question", { number: index + 1 })} describedBy={passageNote} />} />
    </div>)}
    {(!staged || showsEnterHint(questions.length)) && <p className={styles.help}>{!staged && t("courses.practice.blankHelp")}{showsEnterHint(questions.length) && ` ${t("courses.practice.enterHelp")}`}</p>}
    <div className={styles.actions}>{staged && !matchedItems.has(active) && !skippedItems.has(active) && !(hasAuthorsVersion(questions[active]!) && answerMatches(questions[active]!, restoredAnswers[active] ?? "")) && <Button variant="quiet" aria-label={t("tutorComponents.skipNamed")} onClick={() => skip(active)}>{t("tutorComponents.skip")}</Button>}
      <Button type="submit">{complete ? t("courses.practice.done") : t("courses.practice.finishLater")}</Button></div>
  </form>;
}
