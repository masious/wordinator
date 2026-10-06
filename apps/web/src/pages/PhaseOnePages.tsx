import {
  createGroupResponseSchema,
  imageResponseSchema,
  okResponseSchema,
  type SessionResponse,
} from "@wordinator/contracts";
import { FileInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, groupQueryOptions, invitationQueryOptions, sessionQueryOptions } from "../api";
import { Avatar, Button, ErrorState, LabelChip, LoadingState, PageHeader, PasswordField, SelectField, SplitLayout, StatusPanel, Surface, TextField } from "../ui";
import styles from "./PhaseOnePages.module.css";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { Feed } from "./PhaseThreePages";
import { ImageCropper } from "../organisms/ImageCropper/ImageCropper";
import { SQUARE_OUTPUT } from "../organisms/ImageCropper/crop";
import { RestrictedNotices } from "./PhaseSixPages";

const json = (value: unknown) => JSON.stringify(value);

function MutationError({ error }: { error: Error | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  const message = error instanceof ApiError
    ? t(`errors.${error.code}`, { defaultValue: t("errors.generic") })
    : t("errors.generic");
  return <p className={styles.formError} role="alert">{message}</p>;
}

function AuthCard({ children, eyebrow, title, intro }: { children: ReactNode; eyebrow: string; title: string; intro: string }) {
  return <main className={styles.authPage}>
    <SplitLayout className={styles.authLayout} primary={<div className={styles.authStory}>
      <LabelChip>{eyebrow}</LabelChip><h1>{title}</h1><p className={styles.intro}>{intro}</p>
      <div aria-hidden="true" className={styles.journalMotif}><span /><span /><span /></div>
    </div>} secondary={<Surface className={styles.authCard} tone="featured">{children}</Surface>} />
  </main>;
}

function LoginForm({ afterSignIn }: { afterSignIn?: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/sign-in", okResponseSchema, { method: "POST", body: json({ email, password }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); afterSignIn?.(); },
  });
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
    <TextField label={t("auth.email")} type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required />
    <PasswordField label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} minLength={6} required />
    <MutationError error={mutation.error} />
    <Button loading={mutation.isPending} type="submit">{t("auth.signIn")}</Button>
  </form>;
}

function ForcePasswordChange() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/change-password", okResponseSchema, { method: "POST", body: json({ password }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });
  return <AuthCard eyebrow={t("auth.requiredEyebrow")} title={t("auth.changePasswordTitle")} intro={t("auth.changePasswordIntro")}>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <PasswordField label={t("auth.newPassword")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} minLength={6} required />
      <MutationError error={mutation.error} />
      <Button loading={mutation.isPending} type="submit">{t("auth.savePassword")}</Button>
    </form>
  </AuthCard>;
}

function StatusExperience({ session }: { session: Extract<SessionResponse, { status: "signedIn" }> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation({ mutationFn: () => apiRequest("/api/auth/sign-out", okResponseSchema, { method: "POST" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }) });
  const restore = useMutation({
    mutationFn: (groupId: string) => apiRequest(`/api/groups/${groupId}/restore`, okResponseSchema, { method: "POST" }),
    onSuccess: async (_, groupId) => { await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate({ to: "/groups/$groupId", params: { groupId } }); },
  });
  return <AuthCard eyebrow={t("status.eyebrow")} title={t("status.title", { name: session.user.displayName })} intro={t("status.intro")}>
    <RestrictedNotices session={session} />
    <div className={styles.statusList}>
      {session.requests.map((request) => <StatusPanel key={request.groupId} tone={request.state === "rejected" ? "error" : "info"} title={request.groupName}>
        {request.state === "pending" ? t("status.pending") : t("status.notActive")}
      </StatusPanel>)}
      {!session.requests.length && <StatusPanel title={t("status.noRequests")} />}
      {session.deletedGroups.map((group) => <StatusPanel key={group.id} tone="error" title={group.name}>{t("status.deleted")}{group.role === "creator" && <Button variant="secondary" loading={restore.isPending} onClick={() => restore.mutate(group.id)}>{t("status.restore")}</Button>}</StatusPanel>)}
    </div>
    <Button variant="quiet" loading={signOut.isPending} onClick={() => signOut.mutate()}>{t("auth.signOut")}</Button>
  </AuthCard>;
}

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useQuery(sessionQueryOptions());
  useEffect(() => {
    if (session.data?.status !== "signedIn" || session.data.user.mustChangePassword || !session.data.groups.length) return;
    const remembered = localStorage.getItem(`wordinator:last-group:${session.data.user.id}`);
    const destination = session.data.groups.some((group) => group.id === remembered) ? remembered! : session.data.groups[0]!.id;
    void navigate({ to: "/groups/$groupId", params: { groupId: destination }, replace: true });
  }, [navigate, session.data]);
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("common.loading")} /></main>;
  if (session.isError) return <main className={styles.center}><ErrorState title={t("common.loadError")}>{t("errors.generic")}</ErrorState></main>;
  if (session.data.status === "signedOut") return <AuthCard eyebrow={t("eyebrow")} title={t("auth.welcomeTitle")} intro={t("auth.welcomeIntro")}><LoginForm /></AuthCard>;
  if (session.data.user.mustChangePassword) return <ForcePasswordChange />;
  if (!session.data.groups.length) return <StatusExperience session={session.data} />;
  return <main className={styles.center}><LoadingState label={t("common.loadingGroup")} /></main>;
}

