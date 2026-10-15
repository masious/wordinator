import { imageResponseSchema, okResponseSchema } from "@wordinator/contracts";
import { Menu } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Trash } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../api";
import { Avatar } from "../ui";
import { ImageCropper } from "../organisms/ImageCropper/ImageCropper";
import { SQUARE_OUTPUT } from "../organisms/ImageCropper/crop";
import styles from "./AvatarEditor.module.css";

const AVATAR_PATH = "/api/settings/avatar";

function PencilIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m13.9 3.6 2.5 2.5M4 16l.8-3.4L13.7 3.7a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2l-8.9 8.9L4 16Z" /></svg>;
}

// The account avatar with an edit button on its corner. Without a photo the button opens the file picker;
// with one it offers replace or remove. Uploads go through the cropper and save immediately, apart from any form.
export function AvatarEditor({ name, src, onChanged, size = "large" }: {
  name: string; src: string | null; onChanged: () => Promise<unknown>; size?: "large" | "medium";
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const upload = async (cropped: File) => {
    const form = new FormData(); form.set("image", cropped);
    await apiRequest(AVATAR_PATH, imageResponseSchema, { method: "POST", body: form });
    setFile(null); await onChanged();
  };
  const remove = useMutation({ mutationFn: () => apiRequest(AVATAR_PATH, okResponseSchema, { method: "DELETE" }), onSuccess: onChanged });
  const choose = (event: ChangeEvent<HTMLInputElement>) => { setFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; };
  const pick = () => inputRef.current?.click();

  return <div className={`${styles.editor} ${styles[size]}`}><div className={styles.frame}>
    <Avatar className={styles.avatar} size="var(--avatar-editor-size)" radius="50%" name={name} src={src} />
    {src
      ? <Menu position="bottom-start" width={220} withinPortal>
        <Menu.Target>
          <button aria-label={t("avatar.change")} className={styles.edit} type="button" disabled={remove.isPending}><PencilIcon /></button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<ImagePlus size={18} />} onClick={pick}>{t("avatar.upload")}</Menu.Item>
          <Menu.Item color="var(--color-danger-text)" leftSection={<Trash size={18} />} onClick={() => remove.mutate()}>{t("avatar.remove")}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      : <button aria-label={t("avatar.choose")} className={styles.edit} type="button" onClick={pick}><PencilIcon /></button>}
    <input ref={inputRef} aria-hidden="true" tabIndex={-1} className={styles.fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} />
  </div>
    {remove.error && <p className={styles.error} role="alert">{t("errors.generic")}</p>}
    <ImageCropper file={file} output={SQUARE_OUTPUT} notice={t("media.publicNotice")} onCancel={() => setFile(null)} onConfirm={upload} />
  </div>;
}
