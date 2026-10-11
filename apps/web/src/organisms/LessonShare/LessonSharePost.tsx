import { hasAuthorsVersion, POST_NOTES_MAX, postResponseSchema, type LessonShareQuestionSnapshot, type Post, type UpdateLessonShareRequest } from "@wordinator/contracts";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../api";
import ErrorMessage from "../../molecules/ErrorMessage";
import { Button, TextAreaField } from "../../ui";
import { AnswerField, practiceDraftKey, readAnswers, storeAnswers, type AnswerSubmit } from "../CourseLessons/PracticeBlock";
import styles from "./LessonShare.module.css";

// A share post on its post page (docs/lesson-shares.md): the private answer check of a shared question, and the note-only edit.

// The lesson's answer check against the author's version saved in the snapshot. It runs on this device only: the answer is kept as
// a local `share-answer` draft with the post as target and is never sent anywhere.
export function ShareAnswerCheck({ postId, groupId, accountId, question }: { postId: string; groupId: string; accountId: string; question: LessonShareQuestionSnapshot }) {
  const { t } = useTranslation();
  const headingId = useId();
  const key = practiceDraftKey(accountId, groupId, "share-answer", postId);
  const [answer, setAnswer] = useState(() => readAnswers(key, 1)[0] ?? "");
  const submit: AnswerSubmit = useRef(null);
  useEffect(() => { storeAnswers(key, [answer]); }, [answer, key]);
  return <section className={styles.check} aria-labelledby={headingId}>
    <h2 id={headingId} className={styles.eyebrow}>{t("lessonShares.tryIt")}</h2>
    {hasAuthorsVersion(question)
      ? <>
        <AnswerField question={question} label={t("lessonShares.answerLabel")} description={t("lessonShares.answerHelp")} value={answer} onChange={setAnswer} minRows={2} submitRef={submit} />
        <Button variant="secondary" className={styles.checkButton} onClick={() => submit.current?.()}>{t("lessonShares.check")}</Button>
      </>
      : <p className={styles.help}>{t("lessonShares.noAuthorsVersion")}</p>}
  </section>;
}

// Editing a share post changes only its note; the shared piece is fixed.
export function ShareNoteForm({ post, groupId, onCancel, onDone }: { post: Post; groupId: string; onCancel: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState(post.notes ?? "");
  const save = useMutation({
    mutationFn: () => {
      const body: UpdateLessonShareRequest = { type: "lesson_share", notes: note.trim() || null };
      return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(post.id)}`, postResponseSchema, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: onDone,
  });
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };
  return <form className={styles.form} onSubmit={submit}>
    <p className={styles.help}>{t("lessonShares.editHelp")}</p>
    <TextAreaField label={t("lessonShares.note")} description={t("lessonShares.noteHelp")} value={note} maxLength={POST_NOTES_MAX} autosize minRows={3}
      onChange={(event) => setNote(event.currentTarget.value)} />
    <ErrorMessage error={save.error} />
    <div className={styles.actions}>
      <Button variant="quiet" onClick={onCancel}>{t("common.cancel")}</Button>
      <Button type="submit" loading={save.isPending}>{t("posts.saveEdit")}</Button>
    </div>
  </form>;
}
