
import {
  ApiError,
} from "../api";
import { useTranslation } from "react-i18next";
import styles from "./ErrorMessage.module.css";


export default function ErrorMessage({ error }: { error: Error | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <p className={styles.error} role="alert">
      {error instanceof ApiError ? error.message : t("errors.generic")}
    </p>
  );
}
