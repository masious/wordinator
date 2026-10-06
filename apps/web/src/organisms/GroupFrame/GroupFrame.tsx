import { Drawer, Menu } from "@mantine/core";
import { okResponseSchema } from "@wordinator/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type PropsWithChildren, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../api";
import { AdaptiveDialog, Avatar } from "../../ui";
import { CreateGroupForm } from "../CreateGroupForm/CreateGroupForm";
import type { SignedInSession } from "../types/auth";
import styles from "./GroupFrame.module.css";

type ShellIconName = "journal" | "courses" | "members" | "notifications" | "profile" | "settings" | "signOut" | "chevron" | "more" | "plus" | "check";

function ShellIcon({ name }: { name: ShellIconName }) {
  const paths: Record<ShellIconName, ReactNode> = {
    journal: <><path d="M4.25 3.5h7.5A2.25 2.25 0 0 1 14 5.75v10.5H6.5A2.25 2.25 0 0 1 4.25 14V3.5Z" /><path d="M14 5.75a2.25 2.25 0 0 1 2.25-2.25h.5v10.75a2 2 0 0 1-2 2H14V5.75Z" /></>,
    courses: <><path d="M3.25 4.75c2.35-.6 4.6-.35 6.75 1.25v10.25c-2.15-1.6-4.4-1.85-6.75-1.25V4.75Z" /><path d="M16.75 4.75c-2.35-.6-4.6-.35-6.75 1.25v10.25c2.15-1.6 4.4-1.85 6.75-1.25V4.75Z" /></>,
    members: <><circle cx="7.25" cy="7" r="2.75" /><path d="M2.75 16.25c.35-3 1.85-4.5 4.5-4.5s4.15 1.5 4.5 4.5M12.25 4.75a2.75 2.75 0 0 1 0 5.25M13.75 12c2.05.37 3.22 1.78 3.5 4.25" /></>,
    notifications: <><path d="M4.25 14.25h11.5l-1.5-2V8a4.25 4.25 0 0 0-8.5 0v4.25l-1.5 2Z" /><path d="M8.25 16.5c.45.67 1.03 1 1.75 1s1.3-.33 1.75-1" /></>,
    profile: <><circle cx="10" cy="6.75" r="3.25" /><path d="M3.75 17c.45-3.67 2.53-5.5 6.25-5.5s5.8 1.83 6.25 5.5" /></>,
    settings: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.75v1.5m0 11.5v1.5M17.25 10h-1.5m-11.5 0h-1.5m12.38-5.13-1.06 1.06M5.93 14.07l-1.06 1.06m10.26 0-1.06-1.06M5.93 5.93 4.87 4.87" /></>,
    signOut: <><path d="M8.25 3.25H5.5a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h2.75M12.5 6.25 16.25 10l-3.75 3.75M7.25 10h9" /></>,
    chevron: <path d="m6.75 8.25 3.25 3.5 3.25-3.5" />,
    more: <><circle cx="4.75" cy="10" r=".75" /><circle cx="10" cy="10" r=".75" /><circle cx="15.25" cy="10" r=".75" /></>,
    plus: <path d="M10 4.25v11.5M4.25 10h11.5" />,
    check: <path d="m4.75 10.25 3.5 3.5 7-7.5" />,
  };
  return <svg aria-hidden="true" className={styles.shellIcon} viewBox="0 0 20 20">{paths[name]}</svg>;
}

function NavLabel({ icon, children }: { icon: ShellIconName; children: ReactNode }) {
  return <><span className={styles.navIcon}><ShellIcon name={icon} /></span><span className={styles.navLabel}>{children}</span></>;
}

