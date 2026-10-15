import { SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { browserRecognitionSupported, effectiveRecognizer, setRecognizer, useRecognizerPreference, type Recognizer } from "./speechRecognition";
import styles from "./RecognizerPreferenceControl.module.css";

// Which recognizer hears spoken answers on this device (docs/words.md#recognizers). The browser's own is the default; where the
// browser has none, the status line says Microsoft is used instead.
export function RecognizerPreferenceControl() {
  const { t } = useTranslation();
  const preference = useRecognizerPreference();
  const effective = effectiveRecognizer(preference);
  const status = effective === null ? t("speak.recognizer.none")
    : preference === "browser" && !browserRecognitionSupported() ? t("speak.recognizer.fallback")
    : t(`speak.recognizer.${effective}Status`);
  return <fieldset className={styles.fieldset}>
    <legend>{t("speak.recognizer.title")}</legend>
    <p className={styles.description}>{t("speak.recognizer.description")}</p>
    <SegmentedControl aria-label={t("speak.recognizer.label")} className={styles.control} fullWidth value={preference}
      data={[{ label: t("speak.recognizer.browser"), value: "browser" }, { label: t("speak.recognizer.microsoft"), value: "microsoft" }]}
      onChange={(value) => setRecognizer(value as Recognizer)} />
    <p aria-live="polite" className={styles.status}>{status}</p>
  </fieldset>;
}
