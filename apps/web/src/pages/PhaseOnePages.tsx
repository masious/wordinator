import {
  okResponseSchema,
  type SessionResponse,
} from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, groupQueryOptions, invitationQueryOptions, sessionQueryOptions } from "../api";
import { Button, ErrorState, Eyebrow, LoadingState, PageHeader, PasswordField, StatusPanel, Surface, TextField } from "../ui";
import styles from "./PhaseOnePages.module.css";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { Feed } from "./PhaseThreePages";
import { RestrictedNotices } from "./PhaseSixPages";
import { CreateGroupForm } from "../organisms/CreateGroupForm/CreateGroupForm";
import { AvatarEditor } from "../molecules/AvatarEditor";

const json = (value: unknown) => JSON.stringify(value);

function MutationError({ error }: { error: Error | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  const message = error instanceof ApiError
    ? t(`errors.${error.code}`, { defaultValue: t("errors.generic") })
    : t("errors.generic");
  return <p className={styles.formError} role="alert">{message}</p>;
}

function AuthCard({ children, eyebrow, title, intro, story }: { children: ReactNode; eyebrow: string; title: string; intro: string; story?: ReactNode }) {
  const { t } = useTranslation();
  return <main className={styles.authPage}>
    <div className={styles.authColumn}>
      <div className={styles.brand}>
        <span aria-hidden="true" className={styles.brandMark}><span /><span /><span /></span>
        <span>{t("brand")}</span>
      </div>
      <Surface className={styles.authCard}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className={styles.authTitle}>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        {children}
      </Surface>
      {story && <div className={styles.authStory}>{story}</div>}
    </div>
  </main>;
}

const practiceFocusAreas = ["grammar", "vocabulary", "listening", "progress"] as const;

function PracticeFocus() {
  const { t } = useTranslation();
  return <section className={styles.focus} aria-labelledby="home-focus-title">
    <h2 id="home-focus-title" className={styles.focusTitle}>{t("home.focusTitle")}</h2>
    <ul className={styles.focusList}>
      {practiceFocusAreas.map((area) => <li key={area} className={styles.focusItem}>
        <span className={styles.focusName}>{t(`home.focus.${area}.title`)}</span>
        <span className={styles.focusDetail}>{t(`home.focus.${area}.detail`)}</span>
      </li>)}
    </ul>
  </section>;
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

function SignupForm({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/register", okResponseSchema, { method: "POST", body: json({ email, password }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });
  return <>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <TextField label={t("auth.email")} type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required />
      <PasswordField label={t("auth.password")} value={password} onChange={(event) => setPassword(event.currentTarget.value)} minLength={6} required />
      <MutationError error={mutation.error} />
      <Button loading={mutation.isPending} type="submit">{t("auth.createAccount")}</Button>
    </form>
    <Button variant="quiet" onClick={onSignIn}>{t("auth.haveAccount")}</Button>
  </>;
}

function OnboardingSetup({ session }: { session: Extract<SessionResponse, { status: "signedIn" }> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const complete = useMutation({
    mutationFn: () => apiRequest("/api/auth/complete-onboarding", okResponseSchema, { method: "POST", body: json({ username }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });
  return <AuthCard eyebrow={t("onboarding.eyebrow")} title={t("onboarding.title")} intro={t("onboarding.intro")}>
    <form className={styles.setupForm} onSubmit={(event) => { event.preventDefault(); complete.mutate(); }}>
      <AvatarEditor name={username || t("onboarding.fallbackName")} src={session.user.avatarUrl} onChanged={() => queryClient.invalidateQueries({ queryKey: ["session"] })} />
      <p className={styles.avatarHint}>{t("onboarding.avatarHint")}</p>
      <TextField label={t("onboarding.username")} description={t("onboarding.usernameHelp")} value={username} minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" autoComplete="username" onChange={(event) => setUsername(event.currentTarget.value)} required />
      <MutationError error={complete.error} />
      <Button loading={complete.isPending} type="submit">{t("onboarding.continue")}</Button>
    </form>
  </AuthCard>;
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
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  useEffect(() => {
    if (session.data?.status !== "signedIn" || session.data.user.mustChangePassword || session.data.user.onboardingComplete === false || !session.data.groups.length) return;
    void navigate({ to: "/courses", replace: true });
  }, [navigate, session.data]);
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("common.loading")} /></main>;
  if (session.isError) return <main className={styles.center}><ErrorState title={t("common.loadError")}>{t("errors.generic")}</ErrorState></main>;
  if (session.data.status === "signedOut") return <AuthCard eyebrow={t("home.eyebrow")} story={<PracticeFocus />} title={authMode === "signup" ? t("auth.signupTitle") : t("auth.welcomeTitle")} intro={authMode === "signup" ? t("auth.signupIntro") : t("auth.welcomeIntro")}>
    {authMode === "signup" ? <SignupForm onSignIn={() => setAuthMode("signin")} /> : <><LoginForm /><Button variant="quiet" onClick={() => setAuthMode("signup")}>{t("auth.needAccount")}</Button></>}
  </AuthCard>;
  if (session.data.user.mustChangePassword) return <ForcePasswordChange />;
  if (session.data.user.onboardingComplete === false) return <OnboardingSetup session={session.data} />;
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

export function JournalPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  if (session.isPending) return <main className={styles.center}><LoadingState label={t("journal.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  return <GroupFrame groupId={groupId} session={session.data}>
    <div className={styles.journal} id="journal">
      <h1 className={styles.mobileTitle}>{t("journal.title")}</h1>
      <PageHeader className={styles.journalHero} eyebrow={<Eyebrow>{t("journal.eyebrow")}</Eyebrow>} title={t("journal.title")} intro={t("journal.intro")} />
      <Feed groupId={groupId} session={session.data} />
    </div>
  </GroupFrame>;
}
