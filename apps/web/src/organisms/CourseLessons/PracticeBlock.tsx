import {
  countBlanks, practiceCheckResponseSchema, type PracticeCheckResponse, type PracticeProgress, practiceProgressResponseSchema, RESPONSE_ANSWER_MAX, splitPracticePayload, type LearnerPracticePayload,
} from "@wordinator/contracts";
import { readPracticeBlock, type LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, lessonQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { AdaptiveDialog, Button, TextAreaField, TextField } from "../../ui";
import { CourseErrorMessage } from "./CourseErrorMessage";
import styles from "./PracticeBlock.module.css";

// A practice as readers see it: its block ID, the prompts without authors' versions, and who has answered how much of it.
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

// Enter checks the answer against the author's version; Shift+Enter keeps a new line. A match is celebrated; a miss shows the
// author's version as a reference, never as a verdict, because a sentence can be translated in several ways. The reference
// stays while the learner edits, until the next check. Pressing Enter on an empty or unchanged, checked answer calls `onAdvance`.
// `submitRef` lets a caller's own Next action check a filled answer before it moves on, exactly as Enter does.
export type AnswerSubmit = RefObject<(() => void) | null>;
export function AnswerField({ scope, blockId, item, prompt, label, description, value, onChange, minRows, onAdvance, submitRef }: {
  scope: PracticeScope; blockId: string; item: number; prompt: string; label: string; description?: ReactNode; value: string; onChange: (value: string) => void; minRows: number;
  onAdvance?: () => void; submitRef?: AnswerSubmit;
}) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<PracticeCheckResponse & { answer: string } | null>(null);
  const check = useMutation({
    mutationFn: (answer: string) => apiRequest(`${blockPath(scope, blockId)}/check`, practiceCheckResponseSchema, { method: "POST", body: JSON.stringify({ item, answer }) }),
    onSuccess: (data, answer) => setChecked({ ...data, answer }),
  });
  const current = checked?.answer === value; const matched = current && checked.match;
  const reference = checked && !checked.match ? checked.authorsVersion : null;
  const submit = () => {
    if (current || !value.trim()) onAdvance?.();
    else if (!check.isPending) check.mutate(value);
  };
  useEffect(() => {
    if (!submitRef) return;
    submitRef.current = submit;
    return () => { submitRef.current = null; };
  });
  const blanks = countBlanks(prompt); const blankInputs = useRef<(HTMLInputElement | null)[]>([]);
  const parts = blanks > 1 ? splitBlanks(value, blanks) : [];
  // Enter in a blank moves to the next blank; Enter in the last blank checks the whole item.
  const blankKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (!plainEnter(event)) return;
    event.preventDefault();
    if (index < blanks - 1) blankInputs.current[index + 1]?.focus();
    else submit();
  };
  return <div className={styles.answerField}>
    {blanks > 1
      ? <fieldset className={`${styles.blanks} ${matched ? styles.matched : ""}`}>
        <legend>{label}</legend>
        {description && <p className={styles.help}>{description}</p>}
        <div className={styles.blankRow}>{parts.map((part, index) => <TextField key={index} ref={(input) => { blankInputs.current[index] = input; }}
          label={t("discussion.blankNumber", { number: index + 1 })} value={part} maxLength={RESPONSE_ANSWER_MAX} onKeyDown={blankKeyDown(index)}
          onChange={(event) => { const text = event.currentTarget.value; onChange(joinBlanks(parts.map((entry, current) => current === index ? text : entry))); }} />)}</div>
      </fieldset>
      : <TextAreaField label={label} description={description} value={value} maxLength={RESPONSE_ANSWER_MAX} autosize minRows={minRows}
        className={matched ? styles.matched : undefined} onKeyDown={(event) => { if (plainEnter(event)) { event.preventDefault(); submit(); } }} onChange={(event) => onChange(event.currentTarget.value)} />}
    <div aria-live="polite">
      {matched && <p className={styles.match}><span className={styles.matchMark} aria-hidden="true">✓</span>{t("courses.practice.match")}</p>}
      {reference && <div className={styles.checkReference}>
        <p className={styles.checkReferenceLabel}>{t("courses.practice.reference")}</p>
        <p className={styles.checkReferenceText}><PlainText>{reference.map((entry) => entry ?? "—").join(BLANK_SEPARATOR)}</PlainText></p>
        <p className={styles.help}>{t("courses.practice.checkReferenceHelp")}</p>
      </div>}
    </div>
    <CourseErrorMessage error={check.error} />
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
// blank) closes the dialog, which saves the answered count.
function AnswerSetComposer({ scope, block, onDone }: { scope: PracticeScope; block: Practice; onDone: () => void }) {
  const { t } = useTranslation();
  const key = practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id);
  const prompts = block.payload.items.map((item) => item.prompt);
  const [answers, setAnswers] = useState(() => readAnswers(key, prompts.length));
  useEffect(() => storeAnswers(key, answers), [answers, key]);
  const complete = countAnswered(answers) === prompts.length;
  const submit = (event: FormEvent) => { event.preventDefault(); onDone(); };
  return <form className={styles.composer} onSubmit={submit} aria-label={t("courses.practice.yourAnswers")}>
    <h4>{t("courses.practice.yourAnswers")}</h4>
    {prompts.map((prompt, index) => <AnswerField key={index} scope={scope} blockId={block.id} item={index} prompt={prompt} label={t("courses.practice.answerLabel", { number: index + 1, prompt })} value={answers[index] ?? ""} minRows={1}
      onChange={(text) => setAnswers((value) => value.map((entry, current) => current === index ? text : entry))} />)}
    <p className={styles.help}>{t("courses.practice.blankHelp")} {t("courses.practice.enterHelp")}</p>
    <div className={styles.actions}><Button type="submit">{complete ? t("courses.practice.done") : t("courses.practice.finishLater")}</Button></div>
  </form>;
}
