import { Drawer, Menu, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { okResponseSchema } from "@wordinator/contracts";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, Bookmark, ChartNoAxesColumnIncreasing, ChevronDown, ChevronLeft, LogOut, Menu as MenuIcon, MessageCircle, MoreHorizontal, NotebookPen, Settings } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type PropsWithChildren, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, coursesQueryOptions } from "../../api";
import { Avatar } from "../../ui";
import { StudyTimeBox, useFiguresOpen } from "../StudyTime/StudyTime";
import type { SignedInSession } from "../types/auth";
import styles from "./GroupFrame.module.css";

// The lesson page has its own rail (docs/courses.md#lesson-pages): Back to course, then its lesson box and its index, through
// portals into the slots below; its actions have a slot in the drawer only (on wide screens they sit in the vocabulary panel).
// Only the rail on screen offers slots: the sticky rail on wide screens, the drawer's copy (while open) below the rail breakpoint.
// `openRail` and `closeRail` open and close that drawer; closing does nothing on wide screens. `reference` is the right rail, a
// full-height column docked to the window's right edge like the app rail, where the lesson page puts its vocabulary panel; it
// takes room only while filled, and only a slim column of icons while its content carries `data-rail-slim`.
// `studyOpen` says whether the rail's Study time card is shown; the lesson box shrinks while it is.
export type RailSlots = { index: HTMLElement | null; tutor?: HTMLElement | null; box: HTMLElement | null; actions?: HTMLElement | null; reference: HTMLElement | null; openRail: () => void; closeRail: () => void; studyOpen?: boolean };
export const RailSlotsContext = createContext<RailSlots>({ index: null, tutor: null, box: null, actions: null, reference: null, openRail: () => undefined, closeRail: () => undefined, studyOpen: false });
export const useRailSlots = () => useContext(RailSlotsContext);
type SlotRef = (element: HTMLElement | null) => void;
type SlotRefs = { index: SlotRef; tutor: SlotRef; box: SlotRef; actions: SlotRef };
// The rail's breakpoint, matching the `68rem` media query in GroupFrame.module.css.
export const RAIL_DRAWER_QUERY = "(max-width: 68rem)";

