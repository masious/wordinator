import { okResponseSchema } from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ApiError, apiRequest, sessionQueryOptions, settingsQueryOptions } from "../api";
import { Button, ErrorState, Eyebrow, LoadingState, PageHeader, PasswordField, SectionHeader, Surface, TextAreaField, TextField, ThemePreferenceControl } from "../ui";
import { AvatarEditor } from "../molecules/AvatarEditor";
import { RecognizerPreferenceControl } from "../molecules/RecognizerPreferenceControl";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { TutorSettings } from "../organisms/Tutor/TutorSettings";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./SettingsPages.module.css";

const json = (value: unknown) => JSON.stringify(value);

function Message({ error, success }: { error: Error | null; success: boolean }) {
  const { t } = useTranslation();
  if (error) {
    const code = error instanceof ApiError ? error.code : "generic";
    return <p className={styles.error} role="alert">{t(`errors.${code}`, { defaultValue: t("errors.generic") })}</p>;
  }
  return success ? <p className={styles.success}>{t("settings.saved")}</p> : null;
}

export function AccountSettingsPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions());
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

  if (session.isPending || settings.isPending) return <main className={shellStyles.center}><LoadingState label={t("settings.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (settings.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("settings.unavailable")}>{t("errors.generic")}</ErrorState></GroupFrame>;

  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.settingsPage}>
    <PageHeader eyebrow={<Eyebrow>{t("settings.accountEyebrow")}</Eyebrow>} title={t("settings.title")} intro={t("settings.accountIntro")} />
    <div className={styles.settingsGrid}>
      <Surface className={styles.settingsPanel}><SectionHeader title={t("settings.profileTitle")} />
        <div className={styles.profileIdentity}>
          <AvatarEditor size="medium" name={settings.data.displayName} src={settings.data.avatarUrl} onChanged={() => Promise.all([queryClient.invalidateQueries({ queryKey: ["settings"] }), queryClient.invalidateQueries({ queryKey: ["session"] })])} />
          <div className={styles.profileName}>
            <strong>{settings.data.displayName}</strong>
            <p>{session.data.user.username && <span>{t("settings.handle", { username: session.data.user.username })}</span>}<span>{settings.data.email}</span></p>
          </div>
        </div>
        <form className={styles.form} onSubmit={(event: FormEvent) => { event.preventDefault(); account.mutate(); }}>
        <TextField label={t("auth.displayName")} value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.currentTarget.value)} required />
        <TextAreaField label={t("settings.bio")} description={t("settings.bioHelp")} value={bio} maxLength={500} minRows={4} autosize onChange={(event) => setBio(event.currentTarget.value)} />
        <fieldset className={styles.reactions}><legend>{t("settings.reactions")}</legend><p className={styles.muted}>{t("settings.reactionsHelp")}</p><div className={styles.reactionGrid}>{reactions.map((reaction, index) => <TextField key={index} aria-label={t("settings.reactionLabel", { number: index + 1 })} value={reaction} onChange={(event) => {
          const nextReaction = event.currentTarget.value;
          setReactions((values) => values.map((value, current) => current === index ? nextReaction : value));
        }} required />)}</div></fieldset>
        <div className={styles.actions}><Button loading={account.isPending} type="submit">{t("settings.saveProfile")}</Button><Message error={account.error} success={account.isSuccess} /></div>
      </form></Surface>
      <div className={styles.settingsRail}>
        <Surface className={styles.settingsPanel} tone="inset"><SectionHeader title={t("settings.noticesTitle")} description={t("settings.noticesIntro")} />
          <Link className={styles.settingsLink} to="/notifications"><Bell size={16} aria-hidden="true" />{t("settings.openNotices")}</Link></Surface>
        {session.data.user.isSuperuser === true && <Surface className={styles.settingsPanel} tone="inset"><SectionHeader title={t("analytics.settingsLinkTitle")} description={t("analytics.settingsLinkBody")} />
          <Link className={styles.settingsLink} to="/admin/analytics">{t("analytics.settingsLink")}</Link></Surface>}
        <Surface className={styles.settingsPanel}><ThemePreferenceControl /></Surface>
        <Surface className={styles.settingsPanel}><RecognizerPreferenceControl /></Surface>
        <Surface className={styles.settingsPanel}><TutorSettings /></Surface>
        <Surface className={styles.settingsPanel}><SectionHeader title={t("settings.passwordTitle")} /><form className={styles.form} onSubmit={(event) => { event.preventDefault(); password.mutate(); }}>
          <PasswordField label={t("settings.currentPassword")} value={currentPassword} minLength={6} onChange={(event) => setCurrentPassword(event.currentTarget.value)} required />
          <PasswordField label={t("auth.newPassword")} value={newPassword} minLength={6} onChange={(event) => setNewPassword(event.currentTarget.value)} required />
          <div className={styles.actions}><Button loading={password.isPending} type="submit">{t("settings.savePassword")}</Button><Message error={password.error} success={password.isSuccess} /></div>
        </form></Surface>
        {/* Noto's animated emoji (the lesson index's category badges) are CC BY 4.0, which asks for this credit. */}
        <Surface className={styles.settingsPanel} tone="inset"><SectionHeader title={t("settings.creditsTitle")} />
          <p className={styles.muted}><Trans i18nKey="settings.creditsNoto" components={{
            noto: <a href="https://googlefonts.github.io/noto-emoji-animation/" target="_blank" rel="noreferrer" />,
            licence: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" />,
          }} /></p></Surface>
      </div>
    </div>
  </div></GroupFrame>;
}
