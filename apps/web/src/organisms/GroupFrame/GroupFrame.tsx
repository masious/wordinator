import { Drawer, Menu } from "@mantine/core";
import { okResponseSchema } from "@wordinator/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, BookOpen, Bookmark, ChevronDown, LogOut, Menu as MenuIcon, MessageCircle, MoreHorizontal, NotebookPen, Settings } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type PropsWithChildren, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, coursesQueryOptions } from "../../api";
import { Avatar } from "../../ui";
import type { SignedInSession } from "../types/auth";
import styles from "./GroupFrame.module.css";

// The collapsed course list is a per-device convenience, kept per account; storage may be unavailable, so it falls back to expanded.
const collapsedKey = (accountId: string) => `wordinator:rail-courses-collapsed:v1:${accountId}`;
function readCollapsed(accountId: string) {
  try { return window.localStorage.getItem(collapsedKey(accountId)) === "1"; } catch { return false; }
}
function writeCollapsed(accountId: string, collapsed: boolean) {
  try { window.localStorage.setItem(collapsedKey(accountId), collapsed ? "1" : "0"); } catch { /* storage unavailable */ }
}

// The rail width is also a per-device convenience, kept per account in pixels; no stored width means the token default.
const RAIL_MIN = 200;
const RAIL_MAX = 400;
const RAIL_STEP = 16;
const railWidthKey = (accountId: string) => `wordinator:rail-width:v1:${accountId}`;
const clampRail = (width: number) => Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, width)));
function readRailWidth(accountId: string) {
  try {
    const stored = Number(window.localStorage.getItem(railWidthKey(accountId)));
    return Number.isFinite(stored) && stored > 0 ? clampRail(stored) : null;
  } catch { return null; }
}
function writeRailWidth(accountId: string, width: number | null) {
  try {
    if (width === null) window.localStorage.removeItem(railWidthKey(accountId));
    else window.localStorage.setItem(railWidthKey(accountId), String(width));
  } catch { /* storage unavailable */ }
}

// The rail's right edge: drag it, or focus it and use the arrow keys, to resize; a double click or Escape restores the default.
function RailResizer({ accountId, rail, width, onWidth }: { accountId: string; rail: RefObject<HTMLElement | null>; width: number | null; onWidth: (width: number | null) => void }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const current = () => width ?? rail.current?.getBoundingClientRect().width ?? RAIL_MIN;
  const commit = (next: number | null) => { onWidth(next); writeRailWidth(accountId, next); };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = event.clientX;
    const startWidth = current();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setDragging(true);
    let latest = startWidth;
    const move = (moveEvent: PointerEvent) => { latest = clampRail(startWidth + moveEvent.clientX - start); onWidth(latest); };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragging(false);
      writeRailWidth(accountId, latest);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => number | null> = {
      ArrowLeft: () => clampRail(current() - RAIL_STEP),
      ArrowRight: () => clampRail(current() + RAIL_STEP),
      Home: () => RAIL_MIN,
      End: () => RAIL_MAX,
      Escape: () => null,
    };
    const next = keys[event.key];
    if (!next) return;
    event.preventDefault();
    commit(next());
  };
  return <div role="separator" aria-orientation="vertical" aria-label={t("nav.resizeRail")} tabIndex={0}
    aria-valuemin={RAIL_MIN} aria-valuemax={RAIL_MAX} aria-valuenow={Math.round(current())}
    className={styles.railResizer} data-dragging={dragging || undefined}
    onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={() => commit(null)} />;
}

function Brand() {
  const { t } = useTranslation();
  return <Link aria-label={t("brand")} className={styles.brand} to="/courses">
    <span aria-hidden="true" className={styles.brandMark}><span /><span /><span /></span>
    <span className={styles.brandName}>{t("brand")}</span>
  </Link>;
}

function NavItem({ to, active, icon, children }: { to: "/courses" | "/words" | "/journal" | "/ai" | "/notifications"; active: boolean; icon: ReactNode; children: ReactNode }) {
  return <Link aria-current={active ? "page" : undefined} className={styles.navItem} to={to}>
    <span aria-hidden="true" className={styles.navIcon}>{icon}</span><span className={styles.navLabel}>{children}</span>
  </Link>;
}

