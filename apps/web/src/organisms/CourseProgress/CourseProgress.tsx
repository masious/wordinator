import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { courseProgressQueryOptions } from "../../api";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Avatar, SectionHeader, Surface } from "../../ui";
import styles from "./CourseProgress.module.css";

// The viewer's share of the published lessons they finished in the lesson player. Nothing here is graded.
export function CourseProgress({ groupId, courseId, accountId }: { groupId: string; courseId: string; accountId: string }) {
  const { t } = useTranslation();
  const progress = useQuery(courseProgressQueryOptions(groupId, courseId));
  if (!progress.data?.publishedLessons) return null;
  const { participants, publishedLessons } = progress.data;
  const viewer = participants.find((entry) => entry.user.id === accountId);
  if (!viewer) return null;
  return <Surface className={styles.panel}>
    <SectionHeader title={t("courses.progress.title")} description={t("courses.progress.help")} />
    <ul className={styles.rows}>
      {[viewer].map((entry) => {
        const name = t("courses.progress.you", { name: entry.user.displayName });
        return <li key={entry.user.id} className={styles.row} data-viewer>
          <Avatar name={entry.user.displayName} src={entry.user.avatarUrl ?? undefined} />
          <div className={styles.detail}>
            <div className={styles.line}>
              <strong>{name}</strong>
              <span className={styles.percent}>{t("courses.progress.percent", { percent: entry.percent })}</span>
            </div>
            <ProgressMeter value={entry.percent} size="compact" label={t("courses.progress.memberLabel", { name: entry.user.displayName })} />
            <span className={styles.count}>{t("courses.progress.lessons", { completed: entry.completedLessons, total: publishedLessons })}</span>
          </div>
        </li>;
      })}
    </ul>
  </Surface>;
}
