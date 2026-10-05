import { createPostResponseSchema, okResponseSchema, postPageSchema, postResponseSchema, type Post, type PostInput, type PostPage, type PostType, type SessionResponse } from "@wordinator/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, feedQueryOptions, postQueryOptions, sessionQueryOptions, settingsQueryOptions } from "../api";
import { AdaptiveDialog, ArrowIcon, Avatar, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, SelectField, Surface, TextAreaField, TextField } from "../ui";
import { GroupFrame } from "./GroupFrame";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./PhaseThreePages.module.css";
import { DiscussionPanel, ReactionBar } from "./PhaseFourPages";

type SignedInSession = Extract<SessionResponse, { status: "signedIn" }>;
type TypeDraft = { body: string; notes: string; questions: string[]; expectedAnswers: Array<string | null> };
type ComposerDraft = { version: 1; activeType: PostType; byType: Record<PostType, TypeDraft> };

const emptyType = (): TypeDraft => ({ body: "", notes: "", questions: [""], expectedAnswers: [] });
const emptyDraft = (): ComposerDraft => ({
  version: 1, activeType: "shared_sentence",
  byType: { shared_sentence: emptyType(), question: emptyType(), reading: emptyType(), fill_in: emptyType() },
});
export const composerDraftKey = (accountId: string, groupId: string) => `wordinator:draft:v1:${accountId}:${groupId}:post:new`;

function readDraft(key: string): ComposerDraft {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) return emptyDraft();
    return value as ComposerDraft;
  } catch { return emptyDraft(); }
}

function inputFromDraft(draft: ComposerDraft): PostInput {
  const fields = draft.byType[draft.activeType];
  const shared = { body: fields.body, notes: fields.notes || null };
  if (draft.activeType === "reading") return { type: "reading", ...shared, questions: fields.questions.map((text) => ({ text })) };
  if (draft.activeType === "fill_in") return { type: "fill_in", ...shared, expectedAnswers: fields.expectedAnswers };
  return { type: draft.activeType, ...shared };
}

function draftFromPost(post: Post): ComposerDraft {
  const draft = emptyDraft();
  draft.activeType = post.type;
  draft.byType[post.type] = {
    body: post.body, notes: post.notes ?? "",
    questions: post.questions.length ? post.questions.map((question) => question.text) : [""],
    expectedAnswers: post.expectedAnswers.map((answer) => answer.text),
  };
  return draft;
}

