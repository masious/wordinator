import { commentResponseSchema, okResponseSchema, pinRequestSchema, type DiscussionItem, type Post, type SessionResponse } from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, discussionQueryOptions } from "../api";
import { Avatar, Button, EmptyState, ErrorState, LabelChip, LoadingState, TextAreaField, TextField } from "../ui";
import styles from "./PhaseFourPages.module.css";
import ReactionBar from "../organisms/PostCard/ReactionBar";

type SignedInSession = Extract<SessionResponse, { status: "signedIn" }>;
type AnswerKind = "text" | "reading_response" | "fill_response";
type Draft = { version: 1; kind: AnswerKind; body: string; answers: string[]; step: number };

export const discussionDraftKey = (accountId: string, groupId: string, kind: string, targetId: string) => `wordinator:draft:v1:${accountId}:${groupId}:${kind}:${targetId}`;
function readDraft(key: string, kind: AnswerKind, count: number): Draft {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Draft | null;
    if (value?.version === 1 && value.kind === kind) return { ...value, answers: Array.from({ length: count }, (_, index) => value.answers[index] ?? "") };
  } catch { /* discard incompatible local data */ }
  return { version: 1, kind, body: "", answers: Array.from({ length: count }, () => ""), step: 0 };
}
function PlainText({ children }: { children: string }) {
  return <>{children.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a> : part)}</>;
}

function ResponseComposer({ post, groupId, session, parentId, onDone }: { post: Post; groupId: string; session: SignedInSession; parentId?: string; onDone: () => void }) {
  const { t } = useTranslation();
  const kind: AnswerKind = parentId || post.type === "shared_sentence" || post.type === "question" ? "text" : post.type === "reading" ? "reading_response" : "fill_response";
  const prompts = kind === "reading_response" ? post.questions.map((question) => question.text) : kind === "fill_response" ? Array.from({ length: [...post.body].filter((character) => character === "…").length }, (_, index) => t("discussion.blankNumber", { number: index + 1 })) : [];
  const draftKind = parentId ? "reply" : kind === "text" ? (post.type === "shared_sentence" ? "comment" : "answer") : kind;
  const key = discussionDraftKey(session.user.id, groupId, draftKind, parentId ?? post.id);
  const [draft, setDraft] = useState(() => readDraft(key, kind, prompts.length));
  useEffect(() => {
    if (draft.body || draft.answers.some(Boolean) || draft.step > 0) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  }, [draft, key]);
  const mutation = useMutation({
    mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}/comments`, commentResponseSchema, {
      method: "POST", body: JSON.stringify(kind === "text" ? { kind, body: draft.body, parentId: parentId ?? null } : { kind, answers: draft.answers }),
    }),
    onSuccess: () => { localStorage.removeItem(key); onDone(); setDraft(readDraft(key, kind, prompts.length)); },
  });
  if (kind === "reading_response") {
    const step = Math.min(draft.step, prompts.length - 1);
    return <form className={styles.composerShell} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className={styles.composer}>
      <div className={styles.wizardStatus}><span className={styles.wizardProgress}>{t("discussion.progress", { current: step + 1, total: prompts.length })}</span><span aria-hidden="true" className={styles.wizardTrack}><span style={{ transform: `scaleX(${(step + 1) / prompts.length})` }} /></span></div><h3>{prompts[step]}</h3>
      <TextAreaField label={t("discussion.yourAnswer")} value={draft.answers[step]} maxLength={4_000} minRows={4} onChange={(event) => { const answerText = event.currentTarget.value; setDraft((value) => ({ ...value, answers: value.answers.map((answer, index) => index === step ? answerText : answer) })); }} />
      <div className={styles.wizardNav}><Button type="button" variant="quiet" disabled={step === 0} onClick={(event) => { event.preventDefault(); setDraft((value) => ({ ...value, step: value.step - 1 })); }}>{t("common.back")}</Button>{step < prompts.length - 1 ? <Button type="button" onClick={(event) => { event.preventDefault(); setDraft((value) => ({ ...value, step: value.step + 1 })); }}>{t("common.next")}</Button> : <Button type="submit" loading={mutation.isPending}>{t("discussion.publishAnswers")}</Button>}</div>
      {mutation.error && <p className={styles.error}>{t("errors.generic")}</p>}
    </div></form>;
  }
  return <form className={styles.composerShell} onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}><div className={styles.composer}>
    {kind === "fill_response" ? prompts.map((prompt, index) => <TextField key={index} label={prompt} value={draft.answers[index]} maxLength={500} onChange={(event) => { const answerText = event.currentTarget.value; setDraft((value) => ({ ...value, answers: value.answers.map((answer, current) => current === index ? answerText : answer) })); }} />) : <TextAreaField label={parentId ? t("discussion.reply") : post.type === "shared_sentence" ? t("discussion.comment") : t("discussion.yourAnswer")} value={draft.body} maxLength={10_000} minRows={3} required onChange={(event) => { const body = event.currentTarget.value; setDraft((value) => ({ ...value, body })); }} />}
    <div className={styles.composerActions}><Button type="submit" loading={mutation.isPending}>{parentId ? t("discussion.publishReply") : t("discussion.publishAnswer")}</Button></div>{mutation.error && <p className={styles.error}>{t("errors.generic")}</p>}
  </div></form>;
}

function EditResponse({ item, groupId, postId, onDone }: { item: DiscussionItem; groupId: string; postId: string; onDone: () => void }) {
  const { t } = useTranslation(); const [body, setBody] = useState(item.body ?? ""); const [answers, setAnswers] = useState(item.responseItems.map((entry) => entry.answer));
  const mutation = useMutation({ mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(item.id)}`, commentResponseSchema, { method: "PATCH", body: JSON.stringify(item.kind === "text" ? { kind: item.kind, body } : { kind: item.kind, answers }) }), onSuccess: onDone });
  return <form className={styles.composerShell} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className={styles.composer}>{item.kind === "text" ? <TextAreaField label={t("discussion.response")} value={body} required onChange={(event) => setBody(event.currentTarget.value)} /> : item.responseItems.map((entry, index) => <TextAreaField key={entry.position} label={entry.prompt ?? t("discussion.blankNumber", { number: index + 1 })} value={answers[index]} onChange={(event) => { const answerText = event.currentTarget.value; setAnswers((value) => value.map((answer, current) => current === index ? answerText : answer)); }} />)}<Button type="submit" loading={mutation.isPending}>{t("common.save")}</Button></div></form>;
}

