import {
  COMMENT_BODY_MAX, commentResponseSchema, countBlanks, okResponseSchema, practiceCheckResponseSchema, type PracticeCheckResponse, RESPONSE_ANSWER_MAX, splitPracticePayload, type DiscussionItem, type LearnerPracticePayload, type PracticeReference,
} from "@wordinator/contracts";
import { readPracticeBlock, type LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, lessonQueryOptions, practiceDiscussionQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { AdaptiveDialog, Avatar, Button, EmptyState, ErrorState, LabelChip, LoadingState, TextAreaField, TextField } from "../../ui";
import ReactionBar from "../ReactionBar/ReactionBar";
import { CourseErrorMessage } from "./CourseErrorMessage";
import styles from "./PracticeBlock.module.css";

// A practice as readers see it: its block ID (the thread target), the prompts without authors' versions, and the answer count.
export type Practice = { id: string; payload: LearnerPracticePayload; answerCount: number };
export const practiceFromBlock = (block: LessonBlockOf<"practice">, answerCounts: Record<string, number>): Practice => ({
  id: block.id, payload: splitPracticePayload(readPracticeBlock(block)).payload, answerCount: answerCounts[block.id] ?? 0,
});
export type PracticeScope = { groupId: string; courseId: string; lessonId: string; accountId: string };
type AnswerDraft = { version: 1; answers: string[] };

// Answer and reply drafts follow the shared draft-key rules: account, group, draft kind, and target.
export const practiceDraftKey = (accountId: string, groupId: string, kind: "practice-answer" | "reply", targetId: string) => `wordinator:draft:v1:${accountId}:${groupId}:${kind}:${targetId}`;
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
function useStoredText(key: string) {
  const [value, setValue] = useState(() => { try { return localStorage.getItem(key) ?? ""; } catch { return ""; } });
  useEffect(() => { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); }, [key, value]);
  return [value, setValue] as const;
}

export const blockPath = (scope: PracticeScope, blockId: string) => `/api/groups/${encodeURIComponent(scope.groupId)}/courses/${encodeURIComponent(scope.courseId)}/lessons/${encodeURIComponent(scope.lessonId)}/blocks/${encodeURIComponent(blockId)}`;

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

// Learners see the instruction, optional passage, and prompts. Authors' versions arrive only with the revealed thread.
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

// A practice on the lesson page: its instruction and first prompts, and an Answer action that opens the answer set, the
// concealed thread, and any reading passage in a dialog.
export function PracticeSummary({ scope, block }: { scope: PracticeScope; block: Practice }) {
  const { t } = useTranslation(); const [answering, setAnswering] = useState(false);
  const { payload } = block; const more = payload.items.length - SUMMARY_PROMPTS;
  return <div className={`${styles.practice} ${styles.summary}`}>
    <p className={styles.summaryHeader}>
      <span className={styles.eyebrow}>{t("courses.practice.label")}</span>
      <span className={styles.summaryStatus}>{t("courses.practice.answerCount", { count: block.answerCount })}</span>
    </p>
    <p className={styles.instruction}><PlainText>{payload.instruction}</PlainText></p>
    <div className={styles.summaryBody}>
      <div className={styles.summaryPrompts}>
        <ol className={styles.summaryList}>{payload.items.slice(0, SUMMARY_PROMPTS).map((item, index) => <li key={index}><PlainText>{item.prompt}</PlainText></li>)}</ol>
        {more > 0 && <p className={styles.help}>{t("courses.practice.morePrompts", { count: more })}</p>}
      </div>
      <Button className={styles.summaryAnswer} onClick={() => setAnswering(true)}>{t("courses.practice.answer")}</Button>
    </div>
    <AdaptiveDialog opened={answering} onClose={() => setAnswering(false)} title={t("courses.practice.dialogTitle")}>
      {answering && <div className={styles.dialogBody}>
        <PracticeContent block={block} prompts={false} />
        <PracticeThread scope={scope} block={block} />
      </div>}
    </AdaptiveDialog>
  </div>;
}