// The collapsed course list is a per-device convenience, kept per account, for course and lesson pages only (other pages start
// collapsed); storage may be unavailable, so it falls back to expanded.
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
// Collapsed, the list still shows the current course.
function CourseSubItems({ groupId, pathname, collapsed, onToggle }: { groupId: string; pathname: string; collapsed: boolean; onToggle: () => void }) {
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
    <div className={styles.navGroup}>
      <NavItem to="/courses" active={coursesActive} icon={<BookOpen />}>{t("nav.courses")}</NavItem>
      {items.length > 0 && <button type="button" className={styles.disclosure} aria-expanded={!collapsed} aria-controls={listId}
        aria-label={t(collapsed ? "nav.showCourses" : "nav.hideCourses")} onClick={onToggle}>
        <ChevronDown aria-hidden="true" data-collapsed={collapsed || undefined} />
      </button>}
    </div>
    {items.length > 0 && <ul id={listId} className={styles.subItems} hidden={collapsed && !hasActive} aria-label={t("nav.courseList")}>
      {items.map((course) => {
        const active = isActive(course.slug);
        return <li key={course.id} hidden={collapsed && !active}>
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

// Whether the rail's scrolling part has more above and below its fold, so those edges can fade. It follows the scroll and both the
// part's and its content's size, since the lesson index grows the content without resizing the part.
function useMoreBeyond(scroller: RefObject<HTMLElement | null>) {
  const [more, setMore] = useState({ above: false, below: false });
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const measure = () => {
      const above = element.scrollTop > 1; const below = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      setMore((current) => current.above === above && current.below === below ? current : { above, below });
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => { element.removeEventListener("scroll", measure); observer?.disconnect(); };
  }, [scroller]);
  return more;
}

// The rail's scrolling part; its top and bottom edges fade while there is more beyond them.
function RailScroll({ className, children }: { className?: string; children: ReactNode }) {
  const scroll = useRef<HTMLDivElement>(null);
  const more = useMoreBeyond(scroll);
  return <div ref={scroll} className={`${styles.railScroll} ${className ?? ""}`} data-rail-scroll
    data-more-above={more.above || undefined} data-more-below={more.below || undefined}>{children}</div>;
}

// The Study time card's shown or hidden choice, one for every page (docs/learning-time.md#study-time).
const STUDY_OPEN_KEY = "wordinator:ui:v1:rail-study-open";
type StudyToggle = { open: boolean; onToggle: () => void };

// The Study time card above the profile row, while the profile row's toggle shows it: it grows in from zero height. Only the rail
// on screen renders it, so its read runs once.
function StudyCard({ id, groupId, open, shown }: { id: string; groupId: string; open: boolean; shown: boolean }) {
  return <div id={id} className={styles.studyReveal} data-open={open || undefined} inert={!open}>
    <div className={styles.studyInner}>{open && shown && <StudyTimeBox groupId={groupId} />}</div>
  </div>;
}

// The profile row: the avatar, display name and handle, the Study time toggle, and the account menu.
function Profile({ user, study, studyId }: { user: SignedInSession["user"]; study: StudyToggle; studyId: string }) {
  const { t } = useTranslation();
  return <div className={styles.profile}>
    <Avatar name={user.displayName} src={user.avatarUrl} tone="soft" />
    <div className={styles.profileText}>
      <strong>{user.displayName}</strong>
      {user.username && <span>@{user.username}</span>}
    </div>
    <Tooltip label={t(study.open ? "nav.hideStudyTime" : "nav.showStudyTime")} withArrow events={{ hover: true, focus: true, touch: false }}>
      <button type="button" className={styles.profileMenu} aria-label={t("studyTime.title")} aria-expanded={study.open} aria-controls={studyId} onClick={study.onToggle}>
        <ChartNoAxesColumnIncreasing aria-hidden="true" />
      </button>
    </Tooltip>
    <AccountMenu trigger={<button aria-label={t("nav.accountMenu")} className={styles.profileMenu} type="button"><MoreHorizontal aria-hidden="true" /></button>} />
  </div>;
}

// A lesson page's rail (docs/courses.md#lesson-box): Back to course, the lesson box, and the lesson's index, which alone scrolls;
// then the other navigation items as a row of icons. The lesson's actions sit in the drawer only: on wide screens they are in the
// New words panel's footer (docs/courses.md#lesson-box).
function LessonRail({ courseSlug, courseTitle, pathname, slots, others, drawer }: {
  courseSlug: string; courseTitle?: string; pathname: string; slots: SlotRefs | null; others: Array<{ to: NavTarget; active: boolean; icon: ReactNode; label: string }>; drawer: boolean;
}) {
  const { t } = useTranslation();
  return <>
    <Link className={styles.back} to="/courses/$courseSlug" params={{ courseSlug }}><ChevronLeft aria-hidden="true" />{courseTitle ? t("courses.lessons.backToCourse", { title: courseTitle }) : t("nav.backToCourse")}</Link>
    {slots && <div ref={slots.box} className={styles.lessonBoxSlot} />}
    <RailScroll className={styles.lessonScroll}>{slots && <div ref={slots.index} className={styles.lessonSlot} />}</RailScroll>
    <nav className={styles.iconRow} aria-label={t("nav.primary")}>
      <NavIcon to="/courses" active={pathname === "/courses"} icon={<BookOpen />} label={t("nav.courses")} />
      {others.map((item) => <NavIcon key={item.to} {...item} />)}
    </nav>
    {drawer && slots && <div ref={slots.actions} className={styles.boxSlot} />}
  </>;
}

function Rail({ groupId, session, pathname, slots, study, courseTitle, drawer = false }: { groupId: string; session: SignedInSession; pathname: string; slots: SlotRefs | null; study: StudyToggle; courseTitle?: string; drawer?: boolean }) {
  const { t } = useTranslation();
  const { user } = session;
  const studyId = useId();
  const starts = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  // On course pages the course list follows the remembered choice; elsewhere it starts collapsed, and opening it there lasts only
  // until the viewer leaves for a course page or another page outside them.
  const inCourses = starts("/courses");
  const [stored, setStored] = useState(() => readCollapsed(user.id));
  const [openedOutside, setOpenedOutside] = useState(false);
  useEffect(() => setOpenedOutside(false), [inCourses]);
  const collapsed = inCourses ? stored : !openedOutside;
  const toggle = () => {
    if (!inCourses) { setOpenedOutside((current) => !current); return; }
    setStored((current) => { writeCollapsed(user.id, !current); return !current; });
  };
  const lessonCourse = /^\/courses\/([^/]+)\/lessons\//.exec(pathname)?.[1];
  const others: Array<{ to: NavTarget; active: boolean; icon: ReactNode; label: string }> = [
    { to: "/words", active: starts("/words"), icon: <Bookmark />, label: t("nav.words") },
    { to: "/journal", active: starts("/journal"), icon: <NotebookPen />, label: t("nav.journal") },
    { to: "/ai", active: starts("/ai"), icon: <MessageCircle />, label: t("nav.tutor") },
  ];
  return <div className={styles.railBody}>
    <Brand />
    {lessonCourse ? <LessonRail courseSlug={decodeURIComponent(lessonCourse)} courseTitle={courseTitle} pathname={pathname} slots={slots} others={others} drawer={drawer} />
      : <RailScroll>
        <nav className={styles.nav} aria-label={t("nav.primary")}>
          <CourseSubItems groupId={groupId} pathname={pathname} collapsed={collapsed} onToggle={toggle} />
          {others.map((item) => <NavItem key={item.to} to={item.to} active={item.active} icon={item.icon}>{item.label}</NavItem>)}
          {starts("/ai") && slots && <div ref={slots.tutor} className={styles.tutorSlot} />}
        </nav>
      </RailScroll>}
    <StudyCard id={studyId} groupId={groupId} open={study.open} shown={slots !== null} />
    <Profile user={user} study={study} studyId={studyId} />
  </div>;
}

// `fill` pins the frame to the window's height and hands the content column all of it, unpadded, for a page that scrolls its own
// regions (the tutor's chat) instead of the document.
export function GroupFrame({ children, groupId, session, fill = false, courseTitle }: PropsWithChildren<{ groupId: string; session: SignedInSession; fill?: boolean; courseTitle?: string }>) {
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
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const slotRefs = useMemo<SlotRefs>(() => ({ index: setIndexSlot, tutor: setTutorSlot, box: setBoxSlot, actions: setActionsSlot }), []);
  const openRail = useCallback(() => setDrawer(true), []);
  const closeRail = useCallback(() => setDrawer(false), []);
  const [referenceSlot, setReferenceSlot] = useState<HTMLElement | null>(null);
  const [studyOpen, toggleStudy] = useFiguresOpen(STUDY_OPEN_KEY);
  const study = useMemo(() => ({ open: studyOpen, onToggle: toggleStudy }), [studyOpen, toggleStudy]);
  const slots = useMemo<RailSlots>(() => ({ index: indexSlot, tutor: tutorSlot, box: boxSlot, actions: actionsSlot, reference: referenceSlot, openRail, closeRail, studyOpen }), [indexSlot, tutorSlot, boxSlot, actionsSlot, referenceSlot, openRail, closeRail, studyOpen]);

  return <RailSlotsContext.Provider value={slots}><div className={styles.shell} style={shellStyle} data-fill={fill || undefined}>
    <aside ref={rail} className={styles.rail}>
      <Rail groupId={groupId} session={session} pathname={pathname} slots={narrow ? null : slotRefs} study={study} courseTitle={courseTitle} />
      <RailResizer accountId={session.user.id} rail={rail} width={railWidth} onWidth={setRailWidth} />
    </aside>
    <header className={styles.mobileHeader}>
      <button aria-label={t("nav.openMenu")} aria-expanded={drawer} className={styles.menuButton} type="button" onClick={() => setDrawer(true)}><MenuIcon aria-hidden="true" /></button>
      <Brand />
      <AccountMenu trigger={<button aria-label={t("nav.accountMenu")} className={styles.headerAvatar} type="button"><Avatar name={session.user.displayName} src={session.user.avatarUrl} tone="soft" /></button>} />
    </header>
    <Drawer opened={drawer} onClose={() => setDrawer(false)} size="80%" padding={0} withCloseButton={false} title={t("nav.primary")}
      classNames={{ content: styles.drawer, header: styles.drawerHeader }}>
      <Rail groupId={groupId} session={session} pathname={pathname} slots={narrow ? slotRefs : null} study={study} courseTitle={courseTitle} drawer />
    </Drawer>
    <main className={styles.shellMain}>{children}</main>
    <div ref={setReferenceSlot} className={styles.referenceRail} />
  </div></RailSlotsContext.Provider>;
}
