import { Menu } from "@mantine/core";
import { okResponseSchema, type SessionResponse } from "@wordinator/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../api";
import { Avatar } from "../ui";
import styles from "./PhaseOnePages.module.css";

type SignedInSession = Extract<SessionResponse, { status: "signedIn" }>;
type ShellIconName = "journal" | "members" | "notifications" | "profile" | "settings" | "signOut" | "chevron";

function ShellIcon({ name }: { name: ShellIconName }) {
  const paths: Record<ShellIconName, ReactNode> = {
    journal: <><path d="M4.25 3.5h7.5A2.25 2.25 0 0 1 14 5.75v10.5H6.5A2.25 2.25 0 0 1 4.25 14V3.5Z" /><path d="M14 5.75a2.25 2.25 0 0 1 2.25-2.25h.5v10.75a2 2 0 0 1-2 2H14V5.75Z" /></>,
    members: <><circle cx="7.25" cy="7" r="2.75" /><path d="M2.75 16.25c.35-3 1.85-4.5 4.5-4.5s4.15 1.5 4.5 4.5M12.25 4.75a2.75 2.75 0 0 1 0 5.25M13.75 12c2.05.37 3.22 1.78 3.5 4.25" /></>,
    notifications: <><path d="M4.25 14.25h11.5l-1.5-2V8a4.25 4.25 0 0 0-8.5 0v4.25l-1.5 2Z" /><path d="M8.25 16.5c.45.67 1.03 1 1.75 1s1.3-.33 1.75-1" /></>,
    profile: <><circle cx="10" cy="6.75" r="3.25" /><path d="M3.75 17c.45-3.67 2.53-5.5 6.25-5.5s5.8 1.83 6.25 5.5" /></>,
    settings: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.75v1.5m0 11.5v1.5M17.25 10h-1.5m-11.5 0h-1.5m12.38-5.13-1.06 1.06M5.93 14.07l-1.06 1.06m10.26 0-1.06-1.06M5.93 5.93 4.87 4.87" /></>,
    signOut: <><path d="M8.25 3.25H5.5a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h2.75M12.5 6.25 16.25 10l-3.75 3.75M7.25 10h9" /></>,
    chevron: <path d="m6.75 8.25 3.25 3.5 3.25-3.5" />,
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
  const signOut = useMutation({
    mutationFn: () => apiRequest("/api/auth/sign-out", okResponseSchema, { method: "POST" }),
    onSuccess: async () => { queryClient.clear(); await navigate({ to: "/" }); },
  });
  const profileParams = { groupId, userId: session.user.id };
  const journalActive = pathname === `/groups/${groupId}` || pathname.startsWith(`/groups/${groupId}/posts/`);
  const primaryLinks = <>
    <Link aria-current={journalActive ? "page" : undefined} activeOptions={{ exact: true }} className={styles.navItem} to="/groups/$groupId" params={{ groupId }}><NavLabel icon="journal">{t("nav.journal")}</NavLabel></Link>
    <Link activeOptions={{ exact: true }} className={styles.navItem} to="/groups/$groupId/members" params={{ groupId }}><NavLabel icon="members">{t("nav.members")}</NavLabel></Link>
    <Link activeOptions={{ exact: true }} className={styles.navItem} to="/groups/$groupId/notifications" params={{ groupId }}><NavLabel icon="notifications">{t("nav.notifications")}</NavLabel></Link>
  </>;

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.navIsland}>
        <div className={styles.navCore}>
          <Link className={styles.brand} to="/groups/$groupId" params={{ groupId }}><span aria-hidden="true" className={styles.brandMark}>W</span><span className={styles.brandName}>{t("brand")}</span></Link>
          <label className={styles.switcher}>
            <span className={styles.srOnly}>{t("group.switcher")}</span>
            <span aria-hidden="true" className={styles.switcherAccent} />
            <select value={groupId} onChange={(event) => void navigate({ to: "/groups/$groupId", params: { groupId: event.currentTarget.value } })}>
              {session.groups.map((group) => <option key={group.id} value={group.id}>{group.icon} {group.name}</option>)}
            </select>
            <span aria-hidden="true" className={styles.switcherChevron}><ShellIcon name="chevron" /></span>
          </label>
          <nav className={styles.desktopNav} aria-label={t("nav.primary")}>{primaryLinks}</nav>
          <Menu position="bottom-end" width={220} withinPortal>
            <Menu.Target>
              <button aria-label={t("nav.accountMenu")} className={styles.accountTrigger} type="button">
                <Avatar name={session.user.displayName} />
                <span className={styles.accountName}>{session.user.displayName}</span>
                <ShellIcon name="chevron" />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{session.user.displayName}</Menu.Label>
              <Menu.Item leftSection={<ShellIcon name="profile" />} onClick={() => void navigate({ to: "/groups/$groupId/members/$userId", params: profileParams })}>{t("nav.profile")}</Menu.Item>
              <Menu.Item leftSection={<ShellIcon name="settings" />} onClick={() => void navigate({ to: "/groups/$groupId/settings", params: { groupId } })}>{t("nav.settings")}</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="var(--color-danger-text)" disabled={signOut.isPending} leftSection={<ShellIcon name="signOut" />} onClick={() => signOut.mutate()}>{t("auth.signOut")}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
    </header>
    <main className={styles.shellMain}>{children}</main>
    <nav className={styles.mobileDock} aria-label={t("nav.mobile") }>
      <div className={styles.mobileNav}>
        {primaryLinks}
        <Link activeOptions={{ exact: true }} className={styles.navItem} to="/groups/$groupId/members/$userId" params={profileParams}><NavLabel icon="profile">{t("nav.profile")}</NavLabel></Link>
        <Link activeOptions={{ exact: true }} className={styles.navItem} to="/groups/$groupId/settings" params={{ groupId }}><NavLabel icon="settings">{t("nav.settings")}</NavLabel></Link>
      </div>
    </nav>
  </div>;
}
