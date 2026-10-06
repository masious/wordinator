import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { profilePostsQueryOptions, profileQueryOptions, sessionQueryOptions } from "../api";
import { Avatar, Button, EmptyState, ErrorState, LabelChip, LoadingState, SectionHeader, Surface } from "../ui";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./PhaseTwoPages.module.css";
import PostCard from "../organisms/PostCard/PostCard";

export function ProfilePage({ groupId, userId }: { groupId: string; userId: string }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  const profile = useQuery(profileQueryOptions(groupId, userId));
  const profilePosts = useInfiniteQuery(profilePostsQueryOptions(groupId, userId));
  const postItems = profilePosts.data?.pages.flatMap((page) => page.posts.items) ?? [];
  if (session.isPending || profile.isPending || profilePosts.isPending) return <main className={shellStyles.center}><LoadingState label={t("profile.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (profile.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("profile.unavailable")}><Link to="/groups/$groupId" params={{ groupId }}>{t("common.goHome")}</Link></ErrorState></GroupFrame>;
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.profilePage}>
    <Surface className={styles.profileSurface} tone="featured">
      <div className={styles.profileHeader}>
        <div className={styles.profileAvatar}><Avatar name={profile.data.profile.displayName} src={profile.data.profile.avatarUrl ?? undefined} /></div>
        <div>{profile.data.profile.membership === "former" && <LabelChip>{t("profile.former")}</LabelChip>}<h1>{profile.data.profile.displayName}</h1><p>{t("profile.private")}</p></div>
      </div>
      {profile.data.profile.bio ? <p className={styles.bio}>{profile.data.profile.bio}</p> : <p className={styles.muted}>{t("profile.noBio")}</p>}
    </Surface>
    <section className={styles.history}><SectionHeader eyebrow={<LabelChip>{t("profile.private")}</LabelChip>} title={t("profile.posts")} />{postItems.length
      ? postItems.map((post) => <PostCard key={post.id} post={post} groupId={groupId} />)
      : <Surface><EmptyState title={t("profile.noPostsTitle")}>{t("profile.noPostsBody")}</EmptyState></Surface>}
      {profilePosts.hasNextPage && <Button variant="secondary" loading={profilePosts.isFetchingNextPage} onClick={() => void profilePosts.fetchNextPage()}>{t("posts.loadOlder")}</Button>}
    </section>
  </div></GroupFrame>;
}
