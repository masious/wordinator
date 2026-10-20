import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import styles from "./NotFoundPage.module.css";

// Rendered by the router for any URL without a route (router.ts defaultNotFoundComponent).
export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>{t("common.notFoundTitle")}</h1>
        <p>{t("common.notFoundBody")}</p>
        <Link className={styles.action} to="/courses">{t("courses.backToLibrary")}</Link>
      </section>
    </main>
  );
}