// A label too long for the rail fades out at its end and slides to reveal the rest while its item is hovered or focused.
function SlidingLabel({ children }: { children: string }) {
  const viewport = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const box = viewport.current;
    const inner = text.current;
    if (!box || !inner || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflow(Math.max(0, Math.ceil(inner.scrollWidth - box.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [children]);
  const style = overflow > 0 ? { "--slide-distance": `-${overflow}px`, "--slide-duration": `${Math.min(4000, 600 + overflow * 25)}ms` } as CSSProperties : undefined;
  return <span ref={viewport} className={styles.slideViewport} data-overflow={overflow > 0 || undefined} style={style} title={overflow > 0 ? children : undefined}>
    <span ref={text} className={styles.slideText}>{children}</span>
  </span>;
}

// Every course the viewer can see, in library order, under Courses. The list loads every page so no course is out of reach.
function CourseSubItems({ groupId, accountId, pathname }: { groupId: string; accountId: string; pathname: string }) {
  const { t } = useTranslation();
  const listId = useId();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(accountId));
  const courses = useInfiniteQuery(coursesQueryOptions(groupId));
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = courses;
  useEffect(() => { if (hasNextPage && !isFetchingNextPage) void fetchNextPage(); }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const items = courses.data?.pages.flatMap((page) => page.items) ?? [];
  const coursesActive = pathname === "/courses";
  const toggle = () => setCollapsed((current) => { writeCollapsed(accountId, !current); return !current; });
  return <>
    <div className={styles.navGroup}>
      <NavItem to="/courses" active={coursesActive} icon={<BookOpen />}>{t("nav.courses")}</NavItem>
      {items.length > 0 && <button type="button" className={styles.disclosure} aria-expanded={!collapsed} aria-controls={listId}
        aria-label={t(collapsed ? "nav.showCourses" : "nav.hideCourses")} onClick={toggle}>
        <ChevronDown aria-hidden="true" data-collapsed={collapsed || undefined} />
      </button>}
    </div>
    {items.length > 0 && <ul id={listId} className={styles.subItems} hidden={collapsed} aria-label={t("nav.courseList")}>
      {items.map((course) => {
        const active = pathname === `/courses/${course.slug}` || pathname.startsWith(`/courses/${course.slug}/`);
        return <li key={course.id}>
          <Link aria-current={active ? "page" : undefined} className={styles.subItem} to="/courses/$courseSlug" params={{ courseSlug: course.slug }}>
            <SlidingLabel>{course.title}</SlidingLabel>
          </Link>
        </li>;
      })}
    </ul>}
  </>;
}

function AccountMenu({ trigger }: { trigger: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: () => apiRequest("/api/auth/sign-out", okResponseSchema, { method: "POST" }),
    onSuccess: async () => { queryClient.clear(); await navigate({ to: "/" }); },
  });
  // The trigger is always on the page when the menu opens; WebKit can misjudge a sticky rail as clipped and hide it.
  return <Menu position="top-end" width={240} withinPortal hideDetached={false}>
    <Menu.Target>{trigger}</Menu.Target>
    <Menu.Dropdown>
      <Menu.Item leftSection={<Settings size={16} aria-hidden="true" />} onClick={() => void navigate({ to: "/settings" })}>{t("nav.settings")}</Menu.Item>
      <Menu.Item color="var(--color-danger-text)" disabled={signOut.isPending} leftSection={<LogOut size={16} aria-hidden="true" />} onClick={() => signOut.mutate()}>{t("auth.signOut")}</Menu.Item>
    </Menu.Dropdown>
  </Menu>;
}

function Rail({ groupId, session, pathname }: { groupId: string; session: SignedInSession; pathname: string }) {
  const { t } = useTranslation();
  const { user } = session;
  const starts = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return <div className={styles.railBody}>
    <Brand />
    <nav className={styles.nav} aria-label={t("nav.primary")}>
      <CourseSubItems groupId={groupId} accountId={user.id} pathname={pathname} />
      <NavItem to="/words" active={starts("/words")} icon={<Bookmark />}>{t("nav.words")}</NavItem>
      <NavItem to="/journal" active={starts("/journal")} icon={<NotebookPen />}>{t("nav.journal")}</NavItem>
      <NavItem to="/ai" active={starts("/ai")} icon={<MessageCircle />}>{t("nav.tutor")}</NavItem>
      <NavItem to="/notifications" active={pathname === "/notifications"} icon={<Bell />}>{t("nav.notifications")}</NavItem>
    </nav>
    <div className={styles.profile}>
      <Avatar name={user.displayName} src={user.avatarUrl} tone="soft" />
      <div className={styles.profileText}>
        <strong>{user.displayName}</strong>
        {user.username && <span>@{user.username}</span>}
      </div>
      <AccountMenu trigger={<button aria-label={t("nav.accountMenu")} className={styles.profileMenu} type="button"><MoreHorizontal aria-hidden="true" /></button>} />
    </div>
  </div>;
}

export function GroupFrame({ children, groupId, session }: PropsWithChildren<{ groupId: string; session: SignedInSession }>) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);

  const rail = useRef<HTMLElement>(null);
  const [railWidth, setRailWidth] = useState(() => readRailWidth(session.user.id));
  const shellStyle = railWidth === null ? undefined : { "--size-app-rail": `${railWidth}px` } as CSSProperties;

  return <div className={styles.shell} style={shellStyle}>
    <aside ref={rail} className={styles.rail}>
      <Rail groupId={groupId} session={session} pathname={pathname} />
      <RailResizer accountId={session.user.id} rail={rail} width={railWidth} onWidth={setRailWidth} />
    </aside>
    <header className={styles.mobileHeader}>
      <button aria-label={t("nav.openMenu")} aria-expanded={drawer} className={styles.menuButton} type="button" onClick={() => setDrawer(true)}><MenuIcon aria-hidden="true" /></button>
      <Brand />
      <AccountMenu trigger={<button aria-label={t("nav.accountMenu")} className={styles.headerAvatar} type="button"><Avatar name={session.user.displayName} src={session.user.avatarUrl} tone="soft" /></button>} />
    </header>
    <Drawer opened={drawer} onClose={() => setDrawer(false)} size="var(--size-app-rail)" padding={0} withCloseButton={false} title={t("nav.primary")}
      classNames={{ content: styles.drawer, header: styles.drawerHeader }}>
      <Rail groupId={groupId} session={session} pathname={pathname} />
    </Drawer>
    <main className={styles.shellMain}>{children}</main>
  </div>;
}