function ErrorMessage({ error }: { error: Error | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  return <p className={styles.error} role="alert">{error instanceof ApiError ? error.message : t("errors.generic")}</p>;
}

export function ComposerForm({ groupId, session, initialPost, onDone, onDiscard }: {
  groupId: string; session: SignedInSession; initialPost?: Post; onDone: (post: Post) => void; onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const key = composerDraftKey(session.user.id, groupId);
  const [draft, setDraft] = useState<ComposerDraft>(() => initialPost ? draftFromPost(initialPost) : readDraft(key));
  const current = draft.byType[draft.activeType];
  useEffect(() => { if (!initialPost) localStorage.setItem(key, JSON.stringify(draft)); }, [draft, initialPost, key]);
  const update = (change: Partial<TypeDraft>) => setDraft((value) => ({ ...value, byType: { ...value.byType, [value.activeType]: { ...value.byType[value.activeType], ...change } } }));
  const selectType = (type: PostType) => setDraft((value) => {
    const source = value.byType[value.activeType]; const destination = value.byType[type];
    return { ...value, activeType: type, byType: { ...value.byType, [type]: { ...destination, body: destination.body || source.body, notes: destination.notes || source.notes } } };
  });
  const mutation = useMutation({
    mutationFn: () => apiRequest(
      `/api/groups/${encodeURIComponent(groupId)}/posts${initialPost ? `/${encodeURIComponent(initialPost.id)}` : ""}`,
      initialPost ? postResponseSchema : createPostResponseSchema,
      { method: initialPost ? "PATCH" : "POST", body: JSON.stringify(inputFromDraft(draft)) },
    ),
    onSuccess: ({ post }) => { if (!initialPost) localStorage.removeItem(key); onDone(post); },
  });
  const blankCount = [...current.body].filter((character) => character === "…").length;
  useEffect(() => {
    if (draft.activeType !== "fill_in" || current.expectedAnswers.length === blankCount) return;
    update({ expectedAnswers: Array.from({ length: blankCount }, (_, index) => current.expectedAnswers[index] ?? null) });
  }, [blankCount, current.expectedAnswers, draft.activeType]);

  return <form className={styles.composerForm} onSubmit={(event: FormEvent) => { event.preventDefault(); mutation.mutate(); }}>
    <SelectField label={t("posts.type")} value={draft.activeType} onChange={(value) => selectType(value as PostType)} data={[
      { value: "shared_sentence", label: t("posts.types.shared_sentence") }, { value: "question", label: t("posts.types.question") },
      { value: "reading", label: t("posts.types.reading") }, { value: "fill_in", label: t("posts.types.fill_in") },
    ]} />
    <TextAreaField label={t(`posts.bodyLabels.${draft.activeType}`)} value={current.body} maxLength={10_000} minRows={draft.activeType === "reading" ? 8 : 4} autosize onChange={(event) => update({ body: event.currentTarget.value })} required />
    {draft.activeType === "reading" && <fieldset><legend>{t("posts.readingQuestions")}</legend><div className={styles.fieldList}>{current.questions.map((question, index) => <div className={styles.fieldRow} key={index}>
      <TextField aria-label={t("posts.questionNumber", { number: index + 1 })} value={question} maxLength={1_000} onChange={(event) => update({ questions: current.questions.map((item, currentIndex) => currentIndex === index ? event.currentTarget.value : item) })} required />
      {current.questions.length > 1 && <Button type="button" variant="quiet" onClick={() => update({ questions: current.questions.filter((_, currentIndex) => currentIndex !== index) })}>{t("common.remove")}</Button>}
    </div>)}</div><Button type="button" variant="secondary" onClick={() => update({ questions: [...current.questions, ""] })}>{t("posts.addQuestion")}</Button></fieldset>}
    {draft.activeType === "fill_in" && <fieldset><legend>{t("posts.expectedAnswers")}</legend><p className={styles.muted}>{t("posts.fillHelp")}</p>{blankCount === 0 ? <p className={styles.error}>{t("posts.addBlank")}</p> : <div className={styles.fieldList}>{current.expectedAnswers.map((answer, index) => <TextField key={index} label={t("posts.blankNumber", { number: index + 1 })} value={answer ?? ""} maxLength={500} onChange={(event) => update({ expectedAnswers: current.expectedAnswers.map((item, currentIndex) => currentIndex === index ? event.currentTarget.value || null : item) })} />)}</div>}</fieldset>}
    <TextAreaField label={t("posts.notes")} description={t("posts.notesHelp")} value={current.notes} maxLength={4_000} minRows={3} autosize onChange={(event) => update({ notes: event.currentTarget.value })} />
    <ErrorMessage error={mutation.error} />
    <div className={styles.actions}><Button type="button" variant="quiet" onClick={() => { if (!initialPost) localStorage.removeItem(key); onDiscard(); }}>{t("posts.discard")}</Button><Button loading={mutation.isPending} type="submit">{initialPost ? t("posts.saveEdit") : t("posts.publish")}</Button></div>
  </form>;
}

function PlainText({ children }: { children: string }) {
  const parts = children.split(/(https?:\/\/[^\s]+)/g);
  return <>{parts.map((part, index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a> : part)}</>;
}

function RelativeTime({ value }: { value: number }) {
  const seconds = Math.round((value - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] = Math.abs(seconds) < 60 ? [seconds, "second"] : Math.abs(seconds) < 3_600 ? [Math.round(seconds / 60), "minute"] : Math.abs(seconds) < 86_400 ? [Math.round(seconds / 3_600), "hour"] : [Math.round(seconds / 86_400), "day"];
  return <time dateTime={new Date(value).toISOString()} title={new Date(value).toLocaleString()}>{formatter.format(amount, unit)}</time>;
}

export function PostCard({ post, groupId, compact = true }: { post: Post; groupId: string; compact?: boolean }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const navigate = useNavigate();
  const [notesVisible, setNotesVisible] = useState(false); const [editing, setEditing] = useState(false); const [deleting, setDeleting] = useState(false);
  const session = useQuery(sessionQueryOptions());
  const settings = useQuery(settingsQueryOptions());
  const deletion = useMutation({
    mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}`, okResponseSchema, { method: "DELETE" }),
    onSuccess: async () => { setDeleting(false); await Promise.all([queryClient.invalidateQueries({ queryKey: ["posts", groupId] }), queryClient.invalidateQueries({ queryKey: ["profile-posts", groupId] })]); if (!compact) await navigate({ to: "/groups/$groupId", params: { groupId } }); },
  });
  const body = compact && post.body.length > 360 ? `${post.body.slice(0, 360)}…` : post.body;
  return <article className={styles.postShell}><div className={styles.postCard}>
    <header className={styles.postHeader}><Link to="/groups/$groupId/members/$userId" params={{ groupId, userId: post.author.id }} className={styles.author}><Avatar name={post.author.displayName} src={post.author.avatarUrl || undefined} /><span>{post.author.displayName}</span></Link><div className={styles.meta}><LabelChip>{t(`posts.types.${post.type}`)}</LabelChip><RelativeTime value={post.createdAt} />{post.edited && <span>{t("posts.edited")}</span>}</div></header>
    <div className={styles.postBody}><PlainText>{body}</PlainText></div>
    {!compact && post.type === "reading" && <ol className={styles.questions}>{post.questions.map((question) => <li key={question.id}><PlainText>{question.text}</PlainText></li>)}</ol>}
    {post.notes && <div><Button variant="quiet" onClick={() => setNotesVisible((value) => !value)}>{notesVisible ? t("posts.hideNotes") : t("posts.showNotes")}</Button>{notesVisible && <div className={styles.notes}><PlainText>{post.notes}</PlainText></div>}</div>}
    {settings.data && <ReactionBar reactions={post.reactions} quickReactions={settings.data.quickReactions} path={`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}/reactions`} onChanged={() => { void queryClient.invalidateQueries({ queryKey: ["posts", groupId] }); void queryClient.invalidateQueries({ queryKey: ["post", groupId, post.id] }); }} />}
    <footer className={styles.postFooter}><span>{t("posts.responseCount", { count: post.commentCount })}</span><span>{t("posts.reactionCount", { count: post.reactionCount })}</span><span className={styles.grow} />
      {compact && <Link className={styles.openPost} to="/groups/$groupId/posts/$postId" params={{ groupId, postId: post.id }}>{t(post.body.length > 360 ? "posts.readMore" : "posts.open")}<ArrowIcon /></Link>}
      {post.permissions.edit && <Button variant="quiet" onClick={() => setEditing(true)}>{t("common.edit")}</Button>}{post.permissions.delete && <Button variant="quiet" onClick={() => setDeleting(true)}>{t("common.delete")}</Button>}
    </footer>
    <AdaptiveDialog opened={editing} onClose={() => setEditing(false)} title={t("posts.editTitle")}>
      {session.data?.status === "signedIn" && <ComposerForm groupId={groupId} session={session.data} initialPost={post} onDiscard={() => setEditing(false)} onDone={() => { setEditing(false); void queryClient.invalidateQueries({ queryKey: ["posts", groupId] }); void queryClient.invalidateQueries({ queryKey: ["post", groupId, post.id] }); }} />}
    </AdaptiveDialog>
    <ConfirmDialog opened={deleting} onClose={() => setDeleting(false)} title={t("posts.deleteTitle")} confirmLabel={t("common.delete")} onConfirm={() => deletion.mutate()}><p>{t("posts.deleteBody")}</p><ErrorMessage error={deletion.error} /></ConfirmDialog>
  </div></article>;
}

function newestCursor(post: Post | undefined) { return post ? btoa(JSON.stringify([post.createdAt, post.id])) : null; }

export function Feed({ groupId, session }: { groupId: string; session: SignedInSession }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false); const [showFloating, setShowFloating] = useState(false);
  const promptRef = useRef<HTMLDivElement>(null);
  const feed = useInfiniteQuery(feedQueryOptions(groupId));
  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const cursor = newestCursor(posts[0]);
  const newer = useQuery({
    queryKey: ["new-posts", groupId, cursor], enabled: Boolean(cursor), refetchInterval: 30_000,
    queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts?limit=100&newerThan=${encodeURIComponent(cursor!)}`, postPageSchema),
  });
  useEffect(() => {
    const prompt = promptRef.current;
    if (!prompt || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowFloating(!entry?.isIntersecting), { rootMargin: "-96px 0px 0px", threshold: 0 });
    observer.observe(prompt);
    return () => observer.disconnect();
  }, []);
  const prepend = () => {
    if (!newer.data?.items.length) return;
    const previousHeight = document.documentElement.scrollHeight;
    const previousY = window.scrollY;
    queryClient.setQueryData<InfiniteData<PostPage>>(["posts", groupId], (current) => {
      if (!current) return current;
      const known = new Set(current.pages.flatMap((page) => page.items.map((post) => post.id)));
      const additions = newer.data.items.filter((post) => !known.has(post.id));
      return { ...current, pages: current.pages.map((page, index) => index === 0 ? { ...page, items: [...additions, ...page.items] } : page) };
    });
    requestAnimationFrame(() => window.scrollTo({ top: previousY + Math.max(0, document.documentElement.scrollHeight - previousHeight) }));
  };
  if (feed.isPending) return <LoadingState label={t("posts.loadingFeed")} />;
  if (feed.isError) return <ErrorState title={t("posts.feedUnavailable")} action={<Button onClick={() => void feed.refetch()}>{t("common.retry")}</Button>}>{t("errors.generic")}</ErrorState>;
  const openComposer = () => setComposing(true);
  return <div className={styles.feed}>
    <div className={styles.promptAnchor} ref={promptRef}><Surface className={styles.composerPrompt} tone="featured"><div><LabelChip>{t("posts.journalPrompt")}</LabelChip><h2>{t("posts.composerTitle")}</h2><p>{t("posts.composerIntro")}</p></div><Button onClick={openComposer} trailingIcon={<ArrowIcon />}>{t("posts.create")}</Button></Surface></div>
    {!!newer.data?.items.length && <Button className={styles.newPosts} onClick={prepend}>{t("posts.newPosts", { count: newer.data.items.length })}</Button>}
    {!posts.length ? <EmptyState title={t("posts.emptyTitle")} action={<Button onClick={openComposer}>{t("posts.create")}</Button>}>{t("posts.emptyBody")}</EmptyState> : posts.map((post) => <PostCard key={post.id} post={post} groupId={groupId} />)}
    {feed.hasNextPage && <div className={styles.pagination}><span>{t("posts.olderIntro")}</span><Button variant="secondary" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{t("posts.loadOlder")}</Button></div>}
    {showFloating && <Button className={styles.floating} onClick={openComposer} trailingIcon={<ArrowIcon />}>{t("posts.create")}</Button>}
    <AdaptiveDialog opened={composing} onClose={() => setComposing(false)} title={t("posts.composerTitle")} closeOnClickOutside={false}>
      <ComposerForm groupId={groupId} session={session} onDiscard={() => setComposing(false)} onDone={(post) => {
        setComposing(false);
        queryClient.setQueryData<InfiniteData<PostPage>>(["posts", groupId], (current) => current ? { ...current, pages: current.pages.map((page, index) => index === 0 ? { ...page, items: [post, ...page.items] } : page) } : current);
      }} />
    </AdaptiveDialog>
  </div>;
}

export function PostDetailPage({ groupId, postId }: { groupId: string; postId: string }) {
  const { t } = useTranslation(); const session = useQuery(sessionQueryOptions()); const post = useQuery(postQueryOptions(groupId, postId));
  if (session.isPending || post.isPending) return <main className={shellStyles.center}><LoadingState label={t("posts.loadingPost")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (post.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("posts.postUnavailable")} action={<Link to="/groups/$groupId" params={{ groupId }}>{t("common.backToFeed")}</Link>} /></GroupFrame>;
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.detail}><Link className={styles.backLink} to="/groups/$groupId" params={{ groupId }}>{t("common.backToFeed")}</Link><PostCard post={post.data.post} groupId={groupId} compact={false} /><DiscussionPanel post={post.data.post} groupId={groupId} session={session.data} /></div></GroupFrame>;
}
