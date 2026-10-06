import type { PostCourse } from "@wordinator/contracts";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowIcon } from "../../ui";
import styles from "./CoursePostPreview.module.css";

// The system-created feed card for a course's first publication. On the post page it links to the course while the viewer may open it;
// in the feed it sits inside the card's link to the post, so it renders without a link of its own.
export default function CoursePostPreview({ course, groupId, linked = true }: { course: PostCourse; groupId: string; linked?: boolean }) {
  const { t } = useTranslation();
  if (!course.available || !course.title)
    return <div className={styles.unavailable} role="note">{t("posts.courseUnavailable")}</div>;
  const content = (
    <>
      <div className={styles.cover} aria-hidden="true">
        {course.coverUrl ? <img src={course.coverUrl} alt="" /> : <span>{course.title.slice(0, 1)}</span>}
      </div>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>{t("posts.coursePublished")}</span>
        <h3>{course.title}</h3>
        {course.level && <span className={styles.level}>{course.level}</span>}
        {course.summary && <p className={styles.summary}>{course.summary}</p>}
        {linked && <span className={styles.open}>{t("posts.openCourse")}<ArrowIcon /></span>}
      </div>
    </>
  );
  return linked
    ? <Link className={styles.preview} to="/groups/$groupId/courses/$courseId" params={{ groupId, courseId: course.id }}>{content}</Link>
    : <div className={styles.preview}>{content}</div>;
}