function AnswerSetComposer({ scope, block, onDone }: { scope: PracticeScope; block: Practice; onDone: () => void }) {
  const { t } = useTranslation();
  const key = practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id);
  const prompts = block.payload.items.map((item) => item.prompt);
  const [answers, setAnswers] = useState(() => readAnswers(key, prompts.length));
  useEffect(() => storeAnswers(key, answers), [answers, key]);
  const publish = useMutation({
    mutationFn: () => apiRequest(`${blockPath(scope, block.id)}/comments`, commentResponseSchema, { method: "POST", body: JSON.stringify({ kind: "practice_response", answers }) }),
    onSuccess: () => { localStorage.removeItem(key); setAnswers(prompts.map(() => "")); onDone(); },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); publish.mutate(); };
  return <form className={styles.composer} onSubmit={submit} aria-label={t("courses.practice.yourAnswers")}>
    <h4>{t("courses.practice.yourAnswers")}</h4>
    {prompts.map((prompt, index) => <AnswerField key={index} scope={scope} blockId={block.id} item={index} prompt={prompt} label={t("courses.practice.answerLabel", { number: index + 1, prompt })} value={answers[index] ?? ""} minRows={1}
      onChange={(text) => setAnswers((value) => value.map((entry, current) => current === index ? text : entry))} />)}
    <p className={styles.help}>{t("courses.practice.blankHelp")} {t("courses.practice.enterHelp")}</p>
    <CourseErrorMessage error={publish.error} />
    <div className={styles.actions}><Button type="submit" loading={publish.isPending}>{t("courses.practice.publish")}</Button></div>
  </form>;
}

function ReplyComposer({ scope, block, parentId, onDone }: { scope: PracticeScope; block: Practice; parentId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useStoredText(practiceDraftKey(scope.accountId, scope.groupId, "reply", parentId));
  const publish = useMutation({
    mutationFn: () => apiRequest(`${blockPath(scope, block.id)}/comments`, commentResponseSchema, { method: "POST", body: JSON.stringify({ kind: "text", body, parentId }) }),
    onSuccess: () => { setBody(""); onDone(); },
  });
  return <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); publish.mutate(); }}>
    <TextAreaField label={t("discussion.reply")} value={body} maxLength={COMMENT_BODY_MAX} autosize minRows={2} required onChange={(event) => setBody(event.currentTarget.value)} />
    <CourseErrorMessage error={publish.error} />
    <div className={styles.actions}><Button type="submit" loading={publish.isPending} disabled={!body.trim()}>{t("discussion.publishReply")}</Button></div>
  </form>;
}

