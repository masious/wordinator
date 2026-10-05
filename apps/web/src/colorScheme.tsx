import { SegmentedControl, useComputedColorScheme, useMantineColorScheme, type MantineColorScheme } from "@mantine/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import styles from "./colorScheme.module.css";

export const COLOR_SCHEME_STORAGE_KEY = "wordinator:color-scheme";
export const LIGHT_THEME_COLOR = "#f5ede2";
export const DARK_THEME_COLOR = "#1c1715";

export function ThemeRuntimeSync() {
  const resolved = useComputedColorScheme("light", { getInitialValueInEffect: false });

  useEffect(() => {
    document.documentElement.style.colorScheme = resolved;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      "content",
      resolved === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR,
    );
  }, [resolved]);

  return null;
}

export function ThemePreferenceControl({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const resolved = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const preference = colorScheme === "auto" ? "system" : colorScheme;

  return (
    <fieldset className={`${styles.fieldset} ${compact ? styles.compact : ""}`}>
      <legend>{t("theme.title")}</legend>
      <p className={styles.description}>{t("theme.description")}</p>
      <SegmentedControl
        aria-label={t("theme.preferenceLabel")}
        className={styles.control}
        data={[
          { label: t("theme.system"), value: "system" },
          { label: t("theme.light"), value: "light" },
          { label: t("theme.dark"), value: "dark" },
        ]}
        fullWidth
        onChange={(value) => setColorScheme((value === "system" ? "auto" : value) as MantineColorScheme)}
        value={preference}
      />
      <p aria-live="polite" className={styles.status}>
        {t("theme.current", { preference: t(`theme.${preference}`), resolved: t(`theme.${resolved}`) })}
      </p>
    </fieldset>
  );
}
