import { imageResponseSchema, okResponseSchema } from "@wordinator/contracts";
import { FileInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, groupQueryOptions, membersQueryOptions, sessionQueryOptions } from "../api";
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorState, LabelChip, LoadingState, PageHeader, SectionHeader, Surface } from "../ui";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { ImageCropper } from "../organisms/ImageCropper/ImageCropper";
import { SQUARE_OUTPUT, WIDE_OUTPUT } from "../organisms/ImageCropper/crop";
import shellStyles from "./PhaseOnePages.module.css";
import styles from "./PhaseFivePages.module.css";

const json = (value: unknown) => JSON.stringify(value);

export function ImageUpload({ currentUrl, name, uploadPath, removePath, onChanged, shape = "square" }: {
  currentUrl: string | null; name: string; uploadPath: string; removePath: string; onChanged: () => Promise<unknown>; shape?: "square" | "wide";
}) {
  const { t } = useTranslation(); const [file, setFile] = useState<File | null>(null);
  const upload = async (cropped: File) => {
    const form = new FormData(); form.set("image", cropped);
    await apiRequest(uploadPath, imageResponseSchema, { method: "POST", body: form });
    setFile(null); await onChanged();
  };
  const remove = useMutation({ mutationFn: () => apiRequest(removePath, okResponseSchema, { method: "DELETE" }), onSuccess: onChanged });
  return <div className={styles.upload}>
    <div className={styles.preview}>{shape === "wide"
      ? <div className={styles.widePreview}>{currentUrl && <img alt="" src={currentUrl} />}</div>
      : <Avatar name={name} src={currentUrl ?? undefined} />}<span>{t("media.publicNotice")}</span></div>
    <FileInput label={t("media.chooseImage")} accept="image/png,image/jpeg,image/webp" value={file} onChange={setFile} />
    {currentUrl && <div className={styles.actions}><Button variant="secondary" loading={remove.isPending} onClick={() => remove.mutate()}>{t("media.remove")}</Button></div>}
    {remove.error && <p role="alert">{t("errors.generic")}</p>}
    <ImageCropper file={file} output={shape === "wide" ? WIDE_OUTPUT : SQUARE_OUTPUT} onCancel={() => setFile(null)} onConfirm={upload} />
  </div>;
}

export function MembersPage({ groupId }: { groupId: string }) {
  const { t } = useTranslation(); const queryClient = useQueryClient(); const navigate = useNavigate(); const [leaveOpen, setLeaveOpen] = useState(false);
  const session = useQuery(sessionQueryOptions()); const shell = useQuery(groupQueryOptions(groupId)); const members = useQuery(membersQueryOptions(groupId));
  const leave = useMutation({ mutationFn: () => apiRequest(`/api/groups/${groupId}/memberships/leave`, okResponseSchema, { method: "POST", body: json({ confirmation: true }) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); await navigate({ to: "/" }); } });
  if (session.isPending || shell.isPending || members.isPending) return <main className={shellStyles.center}><LoadingState label={t("members.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  if (shell.isError || members.isError) return <GroupFrame groupId={groupId} session={session.data}><ErrorState title={t("members.unavailable")} /></GroupFrame>;
  const renderMember = (member: (typeof members.data.active)[number]) => <div className={styles.member} key={member.id}>
    <div className={styles.identity}><Avatar name={member.displayName} src={member.avatarUrl ?? undefined} /><div><Link to="/groups/$groupId/members/$userId" params={{ groupId, userId: member.id }}>{member.displayName}</Link><p>{member.isCreator ? t("members.creator") : member.membership === "former" ? t("profile.former") : t("members.member")}</p></div></div>
  </div>;
  return <GroupFrame groupId={groupId} session={session.data}><div className={styles.stack}>
    <PageHeader eyebrow={<LabelChip>{t("members.eyebrow")}</LabelChip>} title={t("members.title")} intro={t("members.intro")}
      actions={shell.data.group.role === "creator" ? <Link className={styles.manageLink} to="/groups/$groupId/settings/members" params={{ groupId }}>{t("members.manage")}</Link> : undefined} />
    <div className={styles.directory}>
      <Surface className={styles.directoryPanel} tone="featured"><SectionHeader title={t("members.active")} /><div className={styles.memberList}>{members.data.active.map(renderMember)}</div></Surface>
      <Surface className={styles.directoryPanel} tone="quiet"><SectionHeader title={t("members.former")} />{members.data.former.length ? <div className={`${styles.memberList} ${styles.formerList}`}>{members.data.former.map(renderMember)}</div> : <EmptyState title={t("members.noFormer")} />}</Surface>
    </div>
    {members.data.permissions.leave && <Surface className={styles.leavePanel} tone="danger"><SectionHeader title={t("members.leaveTitle")} description={t("members.leaveHelp")} action={<Button variant="danger" onClick={() => setLeaveOpen(true)}>{t("members.leave")}</Button>} /></Surface>}
    <ConfirmDialog opened={leaveOpen} onClose={() => setLeaveOpen(false)} title={t("members.leaveTitle")} confirmLabel={t("members.leave")} cancelLabel={t("common.cancel")} confirmLoading={leave.isPending} onConfirm={() => leave.mutate()}>{t("members.leaveConfirm")}</ConfirmDialog>
  </div></GroupFrame>;
}