function DiscussionEntry({ item, post, groupId, session, quickReactions, refresh, reply = false }: { item: DiscussionItem; post: Post; groupId: string; session: SignedInSession; quickReactions: string[]; refresh: () => void; reply?: boolean }) {
  const { t } = useTranslation(); const [replying, setReplying] = useState(false); const [editing, setEditing] = useState(false);
  const remove = useMutation({ mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}/comments/${encodeURIComponent(item.id)}`, okResponseSchema, { method: "DELETE" }), onSuccess: refresh });
  const pin = useMutation({ mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}/pin`, okResponseSchema, { method: "PUT", body: JSON.stringify(pinRequestSchema.parse({ commentId: item.pinned ? null : item.id })) }), onSuccess: refresh });
  return <article id={`comment-${item.id}`} className={`${styles.itemShell} ${reply ? styles.replyShell : ""}`}><div className={`${styles.item} ${reply ? styles.reply : ""}`}>
    <header className={styles.itemHeader}><span className={styles.author}><Avatar name={item.author.displayName} />{item.author.displayName}</span><span className={styles.meta}>{new Date(item.createdAt).toLocaleString()} {item.edited && t("discussion.edited")}</span>{item.pinned && <LabelChip>{t("discussion.pinned")}</LabelChip>}</header>
    {editing ? <EditResponse item={item} groupId={groupId} postId={post.id} onDone={() => { setEditing(false); refresh(); }} /> : item.kind === "text" ? <div className={styles.body}><PlainText>{item.body ?? ""}</PlainText></div> : <dl className={styles.responseList}>{item.responseItems.map((entry, index) => <div className={styles.responseItem} key={entry.position}><dt><PlainText>{entry.prompt ?? t("discussion.blankNumber", { number: index + 1 })}</PlainText></dt><dd>{entry.skipped ? t("discussion.noAnswer") : <PlainText>{entry.answer}</PlainText>}</dd>{entry.matched && <dd className={styles.match}>{t("discussion.match")}</dd>}</div>)}</dl>}
    <ReactionBar reactions={item.reactions} quickReactions={quickReactions} path={`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}/comments/${encodeURIComponent(item.id)}/reactions`} onChanged={refresh} />
    <div className={styles.itemActions}>{item.permissions.reply && <Button variant="quiet" onClick={() => setReplying((value) => !value)}>{t("discussion.reply")}</Button>}{item.permissions.edit && <Button variant="quiet" onClick={() => setEditing(true)}>{t("common.edit")}</Button>}{item.permissions.delete && <Button variant="quiet" onClick={() => remove.mutate()}>{t("common.delete")}</Button>}{item.permissions.pin && <Button variant="quiet" onClick={() => pin.mutate()}>{item.pinned ? t("discussion.unpin") : t("discussion.pin")}</Button>}</div>
    {replying && <ResponseComposer post={post} groupId={groupId} session={session} parentId={item.id} onDone={() => { setReplying(false); refresh(); }} />}
    {!!item.replies.length && <div className={styles.replies}>{item.replies.map((child) => <DiscussionEntry key={child.id} item={child} post={post} groupId={groupId} session={session} quickReactions={quickReactions} refresh={refresh} reply />)}</div>}
  </div></article>;
}

