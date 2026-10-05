import { okResponseSchema } from "@wordinator/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, groupQueryOptions, profilePostsQueryOptions, profileQueryOptions, sessionQueryOptions, settingsQueryOptions } from "../api";
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, PageHeader, PasswordField, SectionHeader, Surface, TextAreaField, TextField, ThemePreferenceControl } from "../ui";
import { GroupFrame } from "./GroupFrame";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./PhaseTwoPages.module.css";
import { PostCard } from "./PhaseThreePages";
import { ImageUpload } from "./PhaseFivePages";

const json = (value: unknown) => JSON.stringify(value);

function Message({ error, success }: { error: Error | null; success: boolean }) {
  const { t } = useTranslation();
  if (error) {
    const code = error instanceof ApiError ? error.code : "generic";
    return <p className={styles.error} role="alert">{t(`errors.${code}`, { defaultValue: t("errors.generic") })}</p>;
  }
  return success ? <p className={styles.success} role="status">{t("settings.saved")}</p> : null;
}

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

export function SettingsPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions());
  const shell = useQuery(groupQueryOptions(groupId));
  const settings = useQuery(settingsQueryOptions());
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [reactions, setReactions] = useState(["", "", ""]);
  const [groupName, setGroupName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setDisplayName(settings.data.displayName); setBio(settings.data.bio); setReactions([...settings.data.quickReactions]);
  }, [settings.data]);
  useEffect(() => { if (shell.data) setGroupName(shell.data.group.name); }, [shell.data]);

  const account = useMutation({
    mutationFn: () => apiRequest("/api/settings", okResponseSchema, { method: "PATCH", body: json({ displayName, bio, quickReactions: reactions }) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["settings"] }), queryClient.invalidateQueries({ queryKey: ["session"] }), queryClient.invalidateQueries({ queryKey: ["profile"] })]); },
  });
  const password = useMutation({
    mutationFn: () => apiRequest("/api/auth/change-password", okResponseSchema, { method: "POST", body: json({ currentPassword, password: newPassword }) }),
    onSuccess: () => { setCurrentPassword(""); setNewPassword(""); },
  });
  const rename = useMutation({
    mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}`, okResponseSchema, { method: "PATCH", body: json({ name: groupName }) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["session"] }), queryClient.invalidateQueries({ queryKey: ["group", groupId] })]); },
  });
  const deleteGroup = useMutation({
    mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}`, okResponseSchema, { method: "DELETE", body: json({ confirmation: true }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate({ to: "/" }); },
  });
  const restoreGroup = useMutation({
    mutationFn: (deletedGroupId: string) => apiRequest(`/api/groups/${encodeURIComponent(deletedGroupId)}/restore`, okResponseSchema, { method: "POST" }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); },
  });

  if (session.isPending || shell.isPending || settings.isPending) return <main className={shellStyles.center}><LoadingState label={t("settings.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (shell.isError || settings.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("settings.unavailable")}>{t("errors.generic")}</ErrorState></GroupFrame>;

  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.settingsPage}>
    <PageHeader eyebrow={<LabelChip>{t("settings.eyebrow")}</LabelChip>} title={t("settings.title")} intro={t("settings.intro")} />
    <div className={styles.settingsGrid}>
    <Surface className={styles.settingsPanel} tone="featured"><SectionHeader title={t("settings.profileTitle")} /><form className={styles.form} onSubmit={(event: FormEvent) => { event.preventDefault(); account.mutate(); }}>
      <TextField label={t("auth.email")} value={settings.data.email} disabled />
      <TextField label={t("auth.displayName")} value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.currentTarget.value)} required />
      <TextAreaField label={t("settings.bio")} description={t("settings.bioHelp")} value={bio} maxLength={500} minRows={4} autosize onChange={(event) => setBio(event.currentTarget.value)} />
      <ImageUpload currentUrl={settings.data.avatarUrl} name={settings.data.displayName} uploadPath="/api/settings/avatar" removePath="/api/settings/avatar" onChanged={() => queryClient.invalidateQueries({ queryKey: ["settings"] })} />
      <fieldset><legend>{t("settings.reactions")}</legend><p className={styles.muted}>{t("settings.reactionsHelp")}</p><div className={styles.reactionGrid}>{reactions.map((reaction, index) => <TextField key={index} aria-label={t("settings.reactionLabel", { number: index + 1 })} value={reaction} onChange={(event) => {
        const nextReaction = event.currentTarget.value;
        setReactions((values) => values.map((value, current) => current === index ? nextReaction : value));
      }} required />)}</div></fieldset>
      <div className={styles.actions}><Button loading={account.isPending} type="submit">{t("settings.saveProfile")}</Button><Message error={account.error} success={account.isSuccess} /></div>
    </form></Surface>
    <div className={styles.settingsRail}>
    <Surface className={styles.settingsPanel} tone="inset"><ThemePreferenceControl /></Surface>
    <Surface className={styles.settingsPanel}><SectionHeader title={t("settings.passwordTitle")} /><form className={styles.form} onSubmit={(event) => { event.preventDefault(); password.mutate(); }}>
      <PasswordField label={t("settings.currentPassword")} value={currentPassword} minLength={6} onChange={(event) => setCurrentPassword(event.currentTarget.value)} required />
      <PasswordField label={t("auth.newPassword")} value={newPassword} minLength={6} onChange={(event) => setNewPassword(event.currentTarget.value)} required />
      <div className={styles.actions}><Button loading={password.isPending} type="submit">{t("settings.savePassword")}</Button><Message error={password.error} success={password.isSuccess} /></div>
    </form></Surface>
    {shell.data.group.role === "creator" && <Surface className={styles.settingsPanel}><SectionHeader title={t("settings.groupTitle")} /><form className={styles.form} onSubmit={(event) => { event.preventDefault(); rename.mutate(); }}>
      <TextField label={t("group.name")} value={groupName} maxLength={100} onChange={(event) => setGroupName(event.currentTarget.value)} required />
      <ImageUpload currentUrl={shell.data.group.iconUrl} name={shell.data.group.name} uploadPath={`/api/groups/${encodeURIComponent(groupId)}/icon`} removePath={`/api/groups/${encodeURIComponent(groupId)}/icon`} onChanged={() => Promise.all([queryClient.invalidateQueries({ queryKey: ["group", groupId] }), queryClient.invalidateQueries({ queryKey: ["session"] })])} />
      <div className={styles.actions}><Button loading={rename.isPending} type="submit">{t("settings.renameGroup")}</Button><Message error={rename.error} success={rename.isSuccess} /></div>
    </form><div className={styles.dangerZone}><h3>{t("settings.deleteGroupTitle")}</h3><p className={styles.muted}>{t("settings.deleteGroupHelp")}</p><Button variant="danger" onClick={() => setDeleteOpen(true)}>{t("settings.deleteGroup")}</Button></div></Surface>}
    {!!session.data.deletedGroups.length && <Surface className={styles.settingsPanel} tone="inset"><SectionHeader title={t("settings.deletedGroups")} /><div className={styles.deletedList}>{session.data.deletedGroups.map((group) => <div className={styles.deletedRow} key={group.id}><div><strong>{group.name}</strong><span>{t("status.deleted")}</span></div>{group.role === "creator" && <Button variant="secondary" loading={restoreGroup.isPending} onClick={() => restoreGroup.mutate(group.id)}>{t("status.restore")}</Button>}</div>)}</div></Surface>}
    </div></div>
    <ConfirmDialog opened={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("settings.deleteGroupTitle")} confirmLabel={t("settings.deleteGroup")} cancelLabel={t("common.cancel")} confirmLoading={deleteGroup.isPending} onConfirm={() => deleteGroup.mutate()}>{t("settings.deleteGroupConfirm")}</ConfirmDialog>
  </div></GroupFrame>;
}
