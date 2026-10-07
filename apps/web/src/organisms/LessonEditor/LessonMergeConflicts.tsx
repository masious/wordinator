import type { LessonBlock } from "@wordinator/contracts/lesson-document";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui";
import { LessonBlocks } from "../LessonDocument/LessonDocument";
import type { MergeConflict } from "./lessonMerge";
import styles from "./LessonEditor.module.css";

export type MergeChoice = "mine" | "theirs";

// Blocks both editors changed after a merge, each shown side by side so the author picks one version.
export function LessonMergeConflicts({ conflicts, onChoose, onShow }: {
  conflicts: MergeConflict[]; onChoose: (conflict: MergeConflict, choice: MergeChoice) => void; onShow: (blockId: string) => void;
}) {
  const { t } = useTranslation();
  if (!conflicts.length) return null;
  const version = (label: string, block: LessonBlock | null) => <figure className={styles.mergeVersion}>
    <figcaption className={styles.blockLabel}>{label}</figcaption>
    {block ? <LessonBlocks blocks={[block]} /> : <p className={styles.help}>{t("courses.editor.merge.deleted")}</p>}
  </figure>;
  return <section className={styles.conflict} role="alert" aria-label={t("courses.editor.merge.label")}>
    <p>{t("courses.editor.merge.title", { count: conflicts.length })}</p>
    <p>{t("courses.editor.merge.body")}</p>
    {conflicts.map((conflict) => <div key={conflict.blockId} className={styles.mergeItem} data-testid="merge-conflict">
      <div className={styles.mergeVersions}>
        {version(t("courses.editor.merge.theirs"), conflict.server)}
        {version(t("courses.editor.merge.mine"), conflict.local)}
      </div>
      <div className={styles.actions}>
        <Button variant="quiet" onClick={() => onShow(conflict.blockId)}>{t("courses.editor.merge.show")}</Button>
        <Button variant="secondary" onClick={() => onChoose(conflict, "theirs")}>{t("courses.editor.merge.keepTheirs")}</Button>
        <Button variant="secondary" onClick={() => onChoose(conflict, "mine")}>{t("courses.editor.merge.keepMine")}</Button>
      </div>
    </div>)}
  </section>;
}
