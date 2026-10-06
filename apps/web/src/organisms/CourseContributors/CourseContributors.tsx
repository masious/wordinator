import { courseResponseSchema, okResponseSchema, type Course, type CourseContributor } from "@wordinator/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, courseContributorsQueryOptions } from "../../api";
import { Avatar, Button, ConfirmDialog, SectionHeader, Surface } from "../../ui";
import { CourseErrorMessage } from "../CourseLessons/CourseErrorMessage";
import styles from "./CourseContributors.module.css";

// Contributors are per-course roles: anyone may ask, the owner decides, and contributor work stays a draft until the owner publishes it.
export function CourseContributors({ groupId, course }: { groupId: string; course: Course }) {
  const { t } = useTranslation(); const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<CourseContributor | null>(null); const [leaving, setLeaving] = useState(false);
  const contributors = useQuery(courseContributorsQueryOptions(groupId, course.id));
  const path = `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(course.id)}/contributors`;
  // Becoming or ceasing to be a contributor changes which lessons and blocks the viewer sees, so the whole course reloads.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["course-contributors", groupId, course.id] }),
    queryClient.invalidateQueries({ queryKey: ["course", groupId, course.id] }),
    queryClient.invalidateQueries({ queryKey: ["course-lesson", groupId, course.id] }),
    queryClient.invalidateQueries({ queryKey: ["courses", groupId] }),
  ]);
  const ask = useMutation({ mutationFn: () => apiRequest(path, courseResponseSchema, { method: "POST" }), onSuccess: refresh });
  const leave = useMutation({ mutationFn: () => apiRequest(`${path}/leave`, okResponseSchema, { method: "POST" }), onSuccess: async () => { setLeaving(false); await refresh(); } });
  const decide = useMutation({
    mutationFn: ({ userId, decision }: { userId: string; decision: "accept" | "reject" }) => apiRequest(`${path}/${encodeURIComponent(userId)}`, okResponseSchema, { method: "PATCH", body: JSON.stringify({ decision }) }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => apiRequest(`${path}/${encodeURIComponent(userId)}`, okResponseSchema, { method: "DELETE" }),
    onSuccess: async () => { setRemoving(null); await refresh(); },
  });
  const { permissions, contribution } = course;
  const manage = permissions.manageContributors;
  const description = manage ? t("courses.contributors.ownerHelp")
    : contribution === "active" ? t("courses.contributors.activeHelp")
    : contribution === "pending" ? t("courses.contributors.pendingHelp")
    : t("courses.contributors.memberHelp");
  const row = (item: CourseContributor, actions?: ReactNode) => <li className={styles.row} key={item.user.id}>
    <div className={styles.identity}><Avatar name={item.user.displayName} src={item.user.avatarUrl ?? undefined} /><strong>{item.user.displayName}</strong></div>
    {actions && <div className={styles.rowActions}>{actions}</div>}
  </li>;
  const data = contributors.data;
  return <Surface className={styles.panel} tone="quiet">
    <SectionHeader title={t("courses.contributors.title")} description={description} />
    {(permissions.requestContribution || permissions.leaveContribution) && <div className={styles.actions}>
      {permissions.requestContribution && <Button variant="secondary" loading={ask.isPending} onClick={() => ask.mutate()}>{t("courses.contributors.request")}</Button>}
      {contribution === "pending" && <Button variant="quiet" loading={leave.isPending} onClick={() => leave.mutate()}>{t("courses.contributors.withdraw")}</Button>}
      {contribution === "active" && <Button variant="quiet" onClick={() => setLeaving(true)}>{t("courses.contributors.leave")}</Button>}
    </div>}
    <CourseErrorMessage error={ask.error ?? decide.error ?? (leaving ? null : leave.error) ?? contributors.error} />
    {manage && data && <section className={styles.group} aria-labelledby="course-contributor-requests">
      <h3 id="course-contributor-requests">{t("courses.contributors.requests")}</h3>
      {data.pending.length ? <ul className={styles.rows}>{data.pending.map((item) => row(item, <>
        <Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ userId: item.user.id, decision: "reject" })} aria-label={t("courses.contributors.rejectNamed", { name: item.user.displayName })}>{t("courses.contributors.reject")}</Button>
        <Button disabled={decide.isPending} onClick={() => decide.mutate({ userId: item.user.id, decision: "accept" })} aria-label={t("courses.contributors.acceptNamed", { name: item.user.displayName })}>{t("courses.contributors.accept")}</Button>
      </>))}</ul> : <p className={styles.empty}>{t("courses.contributors.noRequests")}</p>}
    </section>}
    {data && <section className={styles.group} aria-labelledby="course-contributor-list">
      <h3 id="course-contributor-list">{t("courses.contributors.active")}</h3>
      {data.active.length ? <ul className={styles.rows}>{data.active.map((item) => row(item, manage
        ? <Button variant="danger" onClick={() => { remove.reset(); setRemoving(item); }} aria-label={t("courses.contributors.removeNamed", { name: item.user.displayName })}>{t("courses.contributors.remove")}</Button>
        : undefined))}</ul> : <p className={styles.empty}>{t("courses.contributors.none")}</p>}
    </section>}
    <ConfirmDialog opened={removing !== null} onClose={() => setRemoving(null)} title={t("courses.contributors.removeTitle")} confirmLabel={t("courses.contributors.remove")} cancelLabel={t("common.cancel")}
      confirmLoading={remove.isPending} onConfirm={() => removing && remove.mutate(removing.user.id)}>
      {t("courses.contributors.removeConfirm", { name: removing?.user.displayName ?? "" })}<CourseErrorMessage error={remove.error} />
    </ConfirmDialog>
    <ConfirmDialog opened={leaving} onClose={() => setLeaving(false)} title={t("courses.contributors.leaveTitle")} confirmLabel={t("courses.contributors.leave")} cancelLabel={t("common.cancel")}
      confirmLoading={leave.isPending} onConfirm={() => leave.mutate()}>
      {t("courses.contributors.leaveConfirm")}<CourseErrorMessage error={leave.error} />
    </ConfirmDialog>
  </Surface>;
}
