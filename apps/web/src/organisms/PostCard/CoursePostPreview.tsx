import type { PostCourse } from "@wordinator/contracts";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowIcon } from "../../ui";
import styles from "./CoursePostPreview.module.css";

// The system-created feed card for a course's first publication. It links to the course while the viewer may open it.
export default function CoursePostPreview({ course, groupId }: { course: PostCourse; groupId: string }) {
  const { t } = useTranslation();
  if (!course.available || !course.title)
    return <div className={styles.unavailable} role="note">{t("posts.courseUnavailable")}</div>;
  return (
    <Link className={styles.preview} to="/groups/$groupId/courses/$courseId" params={{ groupId, courseId: course.id }}>
      <div className={styles.cover} aria-hidden="true">
        {course.coverUrl ? <img src={course.coverUrl} alt="" /> : <span>{course.title.slice(0, 1)}</span>}
      </div>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>{t("posts.coursePublished")}</span>
        <h3>{course.title}</h3>
        {course.level && <span className={styles.level}>{course.level}</span>}
        {course.summary && <p className={styles.summary}>{course.summary}</p>}
        <span className={styles.open}>{t("posts.openCourse")}<ArrowIcon /></span>
      </div>
    </Link>
  );
}