function EditEntry({ scope, block, item, onDone }: { scope: PracticeScope; block: Practice; item: DiscussionItem; onDone: () => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState(item.body ?? ""); const [answers, setAnswers] = useState(item.responseItems.map((entry) => entry.answer));
  const save = useMutation({
    mutationFn: () => apiRequest(`${blockPath(scope, block.id)}/comments/${encodeURIComponent(item.id)}`, commentResponseSchema, {
      method: "PATCH", body: JSON.stringify(item.kind === "text" ? { kind: "text", body } : { kind: "practice_response", answers }),
    }),
    onSuccess: onDone,
  });
  return <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
    {item.kind === "text"
      ? <TextAreaField label={t("discussion.response")} value={body} maxLength={COMMENT_BODY_MAX} autosize minRows={2} required onChange={(event) => setBody(event.currentTarget.value)} />
      : item.responseItems.map((entry, index) => <TextAreaField key={entry.position} label={t("courses.practice.answerLabel", { number: index + 1, prompt: entry.prompt ?? "" })} value={answers[index]} maxLength={RESPONSE_ANSWER_MAX} autosize minRows={1}
        onChange={(event) => { const text = event.currentTarget.value; setAnswers((value) => value.map((answer, current) => current === index ? text : answer)); }} />)}
    <CourseErrorMessage error={save.error} />
    <div className={styles.actions}><Button variant="quiet" onClick={onDone}>{t("common.cancel")}</Button><Button type="submit" loading={save.isPending}>{t("common.save")}</Button></div>
  </form>;
}

function ThreadEntry({ scope, block, item, quickReactions, refresh, reply = false }: {
  scope: PracticeScope; block: Practice; item: DiscussionItem; quickReactions: string[]; refresh: () => void; reply?: boolean;
}) {
  const { t } = useTranslation(); const [replying, setReplying] = useState(false); const [editing, setEditing] = useState(false);
  const entryPath = `${blockPath(scope, block.id)}/comments/${encodeURIComponent(item.id)}`;
  const remove = useMutation({ mutationFn: () => apiRequest(entryPath, okResponseSchema, { method: "DELETE" }), onSuccess: refresh });
  return <article id={`comment-${item.id}`} className={reply ? styles.reply : styles.entry}>
    <header className={styles.entryHeader}>
      <span className={styles.author}><Avatar name={item.author.displayName} />{item.author.displayName}</span>
      <span className={styles.meta}>{new Date(item.createdAt).toLocaleString()} {item.edited && t("discussion.edited")}</span>
    </header>
    {editing ? <EditEntry scope={scope} block={block} item={item} onDone={() => { setEditing(false); refresh(); }} />
      : item.kind === "text" ? <p className={styles.body}><PlainText>{item.body ?? ""}</PlainText></p>
      : <dl className={styles.answerSet}>{item.responseItems.map((entry) => <div key={entry.position}>
        <dt><PlainText>{entry.prompt ?? ""}</PlainText></dt>
        <dd>{entry.skipped ? <span className={styles.muted}>{t("discussion.noAnswer")}</span> : <PlainText>{entry.answer}</PlainText>}</dd>
      </div>)}</dl>}
    <ReactionBar reactions={item.reactions} quickReactions={quickReactions} path={`${entryPath}/reactions`} onChanged={refresh} />
    <div className={styles.entryActions}>
      {item.permissions.reply && <Button variant="quiet" onClick={() => setReplying((value) => !value)}>{t("discussion.reply")}</Button>}
      {item.permissions.edit && !editing && <Button variant="quiet" onClick={() => setEditing(true)}>{t("common.edit")}</Button>}
      {item.permissions.delete && <Button variant="quiet" loading={remove.isPending} onClick={() => remove.mutate()}>{t("common.delete")}</Button>}
    </div>
    <CourseErrorMessage error={remove.error} />
    {replying && <ReplyComposer scope={scope} block={block} parentId={item.id} onDone={() => { setReplying(false); refresh(); }} />}
    {!!item.replies.length && <div className={styles.replies}>{item.replies.map((child) => <ThreadEntry key={child.id} scope={scope} block={block} item={child} quickReactions={quickReactions} refresh={refresh} reply />)}</div>}
  </article>;
}

// The author's version is a reference for discussion, never a verdict.
function ReferenceList({ reference }: { reference: PracticeReference }) {
  const { t } = useTranslation();
  return <section className={styles.reference} aria-label={t("courses.practice.reference")}>
    <h4>{t("courses.practice.reference")}</h4>
    <p className={styles.help}>{t("courses.practice.referenceHelp")}</p>
    <ol>{reference.items.map((item, index) => <li key={index}>
      <span className={styles.referencePrompt}><PlainText>{item.prompt}</PlainText></span>
      <span>{item.authorsVersion.length ? <PlainText>{item.authorsVersion.map((entry) => entry ?? "—").join(" · ")}</PlainText> : <span className={styles.muted}>{t("courses.practice.noReference")}</span>}</span>
      {item.note && <span className={styles.note}><PlainText>{item.note}</PlainText></span>}
    </li>)}</ol>
  </section>;
}

// Each visit starts concealed. Revealing fetches the thread and the reference; submitting an answer set reveals it too.
export function PracticeThread({ scope, block }: { scope: PracticeScope; block: Practice }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const discussion = useQuery({ ...practiceDiscussionQueryOptions(scope.groupId, scope.courseId, scope.lessonId, block.id), enabled: revealed });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: practiceDiscussionQueryOptions(scope.groupId, scope.courseId, scope.lessonId, block.id).queryKey });
    void queryClient.invalidateQueries({ queryKey: lessonQueryOptions(scope.groupId, scope.courseId, scope.lessonId).queryKey });
  };
  const composer = <AnswerSetComposer scope={scope} block={block} onDone={() => { setRevealed(true); refresh(); }} />;
  if (!revealed) return <section className={styles.concealed} aria-label={t("courses.practice.threadLabel")}>
    <LabelChip>{t("discussion.spoilerLabel")}</LabelChip>
    <h4>{t("discussion.answersHidden", { count: block.answerCount })}</h4>
    <p className={styles.help}>{t("courses.practice.hiddenHelp")}</p>
    {composer}
    <Button variant="secondary" onClick={() => setRevealed(true)}>{t("discussion.reveal")}</Button>
  </section>;
  return <section className={styles.thread} aria-label={t("courses.practice.threadLabel")}>
    <div className={styles.threadHeader}><h4>{t("discussion.answers")}</h4><Button variant="quiet" onClick={() => setRevealed(false)}>{t("discussion.conceal")}</Button></div>
    {discussion.isPending ? <LoadingState label={t("discussion.loading")} />
      : discussion.isError ? <ErrorState title={t("discussion.unavailable")} action={<Button onClick={() => void discussion.refetch()}>{t("common.retry")}</Button>} />
      : <>
        <ReferenceList reference={discussion.data.reference} />
        {composer}
        {discussion.data.items.length
          ? <div className={styles.entries}>{discussion.data.items.map((item) => <ThreadEntry key={item.id} scope={scope} block={block} item={item} quickReactions={discussion.data.quickReactions} refresh={refresh} />)}</div>
          : <EmptyState title={t("discussion.emptyTitle")}>{t("discussion.emptyBody")}</EmptyState>}
      </>}
  </section>;
}
