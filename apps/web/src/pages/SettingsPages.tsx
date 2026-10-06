import { type MembershipAdminItem, okResponseSchema, type SessionResponse, temporaryPasswordResponseSchema } from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type PropsWithChildren, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, groupQueryOptions, membershipsQueryOptions, sessionQueryOptions, settingsQueryOptions } from "../api";
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, PageHeader, PasswordField, SectionHeader, Surface, TextAreaField, TextField, ThemePreferenceControl } from "../ui";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import shellStyles from "./PhaseOnePages.module.css";
import { ImageUpload } from "./PhaseFivePages";
import styles from "./SettingsPages.module.css";

const json = (value: unknown) => JSON.stringify(value);
type SignedIn = Extract<SessionResponse, { status: "signedIn" }>;
type Section = "account" | "group" | "members";

function Message({ error, success }: { error: Error | null; success: boolean }) {
  const { t } = useTranslation();
  if (error) {
    const code = error instanceof ApiError ? error.code : "generic";
    return <p className={styles.error} role="alert">{t(`errors.${code}`, { defaultValue: t("errors.generic") })}</p>;
  }
  return success ? <p className={styles.success}>{t("settings.saved")}</p> : null;
}

// Every settings page shares the group shell, header, and the creator-only section navigation.
function SettingsFrame({ groupId, session, section, creator, eyebrow, intro, children }: PropsWithChildren<{
  groupId: string; session: SignedIn; section: Section; creator: boolean; eyebrow: ReactNode; intro: string;
}>) {
  const { t } = useTranslation();
  const sections: Array<{ id: Section; to: "/groups/$groupId/settings/account" | "/groups/$groupId/settings/group" | "/groups/$groupId/settings/members" }> = [
    { id: "account", to: "/groups/$groupId/settings/account" },
    { id: "group", to: "/groups/$groupId/settings/group" },
    { id: "members", to: "/groups/$groupId/settings/members" },
  ];
  return <GroupFrame groupId={groupId} session={session}><div className={styles.settingsPage}>
    <PageHeader eyebrow={<LabelChip>{eyebrow}</LabelChip>} title={t("settings.title")} intro={intro} />
    {creator && <nav className={styles.sectionNav} aria-label={t("settings.sectionsLabel")}>
      {sections.map((item) => <Link key={item.id} to={item.to} params={{ groupId }} aria-current={item.id === section ? "page" : undefined}>{t(`settings.sections.${item.id}`)}</Link>)}
    </nav>}
    {children}
  </div></GroupFrame>;
}

function useSettingsShell(groupId: string) {
  const session = useQuery(sessionQueryOptions());
  const shell = useQuery(groupQueryOptions(groupId));
  return { session, shell };
}

