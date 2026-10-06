import { imageResponseSchema, okResponseSchema, temporaryPasswordResponseSchema } from "@wordinator/contracts";
import { FileInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, groupQueryOptions, membersQueryOptions, sessionQueryOptions } from "../api";
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, PageHeader, SectionHeader, Surface } from "../ui";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./PhaseFivePages.module.css";

const json = (value: unknown) => JSON.stringify(value);

// Center-crops to the target aspect ratio and re-encodes so uploads never carry the original file's metadata.
export async function prepareCroppedImage(file: File, width: number, height: number): Promise<File> {
  if (file.size > 1_048_576) throw new Error("IMAGE_SIZE_INVALID");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(bitmap.width / width, bitmap.height / height);
  const sourceWidth = width * scale; const sourceHeight = height * scale;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("IMAGE_PROCESSING_FAILED");
  context.drawImage(bitmap, (bitmap.width - sourceWidth) / 2, (bitmap.height - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("IMAGE_PROCESSING_FAILED");
  return new File([blob], "cropped.jpg", { type: "image/jpeg" });
}

export const prepareSquareImage = (file: File) => prepareCroppedImage(file, 512, 512);
export const prepareWideImage = (file: File) => prepareCroppedImage(file, 1200, 600);

export function ImageUpload({ currentUrl, name, uploadPath, removePath, onChanged, shape = "square" }: {
  currentUrl: string | null; name: string; uploadPath: string; removePath: string; onChanged: () => Promise<unknown>; shape?: "square" | "wide";
}) {
  const { t } = useTranslation(); const [file, setFile] = useState<File | null>(null); const [localError, setLocalError] = useState("");
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("IMAGE_REQUIRED");
      const form = new FormData(); form.set("image", await (shape === "wide" ? prepareWideImage : prepareSquareImage)(file));
      return apiRequest(uploadPath, imageResponseSchema, { method: "POST", body: form });
    },
    onSuccess: async () => { setFile(null); setLocalError(""); await onChanged(); },
    onError: (error) => setLocalError(error.message),
  });
  const remove = useMutation({ mutationFn: () => apiRequest(removePath, okResponseSchema, { method: "DELETE" }), onSuccess: onChanged });
  return <div className={styles.upload}>
    <div className={styles.preview}>{shape === "wide"
      ? <div className={styles.widePreview}>{currentUrl && <img alt="" src={currentUrl} />}</div>
      : <Avatar name={name} src={currentUrl ?? undefined} />}<span>{t("media.publicNotice")}</span></div>
    <FileInput label={t("media.chooseImage")} accept="image/png,image/jpeg,image/webp" value={file} onChange={setFile} clearable />
    <div className={styles.actions}><Button loading={upload.isPending} disabled={!file} onClick={() => upload.mutate()}>{t("media.upload")}</Button>{currentUrl && <Button variant="secondary" loading={remove.isPending} onClick={() => remove.mutate()}>{t("media.remove")}</Button>}</div>
    {(localError || remove.error) && <p role="alert">{t(`errors.${localError || "generic"}`, { defaultValue: t("errors.generic") })}</p>}
  </div>;
}

export function MembersPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const navigate = useNavigate(); const [password, setPassword] = useState<{ name: string; value: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null); const [leaveOpen, setLeaveOpen] = useState(false);
  const session = useQuery(sessionQueryOptions()); const shell = useQuery(groupQueryOptions(groupId)); const members = useQuery(membersQueryOptions(groupId));
  const remove = useMutation({ mutationFn: (userId: string) => apiRequest(`/api/groups/${groupId}/memberships/${userId}`, okResponseSchema, { method: "DELETE", body: json({ confirmation: true }) }), onSuccess: async () => { setRemoveTarget(null); await queryClient.invalidateQueries({ queryKey: ["members", groupId] }); } });
  const regenerate = useMutation({ mutationFn: async ({ id, name }: { id: string; name: string }) => ({ name, response: await apiRequest(`/api/groups/${groupId}/memberships/${id}/regenerate-password`, temporaryPasswordResponseSchema, { method: "POST" }) }), onSuccess: ({ name, response }) => setPassword({ name, value: response.password }) });
  const leave = useMutation({ mutationFn: () => apiRequest(`/api/groups/${groupId}/memberships/leave`, okResponseSchema, { method: "POST", body: json({ confirmation: true }) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate({ to: "/" }); } });
  if (session.isPending || shell.isPending || members.isPending) return <main className={shellStyles.center}><LoadingState label={t("members.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (shell.isError || members.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("members.unavailable")} /></GroupFrame>;
  const renderMember = (member: (typeof members.data.active)[number]) => <div className={styles.member} key={member.id}>
    <div className={styles.identity}><Avatar name={member.displayName} src={member.avatarUrl ?? undefined} /><div><Link to="/groups/$groupId/members/$userId" params={{ groupId, userId: member.id }}>{member.displayName}</Link><p>{member.isCreator ? t("members.creator") : member.membership === "former" ? t("profile.former") : t("members.member")}</p></div></div>
    {members.data.permissions.manageMembers && !member.isCreator && member.membership === "active" && <div className={styles.actions}><Button variant="secondary" onClick={() => regenerate.mutate({ id: member.id, name: member.displayName })}>{t("members.regenerate")}</Button><Button variant="danger" onClick={() => setRemoveTarget({ id: member.id, name: member.displayName })}>{t("members.remove")}</Button></div>}
  </div>;
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.stack}>
    <PageHeader eyebrow={<LabelChip>{t("members.eyebrow")}</LabelChip>} title={t("members.title")} intro={t("members.intro")} />
    {password && <Surface className={styles.temporary} tone="featured"><div role="status">{t("members.passwordOnce", { name: password.name })}<code>{password.value}</code><Button variant="quiet" onClick={() => void navigator.clipboard.writeText(password.value)}>{t("members.copyPassword")}</Button></div></Surface>}
    <div className={styles.directory}>
      <Surface className={styles.directoryPanel} tone="featured"><SectionHeader title={t("members.active")} /><div className={styles.memberList}>{members.data.active.map(renderMember)}</div></Surface>
      <Surface className={styles.directoryPanel} tone="quiet"><SectionHeader title={t("members.former")} />{members.data.former.length ? <div className={`${styles.memberList} ${styles.formerList}`}>{members.data.former.map(renderMember)}</div> : <EmptyState title={t("members.noFormer")} />}</Surface>
    </div>
    {members.data.permissions.leave && <Surface className={styles.leavePanel} tone="danger"><SectionHeader title={t("members.leaveTitle")} description={t("members.leaveHelp")} action={<Button variant="danger" onClick={() => setLeaveOpen(true)}>{t("members.leave")}</Button>} /></Surface>}
    <ConfirmDialog opened={removeTarget !== null} onClose={() => setRemoveTarget(null)} title={t("members.remove")} confirmLabel={t("members.remove")} cancelLabel={t("common.cancel")} confirmLoading={remove.isPending} onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}>{removeTarget ? t("members.removeConfirm", { name: removeTarget.name }) : ""}</ConfirmDialog>
    <ConfirmDialog opened={leaveOpen} onClose={() => setLeaveOpen(false)} title={t("members.leaveTitle")} confirmLabel={t("members.leave")} cancelLabel={t("common.cancel")} confirmLoading={leave.isPending} onConfirm={() => leave.mutate()}>{t("members.leaveConfirm")}</ConfirmDialog>
  </div></GroupFrame>;
}
