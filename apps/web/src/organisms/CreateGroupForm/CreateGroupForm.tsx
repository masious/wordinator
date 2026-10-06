import { createGroupResponseSchema, imageResponseSchema } from "@wordinator/contracts";
import { FileInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest } from "../../api";
import { Button, SelectField, TextField } from "../../ui";
import { ImageCropper } from "../ImageCropper/ImageCropper";
import { SQUARE_OUTPUT } from "../ImageCropper/crop";
import styles from "./CreateGroupForm.module.css";

export function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const navigate = useNavigate();
  const [name, setName] = useState(""); const [language, setLanguage] = useState<"nl" | "de">("nl");
  // `picked` is the person's original file; `icon` is the cropped output that will be uploaded after creation.
  const [picked, setPicked] = useState<File | null>(null); const [icon, setIcon] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: () => apiRequest("/api/groups", createGroupResponseSchema, { method: "POST", body: JSON.stringify({ name, language }) }),
    onSuccess: async (data) => {
      if (icon) { const form = new FormData(); form.set("image", icon); await apiRequest(`/api/groups/${data.group.id}/icon`, imageResponseSchema, { method: "POST", body: form }); }
      await queryClient.invalidateQueries({ queryKey: ["session"] }); onClose(); await navigate({ to: "/groups/$groupId", params: { groupId: data.group.id } });
    },
  });
  const error = mutation.error;
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
    <TextField label={t("group.name")} value={name} onChange={(event) => setName(event.currentTarget.value)} required />
    <SelectField label={t("group.language")} value={language} onChange={(value) => setLanguage(value as "nl" | "de")} data={[{ value: "nl", label: t("languages.nl") }, { value: "de", label: t("languages.de") }]} />
    <FileInput label={t("group.iconOptional")} accept="image/png,image/jpeg,image/webp" value={picked} onChange={(file) => { setPicked(file); setIcon(null); }} clearable />
    <ImageCropper file={picked && !icon ? picked : null} output={SQUARE_OUTPUT} onCancel={() => setPicked(null)} onConfirm={setIcon} />
    {error && <p className={styles.formError} role="alert">{error instanceof ApiError ? t(`errors.${error.code}`, { defaultValue: t("errors.generic") }) : t("errors.generic")}</p>}
    <div className={styles.actions}><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button loading={mutation.isPending} type="submit">{t("group.create")}</Button></div>
  </form>;
}
