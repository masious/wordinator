import type { LessonPublishProblem } from "@wordinator/contracts/lesson-document";
import { useTranslation } from "react-i18next";
import { Button, LabelChip } from "../../ui";
import { CourseErrorMessage } from "../CourseLessons/CourseErrorMessage";
import type { SaveStatus } from "./useLessonAutosave";
import styles from "./LessonEditor.module.css";

// The bar above the editor: save state, whether readers see the latest draft, who edited last, and the owner's actions.
// Contributors see no publishing actions; their work stays a draft until the owner publishes it.
export function LessonPublishBar({ owner, published, changed, status, editorName, problems, error, busy, onPublish, onDiscard, onUnpublish, onFocusProblem, onDone }: {
  owner: boolean; published: boolean; changed: boolean; status: SaveStatus; editorName: string; problems: LessonPublishProblem[]; error: Error | null;
  busy: "publish" | "discard" | "unpublish" | "done" | null;
  onPublish: () => void; onDiscard: () => void; onUnpublish: () => void; onFocusProblem: (problem: LessonPublishProblem) => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  // A draft that differs from what readers see, or a lesson nobody can read yet, has something to publish.
  const publishable = !published || changed || status === "pending" || status === "saving";
  return <div className={styles.bar} role="region" aria-label={t("courses.editor.barLabel")}>
    <div className={styles.barStatus}>
      <span className={styles.saveState} data-status={status} role="status">{t(`courses.editor.status.${status}`)}</span>
      {!published ? <LabelChip>{t("courses.lessons.unpublished")}</LabelChip> : changed && <LabelChip>{t("courses.lessons.changed")}</LabelChip>}
      <span className={styles.attribution}>{t("courses.lessons.updatedBy", { name: editorName })}</span>
    </div>
    {!owner && <p className={styles.help}>{t("courses.editor.contributorHelp")}</p>}
    <div className={styles.barActions}>
      {owner && <>
        {published && changed && <Button variant="quiet" loading={busy === "discard"} disabled={busy !== null} onClick={onDiscard}>{t("courses.editor.discard")}</Button>}
        {published && <Button variant="quiet" loading={busy === "unpublish"} disabled={busy !== null} onClick={onUnpublish}>{t("courses.editor.unpublish")}</Button>}
        <Button variant="primary" loading={busy === "publish"} disabled={busy !== null || !publishable || status === "conflict" || status === "invalid"} onClick={onPublish}>
          {published ? t("courses.editor.publishChanges") : t("courses.editor.publish")}
        </Button>
      </>}
      <Button variant="secondary" loading={busy === "done"} disabled={busy !== null && busy !== "done"} onClick={onDone}>{t("courses.editor.done")}</Button>
    </div>
    {problems.length > 0 && <div className={styles.problems} role="alert">
      <p>{t("courses.editor.problemsTitle")}</p>
      <ul>{problems.map((problem) => <li key={`${problem.blockId}-${problem.wordId ?? ""}-${problem.problem}`}>
        <button type="button" onClick={() => onFocusProblem(problem)}>{t(`courses.editor.problems.${problem.problem}`)}</button>
      </li>)}</ul>
    </div>}
    <CourseErrorMessage error={error} />
  </div>;
}
