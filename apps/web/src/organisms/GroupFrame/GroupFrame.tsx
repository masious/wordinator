import { Menu } from "@mantine/core";
import { okResponseSchema } from "@wordinator/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type PropsWithChildren, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../api";
import { Avatar } from "../../ui";
import type { SignedInSession } from "../types/auth";
import styles from "./GroupFrame.module.css";

type ShellIconName = "journal" | "courses" | "words" | "members" | "notifications" | "profile" | "settings" | "signOut" | "chevron" | "more" | "plus" | "check";

function ShellIcon({ name }: { name: ShellIconName }) {
  const paths: Record<ShellIconName, ReactNode> = {
    journal: <><path d="M4.25 3.5h7.5A2.25 2.25 0 0 1 14 5.75v10.5H6.5A2.25 2.25 0 0 1 4.25 14V3.5Z" /><path d="M14 5.75a2.25 2.25 0 0 1 2.25-2.25h.5v10.75a2 2 0 0 1-2 2H14V5.75Z" /></>,
    courses: <><path d="M3.25 4.75c2.35-.6 4.6-.35 6.75 1.25v10.25c-2.15-1.6-4.4-1.85-6.75-1.25V4.75Z" /><path d="M16.75 4.75c-2.35-.6-4.6-.35-6.75 1.25v10.25c2.15-1.6 4.4-1.85 6.75-1.25V4.75Z" /></>,
    words: <path d="M5.5 3.5h9v13L10 13.25 5.5 16.5v-13Z" />,
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

export function GroupFrame({ children, session }: PropsWithChildren<{ groupId: string; session: SignedInSession }>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: () => apiRequest("/api/auth/sign-out", okResponseSchema, { method: "POST" }),
    onSuccess: async () => { queryClient.clear(); await navigate({ to: "/" }); },
  });
  const coursesActive = pathname === "/courses" || pathname.startsWith("/courses/");
  const coursesLink = <Link aria-current={coursesActive ? "page" : undefined} className={styles.navItem} to="/courses"><NavLabel icon="courses">{t("nav.courses")}</NavLabel></Link>;
  const wordsLink = <Link aria-current={pathname === "/words" ? "page" : undefined} className={styles.navItem} to="/words"><NavLabel icon="words">{t("nav.words")}</NavLabel></Link>;
  const journalActive = pathname === "/journal" || pathname.startsWith("/journal/");
  const journalLink = <Link aria-current={journalActive ? "page" : undefined} className={styles.navItem} to="/journal"><NavLabel icon="journal">{t("nav.journal")}</NavLabel></Link>;
  const notificationsLink = <Link aria-current={pathname === "/notifications" ? "page" : undefined} className={styles.navItem} to="/notifications"><NavLabel icon="notifications">{t("nav.notifications")}</NavLabel></Link>;

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.navIsland}>
        <div className={styles.navCore}>
          <Link aria-label={t("brand")} className={styles.brand} to="/courses"><span aria-hidden="true" className={styles.brandMark}>W</span><span className={styles.brandName}>{t("brand")}</span></Link>
          <nav className={styles.desktopNav} aria-label={t("nav.primary")}>
            {coursesLink}
            {wordsLink}
            {journalLink}
            {notificationsLink}
          </nav>
          {/* The trigger is always on the page when the menu opens; WebKit can misjudge the scrolling header as clipped and hide it. */}
          <Menu position="bottom-end" width={260} withinPortal hideDetached={false}>
            <Menu.Target>
              <button aria-label={t("nav.accountMenu")} className={styles.accountTrigger} type="button">
                <Avatar name={session.user.displayName} src={session.user.avatarUrl} />
                <span className={styles.accountName}>{session.user.displayName}</span>
                <span className={styles.accountChevron}><ShellIcon name="chevron" /></span>
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => void navigate({ to: "/settings" })}>
                <span className={styles.identity}>
                  <Avatar size={40} name={session.user.displayName} src={session.user.avatarUrl} />
                  <span className={styles.identityText}>
                    <span className={styles.identityName}>{session.user.displayName}</span>
                    <span className={styles.identityHint}>{t("nav.profile")}</span>
                  </span>
                </span>
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<ShellIcon name="settings" />} onClick={() => void navigate({ to: "/settings" })}>{t("nav.settings")}</Menu.Item>
              <Menu.Item color="var(--color-danger-text)" disabled={signOut.isPending} leftSection={<ShellIcon name="signOut" />} onClick={() => signOut.mutate()}>{t("auth.signOut")}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
    </header>
    <main className={styles.shellMain}>{children}</main>
    <nav className={styles.mobileDock} aria-label={t("nav.mobile")} data-fit-bottom>
      <div className={styles.mobileNav}>
        {coursesLink}
        {wordsLink}
        {journalLink}
        {notificationsLink}
      </div>
    </nav>
  </div>;
}
