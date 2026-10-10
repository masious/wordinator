import {
  answerMatches, blankMatches, countBlanks, hasAuthorsVersion, type PracticeProgress, practiceProgressResponseSchema, RESPONSE_ANSWER_MAX, splitPracticePayload, type LearnerPracticePayload,
} from "@wordinator/contracts";
import { readPracticeBlock, type LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { useQueryClient } from "@tanstack/react-query";
import { type FocusEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, lessonQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { AdaptiveDialog, Button, TextAreaField, TextField } from "../../ui";
import styles from "./PracticeBlock.module.css";

// A practice as readers see it: its block ID, the prompts with the authors' versions the answer check needs (never rendered before
// a check misses), and who has answered how much of it.
export type Practice = { id: string; payload: LearnerPracticePayload; progress: PracticeProgress };
const NO_PROGRESS: PracticeProgress = { done: 0, started: 0, answered: null };
export const practiceFromBlock = (block: LessonBlockOf<"practice">, progress: Record<string, PracticeProgress>): Practice => ({
  id: block.id, payload: splitPracticePayload(readPracticeBlock(block)).payload, progress: progress[block.id] ?? NO_PROGRESS,
});
export type PracticeScope = { groupId: string; courseId: string; lessonId: string; accountId: string };
type AnswerDraft = { version: 1; answers: string[] };

// Answer drafts follow the shared draft-key rules: account, group, draft kind, and target. They are the only copy of the answers.
export const practiceDraftKey = (accountId: string, groupId: string, kind: "practice-answer", targetId: string) => `wordinator:draft:v1:${accountId}:${groupId}:${kind}:${targetId}`;
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
    void apiRequest(`${path}/progress`, practiceProgressResponseSchema, { method: "PUT", body: JSON.stringify({ answered }) })
      .then(() => queryClient.invalidateQueries({ queryKey: lessonQueryOptions(groupId, courseId, lessonId).queryKey }), () => undefined);
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
export function PracticePosition({ current, total, className }: { current: number; total: number; className?: string }) {
  const { t } = useTranslation();
  return <div className={`${styles.position} ${className ?? ""}`}>
    <p className={styles.positionLabel}>{t("courses.practice.position", { current, total })}</p>
    <ProgressMeter size="compact" value={total ? (current / total) * 100 : 0} label={t("courses.practice.progressLabel")} />
  </div>;
}

// Enter checks the answer on this device against the author's version, with the same matching the contracts define for every
// surface; Shift+Enter keeps a new line. A match is celebrated and calls `onAdvance`, which moves to the next question. A miss
// keeps focus and shows the author's version as a reference, never as a verdict, because a sentence can be translated in several
// ways; it stays while the learner edits, until the next check. Enter on an empty answer, an unchanged checked answer, or an item
// without a complete author's version (nothing to check against) also calls `onAdvance`.
// `submitRef` lets a caller's own Next action check a filled answer before it moves on, exactly as Enter does.
export type AnswerSubmit = RefObject<(() => void) | null>;
type PracticeQuestion = LearnerPracticePayload["items"][number];
// `blank` names the blank a check covered, or null for the whole item.
type Check = { answer: string; match: boolean; blank: number | null };
// `initialFocus` marks the field a dialog's focus trap focuses when it opens.
export function AnswerField({ question, label, description, value, onChange, minRows, onAdvance, submitRef, initialFocus = false }: {
  question: PracticeQuestion; label: string; description?: ReactNode; value: string; onChange: (value: string) => void; minRows: number;
  onAdvance?: () => void; submitRef?: AnswerSubmit; initialFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<Check | null>(null);
  const current = checked?.answer === value; const matched = current && checked.match && checked.blank === null;
  const reference = checked && !checked.match && question.authorsVersion.length ? question.authorsVersion : null;
  const submit = () => {
    if (!value.trim() || (current && checked.blank === null) || !hasAuthorsVersion(question)) { onAdvance?.(); return; }
    const match = answerMatches(question, value);
    setChecked({ answer: value, match, blank: null });
    if (match) onAdvance?.();
  };
  useEffect(() => {
    if (!submitRef) return;
    submitRef.current = submit;
    return () => { submitRef.current = null; };
  });
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
    {blanks > 1
      ? <fieldset className={`${styles.blanks} ${matched ? styles.matched : ""}`}>
        <legend>{label}</legend>
        {description && <p className={styles.help}>{description}</p>}
        <div className={styles.blankRow}>{parts.map((part, index) => <TextField key={index} ref={(input) => { blankInputs.current[index] = input; }}
          label={t("discussion.blankNumber", { number: index + 1 })} value={part} data-autofocus={(initialFocus && index === 0) || undefined} maxLength={RESPONSE_ANSWER_MAX} onKeyDown={blankKeyDown(index)}
          onChange={(event) => { const text = event.currentTarget.value; onChange(joinBlanks(parts.map((entry, current) => current === index ? text : entry))); }} />)}</div>
      </fieldset>
      : <TextAreaField label={label} description={description} value={value} data-autofocus={initialFocus || undefined} maxLength={RESPONSE_ANSWER_MAX} autosize minRows={minRows}
        className={matched ? styles.matched : undefined} onKeyDown={(event) => { if (plainEnter(event)) { event.preventDefault(); submit(); } }} onChange={(event) => onChange(event.currentTarget.value)} />}
    <div aria-live="polite">
      {matched && <p className={styles.match}><span className={styles.matchMark} aria-hidden="true">✓</span>{t("courses.practice.match")}</p>}
      {reference && <div className={styles.checkReference}>
        <p className={styles.checkReferenceLabel}>{t("courses.practice.reference")}</p>
        <p className={styles.checkReferenceText}><PlainText>{reference.map((entry) => entry ?? "—").join(BLANK_SEPARATOR)}</PlainText></p>
        <p className={styles.help}>{t("courses.practice.checkReferenceHelp")}</p>
      </div>}
    </div>
  </div>;
}

// Learners see the instruction, optional passage, and prompts, never the authors' versions.
// The answer dialog leaves the prompts out, because the answer set labels each field with its prompt.
export function PracticeContent({ block, prompts = true }: { block: Practice; prompts?: boolean }) {
  const { t } = useTranslation();
  const { payload } = block;
  return <div className={styles.practice}>
    <p className={styles.eyebrow}>{t("courses.practice.label")}</p>
    <p className={styles.instruction}><PlainText>{payload.instruction}</PlainText></p>
    {payload.passage && <article className={styles.passage} aria-label={payload.passage.title ?? t("courses.practice.passage")}>
      {payload.passage.title && <h4>{payload.passage.title}</h4>}
      <p><PlainText>{payload.passage.content}</PlainText></p>
    </article>}
    {prompts && <ol className={styles.prompts}>{payload.items.map((item, index) => <li key={index}><PlainText>{item.prompt}</PlainText></li>)}</ol>}
  </div>;
}

// The lesson page lists at most this many prompts of a practice; the answer dialog shows them all.
export const SUMMARY_PROMPTS = 3;

// The viewer's own state: done once their saved count reaches the current number of questions, otherwise what is left.
function ownStatus(practice: Practice) {
  const total = practice.payload.items.length;
  return { done: (practice.progress.answered ?? 0) >= total, left: Math.max(total - (practice.progress.answered ?? 0), 0) };
}

// A practice on the lesson page: its instruction and first prompts, how many people are done and how many questions the viewer has
// left, and an Answer action that opens the answer set and any reading passage in a dialog. `dock` keeps the dialog over the
// reading column so the lesson's New words panel stays usable beside it.
export function PracticeSummary({ scope, block, published, dock }: { scope: PracticeScope; block: Practice; published: boolean; dock?: RefObject<HTMLElement | null> }) {
  const { t } = useTranslation(); const [answering, setAnswering] = useState(false);
  const saveProgress = usePracticeProgress(scope, published);
  const { payload } = block; const more = payload.items.length - SUMMARY_PROMPTS; const own = ownStatus(block);
  // Closing the dialog in any way saves progress, exactly like its own button.
  const close = () => { saveProgress(block); setAnswering(false); };
  return <div className={`${styles.practice} ${styles.summary}`}>
    <p className={styles.summaryHeader}>
      <span className={styles.eyebrow}>{t("courses.practice.label")}</span>
      <span className={styles.summaryStatus}>
        {t("courses.practice.peopleDone", { count: block.progress.done })}
        {" · "}
        {own.done ? <span className={styles.ownDone}>{t("courses.practice.youAreDone")}</span> : t("courses.practice.questionsLeft", { count: own.left })}
      </span>
    </p>
    <p className={styles.instruction}><PlainText>{payload.instruction}</PlainText></p>
    <div className={styles.summaryBody}>
      <div className={styles.summaryPrompts}>
        <ol className={styles.summaryList}>{payload.items.slice(0, SUMMARY_PROMPTS).map((item, index) => <li key={index}><PlainText>{item.prompt}</PlainText></li>)}</ol>
        {more > 0 && <p className={styles.help}>{t("courses.practice.morePrompts", { count: more })}</p>}
      </div>
      <Button className={styles.summaryAnswer} onClick={() => setAnswering(true)}>{t("courses.practice.answer")}</Button>
    </div>
    <AdaptiveDialog opened={answering} onClose={close} title={t("courses.practice.dialogTitle")} dock={dock}>
      {answering && <div className={styles.dialogBody}>
        <PracticeContent block={block} prompts={false} />
        <AnswerSetComposer scope={scope} block={block} onDone={close} />
      </div>}
    </AdaptiveDialog>
  </div>;
}

// The answers stay in the local draft so the learner can come back and change them. Done (or Finish later, while some questions are
// blank) closes the dialog, which saves the answered count. The dialog opens on the first unanswered question; a matching answer
// (or Enter where there is nothing to check) moves focus to the next question's field, and from the last question to Done.
// The position bar follows the focused question and stays below the dialog's header while the answer set scrolls.
export function AnswerSetComposer({ scope, block, onDone }: { scope: PracticeScope; block: Practice; onDone: () => void }) {
  const { t } = useTranslation();
  const key = practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id);
  const questions = block.payload.items;
  const [answers, setAnswers] = useState(() => readAnswers(key, questions.length));
  useEffect(() => storeAnswers(key, answers), [answers, key]);
  const [active, setActive] = useState(() => { const blank = answers.findIndex((answer) => !answer.trim()); return blank < 0 ? questions.length - 1 : blank; });
  const form = useRef<HTMLFormElement>(null); const position = useRef<HTMLDivElement>(null);
  const focusQuestion = (index: number) => {
    const field = form.current?.querySelectorAll("[data-answer-field]")[index]?.querySelector<HTMLElement>("textarea, input");
    (field ?? form.current?.querySelector<HTMLElement>("button[type=submit]"))?.focus();
  };
  // A centred dialog's focus trap focuses the `initialFocus` field; a docked dialog has no trap, so the field is focused here.
  const [initial] = useState(active);
  useEffect(() => { const frame = requestAnimationFrame(() => focusQuestion(initial)); return () => cancelAnimationFrame(frame); }, [initial]);
  // The dialog's own header is sticky too, so the bar sticks just below it.
  useLayoutEffect(() => {
    const bar = position.current; const header = bar?.closest(".mantine-Modal-content")?.querySelector<HTMLElement>(".mantine-Modal-header");
    if (!bar || !header) return;
    const place = () => bar.style.setProperty("--practice-position-top", `${header.offsetHeight}px`);
    place();
    const observer = new ResizeObserver(place); observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const onFocus = (event: FocusEvent<HTMLFormElement>) => {
    const field = event.target.closest("[data-answer-field]");
    const index = field ? [...(form.current?.querySelectorAll("[data-answer-field]") ?? [])].indexOf(field) : -1;
    if (index >= 0) setActive(index);
  };
  const complete = countAnswered(answers) === questions.length;
  const submit = (event: FormEvent) => { event.preventDefault(); onDone(); };
  return <form ref={form} className={styles.composer} onSubmit={submit} onFocus={onFocus} aria-label={t("courses.practice.yourAnswers")}>
    <div ref={position} className={styles.stickyPosition}><PracticePosition current={active + 1} total={questions.length} /></div>
    <h4>{t("courses.practice.yourAnswers")}</h4>
    {questions.map((question, index) => <AnswerField key={index} question={question} label={t("courses.practice.answerLabel", { number: index + 1, prompt: question.prompt })} value={answers[index] ?? ""} minRows={1} initialFocus={index === initial}
      onChange={(text) => setAnswers((value) => value.map((entry, current) => current === index ? text : entry))} onAdvance={() => focusQuestion(index + 1)} />)}
    <p className={styles.help}>{t("courses.practice.blankHelp")} {t("courses.practice.enterHelp")}</p>
    <div className={styles.actions}><Button type="submit">{complete ? t("courses.practice.done") : t("courses.practice.finishLater")}</Button></div>
  </form>;
}
