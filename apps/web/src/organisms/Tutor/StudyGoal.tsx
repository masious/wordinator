import { DAILY_GOAL_MINUTES_MAX, DAILY_GOAL_MINUTES_MIN, learningGoalSchema } from "@wordinator/contracts/learning";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, learningGoalQueryOptions } from "../../api";
import { Button, CheckboxField, LoadingState, TextField } from "../../ui";
import styles from "./StudyGoal.module.css";

const DEFAULT_GOAL_MINUTES = 15;

// The Study goal block of Settings (docs/settings-and-administration.md#tutor-settings, docs/learning-time.md#daily-goal-and-streak):
// minutes a day from 5 to 240, or no goal, saved with its own button.
export function StudyGoal() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const goal = useQuery(learningGoalQueryOptions());
  const [enabled, setEnabled] = useState(false);
  const [minutes, setMinutes] = useState(String(DEFAULT_GOAL_MINUTES));
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!goal.data) return;
    setEnabled(goal.data.dailyGoalMinutes !== null);
    setMinutes(String(goal.data.dailyGoalMinutes ?? DEFAULT_GOAL_MINUTES));
  }, [goal.data]);
  const save = useMutation({
    mutationFn: (dailyGoalMinutes: number | null) => apiRequest("/api/learning/goal", learningGoalSchema, { method: "PUT", body: JSON.stringify({ dailyGoalMinutes }) }),
    onSuccess: (saved) => queryClient.setQueryData(learningGoalQueryOptions().queryKey, saved),
  });

  if (goal.isPending) return <LoadingState label={t("studyGoal.loading")} />;
  if (goal.isError) return <p className={styles.error} role="alert">{t("studyGoal.unavailable")}</p>;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!enabled) { setProblem(null); save.mutate(null); return; }
    const value = minutes.trim();
    const whole = /^\d+$/.test(value) ? Number(value) : null;
    if (whole === null || whole < DAILY_GOAL_MINUTES_MIN || whole > DAILY_GOAL_MINUTES_MAX) { setProblem(t("studyGoal.invalid")); return; }
    setProblem(null);
    save.mutate(whole);
  };
  const message = problem ?? (save.isError ? t("errors.generic") : null);

  return <section className={styles.block} aria-labelledby="study-goal-title">
    <h3 id="study-goal-title" className={styles.title}>{t("studyGoal.title")}</h3>
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.muted}>{t("studyGoal.help")}</p>
      <CheckboxField label={t("studyGoal.enable")} checked={enabled} onChange={(event) => { setEnabled(event.currentTarget.checked); setProblem(null); save.reset(); }} />
      <TextField label={t("studyGoal.minutes")} description={t("studyGoal.minutesHelp")} inputMode="numeric" value={minutes} disabled={!enabled}
        onChange={(event) => { setMinutes(event.currentTarget.value); setProblem(null); }} />
      <div className={styles.actions}>
        {message && <p className={styles.error} role="alert">{message}</p>}
        {save.isSuccess && !problem && <p className={styles.success}>{t("settings.saved")}</p>}
        <Button type="submit" loading={save.isPending}>{t("studyGoal.save")}</Button>
      </div>
    </form>
  </section>;
}
