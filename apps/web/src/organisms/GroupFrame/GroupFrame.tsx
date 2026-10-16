import { Drawer, Menu, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { okResponseSchema } from "@wordinator/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, Bookmark, ChevronDown, LogOut, Menu as MenuIcon, MessageCircle, MoreHorizontal, NotebookPen, Settings } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type PropsWithChildren, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, coursesQueryOptions } from "../../api";
import { Avatar } from "../../ui";
import type { SignedInSession } from "../types/auth";
import styles from "./GroupFrame.module.css";

// The lesson page extends the rail (docs/courses.md#lesson-pages): its index renders under the current course's sub-item and its
// lesson box under the navigation, both through portals into the slots below. Only the rail on screen offers slots: the sticky
// rail on wide screens, the drawer's copy (while open) below the rail breakpoint. `openRail` and `closeRail` open and close that
// drawer; closing does nothing on wide screens. `reference` is the right rail, a full-height column docked to the window's right
// edge like the app rail, where the lesson page puts its vocabulary panel; it takes room only while filled.
export type RailSlots = { index: HTMLElement | null; tutor?: HTMLElement | null; box: HTMLElement | null; reference: HTMLElement | null; openRail: () => void; closeRail: () => void };
export const RailSlotsContext = createContext<RailSlots>({ index: null, tutor: null, box: null, reference: null, openRail: () => undefined, closeRail: () => undefined });
export const useRailSlots = () => useContext(RailSlotsContext);
type SlotRefs = { index: (element: HTMLElement | null) => void; tutor: (element: HTMLElement | null) => void; box: (element: HTMLElement | null) => void };
// The rail's breakpoint, matching the `68rem` media query in GroupFrame.module.css.
const RAIL_DRAWER_QUERY = "(max-width: 68rem)";

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

type NavTarget = "/courses" | "/words" | "/journal" | "/ai";
function NavItem({ to, active, icon, children }: { to: NavTarget; active: boolean; icon: ReactNode; children: ReactNode }) {
  return <Link aria-current={active ? "page" : undefined} className={styles.navItem} to={to}>
    <span aria-hidden="true" className={styles.navIcon}>{icon}</span><span className={styles.navLabel}>{children}</span>
  </Link>;
}
// The compact form of a navigation item: its icon alone, named by its label and showing it as a tooltip.
function NavIcon({ to, active, icon, label }: { to: NavTarget; active: boolean; icon: ReactNode; label: string }) {
  return <Tooltip label={label} withArrow events={{ hover: true, focus: true, touch: false }}>
    <Link aria-current={active ? "page" : undefined} aria-label={label} className={styles.navIconItem} to={to}><span aria-hidden="true" className={styles.navIcon}>{icon}</span></Link>
  </Tooltip>;
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
    const measure = () => {
      const { paddingLeft, paddingRight } = getComputedStyle(box);
      const content = box.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
      setOverflow(Math.max(0, Math.ceil(inner.scrollWidth - content)));
    };
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
// Collapsed, the list still shows the current course, so a lesson's index stays in reach. `promoted` raises Courses to the rail's
// heading while the other items are compact.
function CourseSubItems({ groupId, pathname, slots, collapsed, onToggle, promoted }: {
  groupId: string; pathname: string; slots: SlotRefs | null; collapsed: boolean; onToggle: () => void; promoted: boolean;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const courses = useInfiniteQuery(coursesQueryOptions(groupId));
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = courses;
  useEffect(() => { if (hasNextPage && !isFetchingNextPage) void fetchNextPage(); }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const items = courses.data?.pages.flatMap((page) => page.items) ?? [];
  const coursesActive = pathname === "/courses";
  const isActive = (slug: string) => pathname === `/courses/${slug}` || pathname.startsWith(`/courses/${slug}/`);
  const hasActive = items.some((course) => isActive(course.slug));
  return <>
    <div className={styles.navGroup} data-promoted={promoted || undefined}>
      <NavItem to="/courses" active={coursesActive} icon={<BookOpen />}>{t("nav.courses")}</NavItem>
      {items.length > 0 && <button type="button" className={styles.disclosure} aria-expanded={!collapsed} aria-controls={listId}
        aria-label={t(collapsed ? "nav.showCourses" : "nav.hideCourses")} onClick={onToggle}>
        <ChevronDown aria-hidden="true" data-collapsed={collapsed || undefined} />
      </button>}
    </div>
    {items.length > 0 && <ul id={listId} className={styles.subItems} hidden={collapsed && !hasActive} aria-label={t("nav.courseList")}>
      {items.map((course) => {
        const active = isActive(course.slug);
        const reading = active && pathname.startsWith(`/courses/${course.slug}/lessons/`);
        return <li key={course.id} hidden={collapsed && !active}>
          <Link aria-current={active ? "page" : undefined} className={styles.subItem} to="/courses/$courseSlug" params={{ courseSlug: course.slug }}>
            <SlidingLabel>{course.title}</SlidingLabel>
          </Link>
          {reading && slots && <div ref={slots.index} className={styles.lessonSlot} />}
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

function Rail({ groupId, session, pathname, slots }: { groupId: string; session: SignedInSession; pathname: string; slots: SlotRefs | null }) {
  const { t } = useTranslation();
  const { user } = session;
  const starts = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const [collapsed, setCollapsed] = useState(() => readCollapsed(user.id));
  const toggle = () => setCollapsed((current) => { writeCollapsed(user.id, !current); return !current; });
  // On a lesson page with the course list expanded, Courses becomes the rail's heading and the other items shrink to one row of
  // icons above the lesson box, leaving the height to the course list and the lesson index.
  const compact = !collapsed && /^\/courses\/[^/]+\/lessons\//.test(pathname);
  const others: Array<{ to: NavTarget; active: boolean; icon: ReactNode; label: string }> = [
    { to: "/words", active: starts("/words"), icon: <Bookmark />, label: t("nav.words") },
    { to: "/journal", active: starts("/journal"), icon: <NotebookPen />, label: t("nav.journal") },
    { to: "/ai", active: starts("/ai"), icon: <MessageCircle />, label: t("nav.tutor") },
  ];
  return <div className={styles.railBody}>
    <Brand />
    <nav className={styles.nav} aria-label={t("nav.primary")}>
      <CourseSubItems groupId={groupId} pathname={pathname} slots={slots} collapsed={collapsed} onToggle={toggle} promoted={compact} />
      {!compact && others.map((item) => <NavItem key={item.to} to={item.to} active={item.active} icon={item.icon}>{item.label}</NavItem>)}
      {!compact && starts("/ai") && slots && <div ref={slots.tutor} className={styles.tutorSlot} />}
    </nav>
    {compact && <nav className={styles.iconRow} aria-label={t("nav.more")}>
      {others.map((item) => <NavIcon key={item.to} {...item} />)}
    </nav>}
    {slots && <div ref={slots.box} className={styles.boxSlot} />}
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

// `fill` pins the frame to the window's height and hands the content column all of it, unpadded, for a page that scrolls its own
// regions (the tutor's chat) instead of the document.
export function GroupFrame({ children, groupId, session, fill = false }: PropsWithChildren<{ groupId: string; session: SignedInSession; fill?: boolean }>) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);

  const rail = useRef<HTMLElement>(null);
  const [railWidth, setRailWidth] = useState(() => readRailWidth(session.user.id));
  const shellStyle = railWidth === null ? undefined : { "--size-app-rail": `${railWidth}px` } as CSSProperties;

  const narrow = useMediaQuery(RAIL_DRAWER_QUERY, false, { getInitialValueInEffect: false });
  const [indexSlot, setIndexSlot] = useState<HTMLElement | null>(null);
  const [tutorSlot, setTutorSlot] = useState<HTMLElement | null>(null);
  const [boxSlot, setBoxSlot] = useState<HTMLElement | null>(null);
  const slotRefs = useMemo<SlotRefs>(() => ({ index: setIndexSlot, tutor: setTutorSlot, box: setBoxSlot }), []);
  const openRail = useCallback(() => setDrawer(true), []);
  const closeRail = useCallback(() => setDrawer(false), []);
  const [referenceSlot, setReferenceSlot] = useState<HTMLElement | null>(null);
  const slots = useMemo<RailSlots>(() => ({ index: indexSlot, tutor: tutorSlot, box: boxSlot, reference: referenceSlot, openRail, closeRail }), [indexSlot, tutorSlot, boxSlot, referenceSlot, openRail, closeRail]);

  return <RailSlotsContext.Provider value={slots}><div className={styles.shell} style={shellStyle} data-fill={fill || undefined}>
    <aside ref={rail} className={styles.rail}>
      <Rail groupId={groupId} session={session} pathname={pathname} slots={narrow ? null : slotRefs} />
      <RailResizer accountId={session.user.id} rail={rail} width={railWidth} onWidth={setRailWidth} />
    </aside>
    <header className={styles.mobileHeader}>
      <button aria-label={t("nav.openMenu")} aria-expanded={drawer} className={styles.menuButton} type="button" onClick={() => setDrawer(true)}><MenuIcon aria-hidden="true" /></button>
      <Brand />
      <AccountMenu trigger={<button aria-label={t("nav.accountMenu")} className={styles.headerAvatar} type="button"><Avatar name={session.user.displayName} src={session.user.avatarUrl} tone="soft" /></button>} />
    </header>
    <Drawer opened={drawer} onClose={() => setDrawer(false)} size="var(--size-app-rail)" padding={0} withCloseButton={false} title={t("nav.primary")}
      classNames={{ content: styles.drawer, header: styles.drawerHeader }}>
      <Rail groupId={groupId} session={session} pathname={pathname} slots={narrow ? slotRefs : null} />
    </Drawer>
    <main className={styles.shellMain}>{children}</main>
    <div ref={setReferenceSlot} className={styles.referenceRail} />
  </div></RailSlotsContext.Provider>;
}
