import { healthResponseSchema } from "@wordinator/contracts";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, LabelChip, StatusPanel, Surface } from "../ui";
import styles from "./FoundationPage.module.css";

type ApiState = "checking" | "ready" | "error";

export function FoundationPage() {
  const { t } = useTranslation();
  const [apiState, setApiState] = useState<ApiState>("checking");

  const checkApi = useCallback(async () => {
    setApiState("checking");
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("Health request failed");
      healthResponseSchema.parse(await response.json());
      setApiState("ready");
    } catch {
      setApiState("error");
    }
  }, []);

  useEffect(() => {
    void checkApi();
  }, [checkApi]);

  return (
    <main className={styles.page}>
      <Surface className={styles.card}>
        <LabelChip>{t("eyebrow")}</LabelChip>
        <h1 className={styles.heading}>{t("heading")}</h1>
        <p className={styles.intro}>{t("introduction")}</p>
        <div className={styles.statusRow}>
          {apiState === "checking" && <StatusPanel title={t("checkingApi")} />}
          {apiState === "ready" && <StatusPanel tone="success" title={t("apiReady")} />}
          {apiState === "error" && (
            <StatusPanel tone="error" title={t("apiUnavailable")}>
              <Button onClick={() => void checkApi()}>{t("retry")}</Button>
            </StatusPanel>
          )}
        </div>
      </Surface>
    </main>
  );
}