export function InvitationPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions());
  const invitation = useQuery(invitationQueryOptions(token));
  const [mode, setMode] = useState<"register" | "signin">("register");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState("");
  const register = useMutation({
    mutationFn: () => apiRequest("/api/auth/register", okResponseSchema, { method: "POST", body: json({ invitationToken: token, email, password, displayName }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });
  const request = useMutation({
    mutationFn: () => apiRequest(`/api/invitations/${encodeURIComponent(token)}/request`, okResponseSchema, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });
  if (session.isPending || invitation.isPending) return <main className={styles.center}><LoadingState label={t("common.loadingInvitation")} /></main>;
  if (invitation.isError) return <main className={styles.center}><ErrorState title={t("invite.invalid")}>{t("errors.INVITATION_NOT_FOUND")}</ErrorState></main>;
  const signedInSession = session.data?.status === "signedIn" ? session.data : null;
  const existingRequest = signedInSession?.requests.find((item) => item.groupId === invitation.data.groupId);
  return <AuthCard eyebrow={t("invite.eyebrow")} title={t("invite.title", { group: invitation.data.groupName })} intro={t("invite.intro", { language: invitation.data.language === "nl" ? t("languages.nl") : t("languages.de") })}>
    {signedInSession ? <div className={styles.form}>
      {existingRequest?.state === "pending" ? <StatusPanel title={t("status.pending")}>{t("invite.pendingDetail")}</StatusPanel> : <>
        <p>{t("invite.signedInAs", { name: signedInSession.user.displayName })}</p>
        <MutationError error={request.error} /><Button loading={request.isPending} onClick={() => request.mutate()}>{t("invite.requestToJoin")}</Button>
      </>}
    </div> : mode === "signin" ? <><LoginForm /><Button variant="quiet" onClick={() => setMode("register")}>{t("invite.createAccountInstead")}</Button></> : <>
      <form className={styles.form} onSubmit={(event: FormEvent) => { event.preventDefault(); register.mutate(); }}>
        <TextField label={t("auth.displayName")} value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} required />
        <TextField label={t("auth.email")} type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required />
        <PasswordField label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} minLength={6} required />
        <MutationError error={register.error} /><Button loading={register.isPending} type="submit">{t("invite.register")}</Button>
      </form>
      <Button variant="quiet" onClick={() => setMode("signin")}>{t("invite.alreadyHaveAccount")}</Button>
    </>}
  </AuthCard>;
}

function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const navigate = useNavigate();
  const [name, setName] = useState(""); const [language, setLanguage] = useState<"nl" | "de">("nl");
  // `picked` is the person's original file; `icon` is the cropped output that will be uploaded after creation.
  const [picked, setPicked] = useState<File | null>(null); const [icon, setIcon] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/groups", createGroupResponseSchema, { method: "POST", body: json({ name, language }) }),
    onSuccess: async (data) => {
      if (icon) { const form = new FormData(); form.set("image", icon); await apiRequest(`/api/groups/${data.group.id}/icon`, imageResponseSchema, { method: "POST", body: form }); }
      await queryClient.invalidateQueries({ queryKey: ["session"] }); onClose(); await navigate({ to: "/groups/$groupId", params: { groupId: data.group.id } });
    },
  });
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
    <TextField label={t("group.name")} value={name} onChange={(event) => setName(event.currentTarget.value)} required />
    <SelectField label={t("group.language")} value={language} onChange={(value) => setLanguage(value as "nl" | "de")} data={[{ value: "nl", label: t("languages.nl") }, { value: "de", label: t("languages.de") }]} />
    <FileInput label={t("group.iconOptional")} accept="image/png,image/jpeg,image/webp" value={picked} onChange={(file) => { setPicked(file); setIcon(null); }} clearable />
    <ImageCropper file={picked && !icon ? picked : null} output={SQUARE_OUTPUT} onCancel={() => setPicked(null)} onConfirm={setIcon} />
    <MutationError error={mutation.error} /><div className={styles.actions}><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button loading={mutation.isPending} type="submit">{t("group.create")}</Button></div>
  </form>;
}

export function GroupPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation(); const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const session = useQuery(sessionQueryOptions());
  const shell = useQuery({ ...groupQueryOptions(groupId), enabled: session.data?.status === "signedIn" });
  useEffect(() => { if (session.data?.status === "signedOut") void navigate({ to: "/", replace: true }); }, [navigate, session.data]);
  useEffect(() => { if (session.data?.status === "signedIn") localStorage.setItem(`wordinator:last-group:${session.data.user.id}`, groupId); }, [groupId, session.data]);
  if (session.isPending || shell.isPending) return <main className={styles.center}><LoadingState label={t("common.loadingGroup")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (session.data.user.mustChangePassword) return <ForcePasswordChange />;
  if (shell.isError) return <main className={styles.center}><ErrorState title={t("group.unavailable")}><Link to="/">{t("common.goHome")}</Link></ErrorState></main>;
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.journal} id="journal">
      <PageHeader eyebrow={shell.data.group.iconUrl ? <Avatar name={shell.data.group.name} src={shell.data.group.iconUrl} /> : <LabelChip>{shell.data.group.icon} {shell.data.group.language.toUpperCase()}</LabelChip>} title={shell.data.group.name} intro={t("group.shellIntro")} actions={<Button variant="secondary" onClick={() => setCreating((value) => !value)}>{t("group.createAnother")}</Button>} />
      {shell.data.pendingRequestCount > 0 && <p className={styles.requestNotice}><Link to="/groups/$groupId/settings/members" params={{ groupId }}>{t("group.requestsWaiting", { count: shell.data.pendingRequestCount })}</Link></p>}
      {creating && <Surface><h2>{t("group.createTitle")}</h2><CreateGroupForm onClose={() => setCreating(false)} /></Surface>}
      <Feed groupId={groupId} session={session.data} />
      <Surface><h2>{t("group.invitation")}</h2><p>{t("group.invitationHelp")}</p><code className={styles.invitePath}>{`${location.origin}/invite/${shell.data.invitationToken}`}</code></Surface>
    </div>
  </GroupFrame>;
}