export function DiscussionPanel({ post, groupId, session }: { post: Post; groupId: string; session: SignedInSession }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const discussion = useQuery(discussionQueryOptions(groupId, post.id));
  const directTarget = useMemo(() => new URLSearchParams(window.location.search).get("comment"), []);
  const [revealed, setRevealed] = useState(post.type === "shared_sentence" || Boolean(directTarget));
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["discussion", groupId, post.id] }); void queryClient.invalidateQueries({ queryKey: ["post", groupId, post.id] }); void queryClient.invalidateQueries({ queryKey: ["posts", groupId] }); };
  useEffect(() => { if (directTarget && discussion.data && revealed) document.getElementById(`comment-${directTarget}`)?.scrollIntoView({ block: "center" }); }, [directTarget, discussion.data, revealed]);
  if (discussion.isPending) return <LoadingState label={t("discussion.loading")} />;
  if (discussion.isError) return <ErrorState title={t("discussion.unavailable")} action={<Button onClick={() => void discussion.refetch()}>{t("common.retry")}</Button>} />;
  const composer = <ResponseComposer post={post} groupId={groupId} session={session} onDone={() => { setRevealed(true); refresh(); }} />;
  if (!revealed) return <section className={styles.discussion}><div className={styles.concealedShell}><div className={styles.concealed}><LabelChip>{t("discussion.spoilerLabel")}</LabelChip><h2>{t("discussion.answersHidden", { count: discussion.data.count })}</h2><p>{t("discussion.hiddenHelp")}</p>{composer}<Button variant="secondary" onClick={() => setRevealed(true)}>{t("discussion.reveal")}</Button></div></div></section>;
  return <section className={styles.discussion}><div className={styles.discussionHeader}><div><span className={styles.sectionEyebrow}>{t("discussion.conversation")}</span><h2>{post.type === "shared_sentence" ? t("discussion.comments") : t("discussion.answers")}</h2></div>{post.type !== "shared_sentence" && <Button variant="quiet" onClick={() => setRevealed(false)}>{t("discussion.conceal")}</Button>}</div>{composer}{discussion.data.items.length ? <div className={styles.thread}>{discussion.data.items.map((item) => <DiscussionEntry key={item.id} item={item} post={post} groupId={groupId} session={session} quickReactions={discussion.data.quickReactions} refresh={refresh} />)}</div> : <EmptyState title={t("discussion.emptyTitle")}>{t("discussion.emptyBody")}</EmptyState>}</section>;
}
