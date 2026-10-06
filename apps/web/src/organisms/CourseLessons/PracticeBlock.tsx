import { COMMENT_BODY_MAX, commentResponseSchema, okResponseSchema, RESPONSE_ANSWER_MAX, type CourseBlock, type DiscussionItem, type PracticeReference } from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, lessonQueryOptions, practiceDiscussionQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { Avatar, Button, EmptyState, ErrorState, LabelChip, LoadingState, TextAreaField } from "../../ui";
import ReactionBar from "../ReactionBar/ReactionBar";
import { CourseErrorMessage } from "./CourseErrorMessage";
import styles from "./PracticeBlock.module.css";

type Practice = Extract<CourseBlock, { kind: "practice" }>;
export type PracticeScope = { groupId: string; courseId: string; lessonId: string; accountId: string };
type AnswerDraft = { version: 1; answers: string[] };

// Answer and reply drafts follow the shared draft-key rules: account, group, draft kind, and target.
export const practiceDraftKey = (accountId: string, groupId: string, kind: "practice-answer" | "reply", targetId: string) => `wordinator:draft:v1:${accountId}:${groupId}:${kind}:${targetId}`;
function readAnswers(key: string, count: number): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as AnswerDraft | null;
    if (value?.version === 1 && Array.isArray(value.answers)) return Array.from({ length: count }, (_, index) => String(value.answers[index] ?? ""));
  } catch { /* discard incompatible local data */ }
  return Array.from({ length: count }, () => "");
}
function useStoredText(key: string) {
  const [value, setValue] = useState(() => { try { return localStorage.getItem(key) ?? ""; } catch { return ""; } });
  useEffect(() => { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); }, [key, value]);
  return [value, setValue] as const;
}

const blockPath = (scope: PracticeScope, blockId: string) => `/api/groups/${encodeURIComponent(scope.groupId)}/courses/${encodeURIComponent(scope.courseId)}/lessons/${encodeURIComponent(scope.lessonId)}/blocks/${encodeURIComponent(blockId)}`;

// Learners see the instruction, optional passage, and prompts. Authors' versions arrive only with the revealed thread.
export function PracticeContent({ block }: { block: Practice }) {
  const { t } = useTranslation();
  const { payload } = block;
  return <div className={styles.practice}>
    <p className={styles.eyebrow}>{t("courses.practice.label")}</p>
    <p className={styles.instruction}><PlainText>{payload.instruction}</PlainText></p>
    {payload.passage && <article className={styles.passage} aria-label={payload.passage.title ?? t("courses.practice.passage")}>
      {payload.passage.title && <h4>{payload.passage.title}</h4>}
      <p><PlainText>{payload.passage.content}</PlainText></p>
    </article>}
    <ol className={styles.prompts}>{payload.items.map((item, index) => <li key={index}><PlainText>{item.prompt}</PlainText></li>)}</ol>
  </div>;
}

function AnswerSetComposer({ scope, block, onDone }: { scope: PracticeScope; block: Practice; onDone: () => void }) {
  const { t } = useTranslation();
  const key = practiceDraftKey(scope.accountId, scope.groupId, "practice-answer", block.id);
  const prompts = block.payload.items.map((item) => item.prompt);
  const [answers, setAnswers] = useState(() => readAnswers(key, prompts.length));
  useEffect(() => {
    if (answers.some(Boolean)) localStorage.setItem(key, JSON.stringify({ version: 1, answers } satisfies AnswerDraft));
    else localStorage.removeItem(key);
  }, [answers, key]);
  const publish = useMutation({
    mutationFn: () => apiRequest(`${blockPath(scope, block.id)}/comments`, commentResponseSchema, { method: "POST", body: JSON.stringify({ kind: "practice_response", answers }) }),
    onSuccess: () => { localStorage.removeItem(key); setAnswers(prompts.map(() => "")); onDone(); },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); publish.mutate(); };
  return <form className={styles.composer} onSubmit={submit} aria-label={t("courses.practice.yourAnswers")}>
    <h4>{t("courses.practice.yourAnswers")}</h4>
    {prompts.map((prompt, index) => <TextAreaField key={index} label={t("courses.practice.answerLabel", { number: index + 1, prompt })} value={answers[index]} maxLength={RESPONSE_ANSWER_MAX} autosize minRows={1}
      onChange={(event) => { const text = event.currentTarget.value; setAnswers((value) => value.map((entry, current) => current === index ? text : entry)); }} />)}
    <p className={styles.help}>{t("courses.practice.blankHelp")}</p>
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
