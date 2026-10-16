import type { AiProvider } from "@wordinator/contracts/ai";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { tutorModelsQueryOptions } from "../../api";
import { SelectField } from "../../ui";
import styles from "./Tutor.module.css";

// The conversation's model (docs/ai-tutor.md#providers-and-fallback): Default follows the superuser's order, and a chosen
// provider's model goes first with the others as fallback. Hidden while there is nothing to choose between.
export function ModelPicker({ value, onChange, disabled, error }: {
  value: AiProvider | null; onChange: (provider: AiProvider | null) => void; disabled?: boolean; error?: string | null;
}) {
  const { t } = useTranslation();
  const models = useQuery(tutorModelsQueryOptions());
  const items = models.data?.items ?? [];
  if (items.length < 2) return null;
  const provider = (name: AiProvider) => t(`tutor.model.providers.${name}`);
  const data = [
    { value: "", label: t("tutor.model.default", { model: items[0]!.model }) },
    ...items.map((item) => ({ value: item.provider, label: t("tutor.model.option", { provider: provider(item.provider), model: item.model }) })),
  ];
  const selected = value && items.some((item) => item.provider === value) ? value : "";
  return <SelectField className={styles.modelPicker} aria-label={t("tutor.model.label")} allowDeselect={false} disabled={disabled}
    data={data} value={selected} error={error ?? undefined} comboboxProps={{ width: "max-content", position: "bottom-end" }}
    onChange={(next) => onChange(next ? items.find((item) => item.provider === next)?.provider ?? null : null)} />;
}