export function GroupFrame({ children, groupId, session }: PropsWithChildren<{ groupId: string; session: SignedInSession }>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const signOut = useMutation({
    mutationFn: () => apiRequest("/api/auth/sign-out", okResponseSchema, { method: "POST" }),
    onSuccess: async () => { queryClient.clear(); await navigate({ to: "/" }); },
  });
  const currentGroup = session.groups.find((group) => group.id === groupId);
  const profileParams = { groupId, userId: session.user.id };
  const groupPath = `/groups/${groupId}`;
  const journalActive = pathname === groupPath || pathname.startsWith(`${groupPath}/posts/`);
  const coursesActive = pathname === `${groupPath}/courses` || pathname.startsWith(`${groupPath}/courses/`);
  // More collects every destination that is not in the four-slot dock.
  const moreActive = ["members", "settings"].some((section) => pathname === `${groupPath}/${section}` || pathname.startsWith(`${groupPath}/${section}/`));
  const journalLink = <Link aria-current={journalActive ? "page" : undefined} activeOptions={{ exact: true }} className={styles.navItem} to="/groups/$groupId" params={{ groupId }}><NavLabel icon="journal">{t("nav.journal")}</NavLabel></Link>;
  const coursesLink = <Link aria-current={coursesActive ? "page" : undefined} className={styles.navItem} to="/groups/$groupId/courses" params={{ groupId }}><NavLabel icon="courses">{t("nav.courses")}</NavLabel></Link>;
  const notificationsLink = <Link activeOptions={{ exact: true }} className={styles.navItem} to="/groups/$groupId/notifications" params={{ groupId }}><NavLabel icon="notifications">{t("nav.notifications")}</NavLabel></Link>;
  const closeMore = () => setMoreOpen(false);

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.navIsland}>
        <div className={styles.navCore}>
          <Link aria-label={t("brand")} className={styles.brand} to="/groups/$groupId" params={{ groupId }}><span aria-hidden="true" className={styles.brandMark}>W</span><span className={styles.brandName}>{t("brand")}</span></Link>
          {currentGroup && <span className={styles.currentGroup}>{currentGroup.name}</span>}
          <nav className={styles.desktopNav} aria-label={t("nav.primary")}>
            {journalLink}
            {coursesLink}
            <Link activeOptions={{ exact: true }} className={styles.navItem} to="/groups/$groupId/members" params={{ groupId }}><NavLabel icon="members">{t("nav.members")}</NavLabel></Link>
            {notificationsLink}
          </nav>
          <Menu position="bottom-end" width={260} withinPortal>
            <Menu.Target>
              <button aria-label={t("nav.accountMenu")} className={styles.accountTrigger} type="button">
                <Avatar name={session.user.displayName} src={session.user.avatarUrl} />
                <span className={styles.accountName}>{session.user.displayName}</span>
                <span className={styles.accountChevron}><ShellIcon name="chevron" /></span>
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => void navigate({ to: "/groups/$groupId/members/$userId", params: profileParams })}>
                <span className={styles.identity}>
                  <Avatar size={40} name={session.user.displayName} src={session.user.avatarUrl} />
                  <span className={styles.identityText}>
                    <span className={styles.identityName}>{session.user.displayName}</span>
                    <span className={styles.identityHint}>{t("nav.profile")}</span>
                  </span>
                </span>
              </Menu.Item>
              <Menu.Divider />
              <div role="group" aria-label={t("group.switcher")}>
                <Menu.Label>{t("group.switcher")}</Menu.Label>
                {session.groups.map((group) => {
                  const current = group.id === groupId;
                  return <Menu.Item key={group.id} aria-current={current ? "true" : undefined}
                    leftSection={group.iconUrl ? <Avatar size={24} name={group.name} src={group.iconUrl} /> : <span aria-hidden="true" className={styles.groupIcon}>{group.icon}</span>}
                    rightSection={current ? <ShellIcon name="check" /> : undefined}
                    onClick={() => { if (!current) void navigate({ to: "/groups/$groupId", params: { groupId: group.id } }); }}>
                    <span className={styles.groupName}>{group.name}</span>
                  </Menu.Item>;
                })}
                <Menu.Item leftSection={<ShellIcon name="plus" />} onClick={() => setCreatingGroup(true)}>{t("group.createAnother")}</Menu.Item>
              </div>
              <Menu.Divider />
              <Menu.Item leftSection={<ShellIcon name="settings" />} onClick={() => void navigate({ to: "/groups/$groupId/settings", params: { groupId } })}>{t("nav.settings")}</Menu.Item>
              <Menu.Item color="var(--color-danger-text)" disabled={signOut.isPending} leftSection={<ShellIcon name="signOut" />} onClick={() => signOut.mutate()}>{t("auth.signOut")}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
    </header>
    <main className={styles.shellMain}>{children}</main>
    <nav className={styles.mobileDock} aria-label={t("nav.mobile")}>
      <div className={styles.mobileNav}>
        {journalLink}
        {coursesLink}
        {notificationsLink}
        <button aria-current={moreActive ? "page" : undefined} aria-expanded={moreOpen} aria-haspopup="dialog" className={styles.navItem} type="button" onClick={() => setMoreOpen(true)}><NavLabel icon="more">{t("nav.more")}</NavLabel></button>
      </div>
    </nav>
    <Drawer classNames={{ content: styles.sheet, header: styles.sheetHeader, title: styles.sheetTitle, body: styles.sheetBody }} opened={moreOpen} onClose={closeMore} position="bottom" title={t("nav.more")}>
      <div className={styles.sheetList}>
        <Link activeOptions={{ exact: true }} className={styles.sheetItem} to="/groups/$groupId/members" params={{ groupId }} onClick={closeMore}><ShellIcon name="members" />{t("nav.members")}</Link>
        <Link activeOptions={{ exact: true }} className={styles.sheetItem} to="/groups/$groupId/members/$userId" params={profileParams} onClick={closeMore}><ShellIcon name="profile" />{t("nav.profile")}</Link>
        <Link className={styles.sheetItem} to="/groups/$groupId/settings" params={{ groupId }} onClick={closeMore}><ShellIcon name="settings" />{t("nav.settings")}</Link>
        <button className={styles.sheetItem} type="button" onClick={() => { closeMore(); setCreatingGroup(true); }}><ShellIcon name="plus" />{t("group.createAnother")}</button>
        <button className={`${styles.sheetItem} ${styles.sheetDanger}`} disabled={signOut.isPending} type="button" onClick={() => signOut.mutate()}><ShellIcon name="signOut" />{t("auth.signOut")}</button>
      </div>
    </Drawer>
    <AdaptiveDialog opened={creatingGroup} onClose={() => setCreatingGroup(false)} title={t("group.createTitle")}>
      {creatingGroup && <CreateGroupForm onClose={() => setCreatingGroup(false)} />}
    </AdaptiveDialog>
  </div>;
}
