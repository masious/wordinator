import {
  postPageSchema,
  type Post,
  type PostPage,
} from "@wordinator/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  apiRequest,
  feedQueryOptions,
  postQueryOptions,
  sessionQueryOptions,
} from "../api";
import {
  AdaptiveDialog,
  ArrowIcon,
  Button,
  EmptyState,
  ErrorState,
  LabelChip,
  LoadingState,
  Surface,
} from "../ui";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./PhaseThreePages.module.css";
import { DiscussionPanel } from "./PhaseFourPages";
import PostCard from '../organisms/PostCard/PostCard';
import ComposerForm from "../organisms/ComposerForm";
import type { SignedInSession } from '../organisms/types/auth'

function newestCursor(post: Post | undefined) {
  return post ? btoa(JSON.stringify([post.createdAt, post.id])) : null;
}

export function Feed({
  groupId,
  session,
}: {
  groupId: string;
  session: SignedInSession;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [showFloating, setShowFloating] = useState(false);
  const promptRef = useRef<HTMLDivElement>(null);
  const feed = useInfiniteQuery(feedQueryOptions(groupId));
  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const cursor = newestCursor(posts[0]);
  const newer = useQuery({
    queryKey: ["new-posts", groupId, cursor],
    enabled: Boolean(cursor),
    refetchInterval: 30_000,
    queryFn: () =>
      apiRequest(
        `/api/groups/${encodeURIComponent(groupId)}/posts?limit=100&newerThan=${encodeURIComponent(cursor!)}`,
        postPageSchema,
      ),
  });
  useEffect(() => {
    const prompt = promptRef.current;
    if (!prompt || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowFloating(!entry?.isIntersecting),
      { rootMargin: "-96px 0px 0px", threshold: 0 },
    );
    observer.observe(prompt);
    return () => observer.disconnect();
  }, []);
  const prepend = () => {
    if (!newer.data?.items.length) return;
    const previousHeight = document.documentElement.scrollHeight;
    const previousY = window.scrollY;
    queryClient.setQueryData<InfiniteData<PostPage>>(
      ["posts", groupId],
      (current) => {
        if (!current) return current;
        const known = new Set(
          current.pages.flatMap((page) => page.items.map((post) => post.id)),
        );
        const additions = newer.data.items.filter(
          (post) => !known.has(post.id),
        );
        return {
          ...current,
          pages: current.pages.map((page, index) =>
            index === 0
              ? { ...page, items: [...additions, ...page.items] }
              : page,
          ),
        };
      },
    );
    requestAnimationFrame(() =>
      window.scrollTo({
        top:
          previousY +
          Math.max(0, document.documentElement.scrollHeight - previousHeight),
      }),
    );
  };
  if (feed.isPending) return <LoadingState label={t("posts.loadingFeed")} />;
  if (feed.isError)
    return (
      <ErrorState
        title={t("posts.feedUnavailable")}
        action={
          <Button onClick={() => void feed.refetch()}>
            {t("common.retry")}
          </Button>
        }
      >
        {t("errors.generic")}
      </ErrorState>
    );
  const openComposer = () => setComposing(true);
  return (
    <div className={styles.feed}>
      <div className={styles.promptAnchor} ref={promptRef}>
        <Surface className={styles.composerPrompt} tone="featured">
          <div>
            <LabelChip>{t("posts.journalPrompt")}</LabelChip>
            <h2>{t("posts.composerTitle")}</h2>
            <p>{t("posts.composerIntro")}</p>
          </div>
          <Button onClick={openComposer} trailingIcon={<ArrowIcon />}>
            {t("posts.create")}
          </Button>
        </Surface>
      </div>
      {!!newer.data?.items.length && (
        <Button className={styles.newPosts} onClick={prepend}>
          {t("posts.newPosts", { count: newer.data.items.length })}
        </Button>
      )}
      {!posts.length ? (
        <EmptyState
          title={t("posts.emptyTitle")}
          action={<Button onClick={openComposer}>{t("posts.create")}</Button>}
        >
          {t("posts.emptyBody")}
        </EmptyState>
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} post={post} groupId={groupId} />
        ))
      )}
      {feed.hasNextPage && (
        <div className={styles.pagination}>
          <span>{t("posts.olderIntro")}</span>
          <Button
            variant="secondary"
            loading={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            {t("posts.loadOlder")}
          </Button>
        </div>
      )}
      {showFloating && (
        <Button
          className={styles.floating}
          onClick={openComposer}
          trailingIcon={<ArrowIcon />}
        >
          {t("posts.create")}
        </Button>
      )}
      <AdaptiveDialog
        opened={composing}
        onClose={() => setComposing(false)}
        title={t("posts.composerTitle")}
        closeOnClickOutside={false}
      >
        <ComposerForm
          groupId={groupId}
          session={session}
          onDiscard={() => setComposing(false)}
          onDone={(post) => {
            setComposing(false);
            queryClient.setQueryData<InfiniteData<PostPage>>(
              ["posts", groupId],
              (current) =>
                current
                  ? {
                      ...current,
                      pages: current.pages.map((page, index) =>
                        index === 0
                          ? { ...page, items: [post, ...page.items] }
                          : page,
                      ),
                    }
                  : current,
            );
          }}
        />
      </AdaptiveDialog>
    </div>
  );
}

export function PostDetailPage({
  groupId,
  postId,
}: {
  groupId: string;
  postId: string;
}) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  const post = useQuery(postQueryOptions(groupId, postId));
  if (session.isPending || post.isPending)
    return (
      <main className={shellStyles.center}>
        <LoadingState label={t("posts.loadingPost")} />
      </main>
    );
  if (session.data?.status !== "signedIn") return null;
  if (post.isError)
    return (
      <GroupFrame groupId={groupId} session={session.data}>
        <ErrorState
          title={t("posts.postUnavailable")}
          action={
            <Link to="/groups/$groupId" params={{ groupId }}>
              {t("common.backToFeed")}
            </Link>
          }
        />
      </GroupFrame>
    );
  return (
    <GroupFrame groupId={groupId} session={session.data}>
      <div className={styles.detail}>
        <Link
          className={styles.backLink}
          to="/groups/$groupId"
          params={{ groupId }}
        >
          {t("common.backToFeed")}
        </Link>
        <PostCard post={post.data.post} groupId={groupId} compact={false} />
        <DiscussionPanel
          post={post.data.post}
          groupId={groupId}
          session={session.data}
        />
      </div>
    </GroupFrame>
  );
}