export function AccountSettingsPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { session, shell } = useSettingsShell(groupId);
  const settings = useQuery(settingsQueryOptions());
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [reactions, setReactions] = useState(["", "", ""]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setDisplayName(settings.data.displayName); setBio(settings.data.bio); setReactions([...settings.data.quickReactions]);
  }, [settings.data]);

  const account = useMutation({
    mutationFn: () => apiRequest("/api/settings", okResponseSchema, { method: "PATCH", body: json({ displayName, bio, quickReactions: reactions }) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["settings"] }), queryClient.invalidateQueries({ queryKey: ["session"] }), queryClient.invalidateQueries({ queryKey: ["profile"] })]); },
  });
  const password = useMutation({
    mutationFn: () => apiRequest("/api/auth/change-password", okResponseSchema, { method: "POST", body: json({ currentPassword, password: newPassword }) }),
    onSuccess: () => { setCurrentPassword(""); setNewPassword(""); },
  });
  const restoreGroup = useMutation({
    mutationFn: (deletedGroupId: string) => apiRequest(`/api/groups/${encodeURIComponent(deletedGroupId)}/restore`, okResponseSchema, { method: "POST" }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); },
  });

  if (session.isPending || shell.isPending || settings.isPending) return <main className={shellStyles.center}><LoadingState label={t("settings.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (shell.isError || settings.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("settings.unavailable")}>{t("errors.generic")}</ErrorState></GroupFrame>;

  return <SettingsFrame groupId={groupId} session={session.data} section="account" creator={shell.data.group.role === "creator"} eyebrow={t("settings.everyGroup")} intro={t("settings.accountIntro")}>
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
        {!!session.data.deletedGroups.length && <Surface className={styles.settingsPanel} tone="inset"><SectionHeader title={t("settings.deletedGroups")} /><div className={styles.deletedList}>{session.data.deletedGroups.map((group) => <div className={styles.deletedRow} key={group.id}><div><strong>{group.name}</strong><span>{t("status.deleted")}</span></div>{group.role === "creator" && <Button variant="secondary" loading={restoreGroup.isPending} onClick={() => restoreGroup.mutate(group.id)}>{t("status.restore")}</Button>}</div>)}</div></Surface>}
      </div>
    </div>
  </SettingsFrame>;
}

export function GroupSettingsPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, shell } = useSettingsShell(groupId);
  const [groupName, setGroupName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => { if (shell.data) setGroupName(shell.data.group.name); }, [shell.data]);

  const rename = useMutation({
    mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}`, okResponseSchema, { method: "PATCH", body: json({ name: groupName }) }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["session"] }), queryClient.invalidateQueries({ queryKey: ["group", groupId] })]); },
  });
  const deleteGroup = useMutation({
    mutationFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}`, okResponseSchema, { method: "DELETE", body: json({ confirmation: true }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate({ to: "/" }); },
  });

  if (session.isPending || shell.isPending) return <main className={shellStyles.center}><LoadingState label={t("settings.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (shell.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("settings.unavailable")}>{t("errors.generic")}</ErrorState></GroupFrame>;
  if (shell.data.group.role !== "creator") return <Navigate to="/groups/$groupId/settings/account" params={{ groupId }} replace />;

  return <SettingsFrame groupId={groupId} session={session.data} section="group" creator eyebrow={shell.data.group.name} intro={t("settings.groupIntro")}>
    <Surface className={styles.settingsPanel} tone="featured"><SectionHeader title={t("settings.groupTitle")} />
      <dl className={styles.facts}><dt>{t("group.language")}</dt><dd>{t(`languages.${shell.data.group.language}`)}</dd></dl>
      <p className={styles.muted}>{t("settings.languageFixed")}</p>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); rename.mutate(); }}>
        <TextField label={t("group.name")} value={groupName} maxLength={100} onChange={(event) => setGroupName(event.currentTarget.value)} required />
        <div className={styles.actions}><Button loading={rename.isPending} type="submit">{t("settings.renameGroup")}</Button><Message error={rename.error} success={rename.isSuccess} /></div>
      </form>
      <ImageUpload currentUrl={shell.data.group.iconUrl} name={shell.data.group.name} uploadPath={`/api/groups/${encodeURIComponent(groupId)}/icon`} removePath={`/api/groups/${encodeURIComponent(groupId)}/icon`} onChanged={() => Promise.all([queryClient.invalidateQueries({ queryKey: ["group", groupId] }), queryClient.invalidateQueries({ queryKey: ["session"] })])} />
      <div className={styles.dangerZone}><h3>{t("settings.deleteGroupTitle")}</h3><p className={styles.muted}>{t("settings.deleteGroupHelp")}</p><Button variant="danger" onClick={() => setDeleteOpen(true)}>{t("settings.deleteGroup")}</Button></div>
    </Surface>
    <ConfirmDialog opened={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("settings.deleteGroupTitle")} confirmLabel={t("settings.deleteGroup")} cancelLabel={t("common.cancel")} confirmLoading={deleteGroup.isPending} onConfirm={() => deleteGroup.mutate()}>{t("settings.deleteGroupConfirm")}</ConfirmDialog>
  </SettingsFrame>;
}

const formatDate = (value: number) => new Date(value).toLocaleDateString();

