import { TUTOR_GOALS_MAX, TUTOR_NATIVE_LANGUAGES, tutorProfileResponseSchema, type UpdateTutorProfileRequest } from "@wordinator/contracts/tutor";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, tutorProfileQueryOptions } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { Button, ConfirmDialog, LoadingState, SectionHeader, SelectField, TextAreaField } from "../../ui";
import styles from "./TutorSettings.module.css";

type ReplyLanguage = UpdateTutorProfileRequest["replyLanguage"];

// The Tutor section of Settings (docs/settings-and-administration.md#tutor-settings): native language, reply language, and goals,
// saved with their own button; the tutor's notes, read-only with a confirmed Clear notes; and the provider privacy notice.
export function TutorSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profile = useQuery(tutorProfileQueryOptions());
  const [nativeLanguage, setNativeLanguage] = useState<UpdateTutorProfileRequest["nativeLanguage"]>("en");
  const [replyLanguage, setReplyLanguage] = useState<ReplyLanguage>("native");
  const [goals, setGoals] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  useEffect(() => {
    if (!profile.data) return;
    setNativeLanguage(profile.data.profile.nativeLanguage); setReplyLanguage(profile.data.profile.replyLanguage); setGoals(profile.data.profile.goals ?? "");
  }, [profile.data]);
  const save = useMutation({
    mutationFn: () => apiRequest("/api/ai/profile", tutorProfileResponseSchema, { method: "PUT", body: JSON.stringify({ nativeLanguage, replyLanguage, goals: goals.trim() || null }) }),
    onSuccess: (response) => queryClient.setQueryData(tutorProfileQueryOptions().queryKey, response),
  });
  const clear = useMutation({
    mutationFn: () => apiRequest("/api/ai/profile/notes", tutorProfileResponseSchema, { method: "DELETE" }),
    onSuccess: (response) => { queryClient.setQueryData(tutorProfileQueryOptions().queryKey, response); setClearOpen(false); },
  });
  if (profile.isPending) return <LoadingState label={t("tutorSettings.loading")} />;
  if (profile.isError) return <><SectionHeader title={t("tutorSettings.title")} /><p className={styles.error} role="alert">{t("tutorSettings.unavailable")}</p></>;
  const notes = profile.data.profile.notes;
  return <div className={styles.section}>
    <SectionHeader title={t("tutorSettings.title")} description={t("tutorSettings.intro")} />
    <form className={styles.form} onSubmit={(event: FormEvent) => { event.preventDefault(); save.mutate(); }}>
      <SelectField label={t("tutorSettings.nativeLanguage")} value={nativeLanguage} allowDeselect={false}
        data={TUTOR_NATIVE_LANGUAGES.map((code) => ({ value: code, label: t(`tutorSettings.languages.${code}`) }))}
        onChange={(value) => { if (value) setNativeLanguage(value as typeof nativeLanguage); }} />
      <SelectField label={t("tutorSettings.replyLanguage")} value={replyLanguage} allowDeselect={false}
        data={(["native", "target", "mixed"] as const).map((value) => ({ value, label: t(`tutorSettings.reply.${value}`) }))}
        onChange={(value) => { if (value) setReplyLanguage(value as ReplyLanguage); }} />
      <TextAreaField label={t("tutorSettings.goals")} description={t("tutorSettings.goalsHelp")} value={goals} maxLength={TUTOR_GOALS_MAX} autosize minRows={2}
        onChange={(event) => setGoals(event.currentTarget.value)} />
      <div className={styles.actions}>
        {save.isError && <p className={styles.error} role="alert">{t("errors.generic")}</p>}
        {save.isSuccess && <p className={styles.success}>{t("settings.saved")}</p>}
        <Button type="submit" loading={save.isPending}>{t("tutorSettings.save")}</Button>
      </div>
    </form>
    <div className={styles.notes}>
      <h3>{t("tutorSettings.notes")}</h3>
      {notes ? <p className={styles.notesText}><PlainText>{notes}</PlainText></p> : <p className={styles.muted}>{t("tutorSettings.noNotes")}</p>}
      {notes && <Button variant="secondary" onClick={() => setClearOpen(true)}>{t("tutorSettings.clearNotes")}</Button>}
    </div>
    <p className={styles.privacy}>{t("tutor.privacy")}</p>
    <ConfirmDialog opened={clearOpen} onClose={() => setClearOpen(false)} title={t("tutorSettings.clearNotesTitle")} confirmLabel={t("tutorSettings.clearNotes")}
      cancelLabel={t("common.cancel")} confirmLoading={clear.isPending} onConfirm={() => clear.mutate()}>
      {t("tutorSettings.clearNotesBody")}
      {clear.isError && <p className={styles.error} role="alert">{t("errors.generic")}</p>}
    </ConfirmDialog>
  </div>;
}
