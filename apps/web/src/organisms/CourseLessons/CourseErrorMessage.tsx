import { useTranslation } from "react-i18next";
import { ApiError } from "../../api";
import styles from "./CourseLessons.module.css";

// Course errors are translated by API error code so every course surface shares the same copy.
export function CourseErrorMessage({ error }: { error: Error | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : "generic";
  return <p className={styles.error} role="alert">{t(`errors.${code}`, { defaultValue: t("errors.generic") })}</p>;
}