export function MembershipSettingsPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { session, shell } = useSettingsShell(groupId);
  const creator = shell.data?.group.role === "creator";
  const memberships = useQuery({ ...membershipsQueryOptions(groupId), enabled: creator });
  const [password, setPassword] = useState<{ name: string; value: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["memberships", groupId] }),
    queryClient.invalidateQueries({ queryKey: ["members", groupId] }),
    queryClient.invalidateQueries({ queryKey: ["group", groupId] }),
  ]);
  const decision = useMutation({
    mutationFn: ({ userId, choice }: { userId: string; choice: "accept" | "reject" }) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/memberships/${encodeURIComponent(userId)}`, okResponseSchema, { method: "PATCH", body: json({ decision: choice }) }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/memberships/${encodeURIComponent(userId)}`, okResponseSchema, { method: "DELETE", body: json({ confirmation: true }) }),
    onSuccess: async () => { setRemoveTarget(null); await refresh(); },
  });
  const regenerate = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => ({ name, response: await apiRequest(`/api/groups/${encodeURIComponent(groupId)}/memberships/${encodeURIComponent(id)}/regenerate-password`, temporaryPasswordResponseSchema, { method: "POST" }) }),
    onSuccess: ({ name, response }) => setPassword({ name, value: response.password }),
  });

  if (session.isPending || shell.isPending || (creator && memberships.isPending)) return <main className={shellStyles.center}><LoadingState label={t("settings.admin.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (shell.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("settings.unavailable")}>{t("errors.generic")}</ErrorState></GroupFrame>;
  if (!creator) return <Navigate to="/groups/$groupId/settings/account" params={{ groupId }} replace />;
  if (memberships.isError || !memberships.data) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("settings.admin.unavailable")}>{t("errors.generic")}</ErrorState></GroupFrame>;

  const dateLabel = (item: MembershipAdminItem) => {
    if (item.state === "pending") return t("settings.admin.when.pending", { date: formatDate(item.requestedAt) });
    if (item.state === "active") return item.isCreator ? t("members.creator") : t("settings.admin.when.active", { date: formatDate(item.decidedAt ?? item.requestedAt) });
    return t(`settings.admin.when.${item.state}`, { date: formatDate(item.decidedAt ?? item.requestedAt) });
  };
  // Only people with an active or departed membership have a group profile; requesters never did.
  const renderRow = (item: MembershipAdminItem, actions?: ReactNode) => <div className={styles.row} key={item.id}>
    <div className={styles.identity}><Avatar name={item.displayName} src={item.avatarUrl ?? undefined} /><div>
      {item.state === "pending" || item.state === "rejected"
        ? <strong>{item.displayName}</strong>
        : <Link to="/groups/$groupId/members/$userId" params={{ groupId, userId: item.id }}><strong>{item.displayName}</strong></Link>}
      <p>{dateLabel(item)}</p>
    </div></div>
    {actions && <div className={styles.rowActions}>{actions}</div>}
  </div>;
  const list = (items: MembershipAdminItem[], empty: string, render: (item: MembershipAdminItem) => ReactNode, quiet = false) => items.length
    ? <div className={`${styles.rowList} ${quiet ? styles.quietList : ""}`}>{items.map(render)}</div>
    : <EmptyState title={empty} />;
  const { pending, active, rejected, former } = memberships.data;

  return <SettingsFrame groupId={groupId} session={session.data} section="members" creator eyebrow={shell.data.group.name} intro={t("settings.membersIntro")}>
    {password && <Surface className={styles.temporary} tone="featured"><div role="status">{t("members.passwordOnce", { name: password.name })}<code>{password.value}</code><Button variant="quiet" onClick={() => void navigator.clipboard.writeText(password.value)}>{t("members.copyPassword")}</Button></div></Surface>}
    {(decision.error || regenerate.error) && <Message error={decision.error ?? regenerate.error} success={false} />}
    <div className={styles.adminGrid}>
      <div className={styles.settingsRail}>
        <Surface className={styles.settingsPanel} tone="featured"><SectionHeader title={t("group.joinRequests")} />
          {list(pending, t("group.noRequests"), (item) => renderRow(item, <>
            <Button variant="secondary" disabled={decision.isPending} onClick={() => decision.mutate({ userId: item.id, choice: "reject" })}>{t("group.reject")}</Button>
            <Button disabled={decision.isPending} onClick={() => decision.mutate({ userId: item.id, choice: "accept" })}>{t("group.accept")}</Button>
          </>))}
        </Surface>
        <Surface className={styles.settingsPanel}><SectionHeader title={t("members.active")} />
          {list(active, t("settings.admin.noActive"), (item) => renderRow(item, item.isCreator ? undefined : <>
            <Button variant="secondary" loading={regenerate.isPending && regenerate.variables?.id === item.id} onClick={() => regenerate.mutate({ id: item.id, name: item.displayName })}>{t("members.regenerate")}</Button>
            <Button variant="danger" onClick={() => setRemoveTarget({ id: item.id, name: item.displayName })}>{t("members.remove")}</Button>
          </>))}
        </Surface>
      </div>
      <div className={styles.settingsRail}>
        <Surface className={styles.settingsPanel} tone="quiet"><SectionHeader title={t("settings.admin.rejectedTitle")} />{list(rejected, t("settings.admin.noRejected"), (item) => renderRow(item), true)}</Surface>
        <Surface className={styles.settingsPanel} tone="quiet"><SectionHeader title={t("members.former")} />{list(former, t("members.noFormer"), (item) => renderRow(item), true)}</Surface>
      </div>
    </div>
    <ConfirmDialog opened={removeTarget !== null} onClose={() => setRemoveTarget(null)} title={t("members.remove")} confirmLabel={t("members.remove")} cancelLabel={t("common.cancel")} confirmLoading={remove.isPending} onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}>{removeTarget ? t("members.removeConfirm", { name: removeTarget.name }) : ""}</ConfirmDialog>
  </SettingsFrame>;
}
