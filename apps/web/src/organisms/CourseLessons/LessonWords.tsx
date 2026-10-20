import { wordSearchKey, type LessonStep } from "@wordinator/contracts/lesson-document";
import { ChevronDown, PanelRightClose, PanelRightOpen } from "lucide-react";
import { type ReactNode, type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpeechResolver } from "../../molecules/Speech";
import { IconButton } from "../../ui";
import { runWords, type RecapWord } from "../WordRecap/WordRecap";
import { LibraryWordResults, WordSearchControls, type WordSearchMode } from "./LessonWordSearch";
import styles from "./LessonWords.module.css";
import { PanelWord } from "./PanelWord";

// The blocks whose visibility lights up a step's words: the block the step shows, or every block of a prose step. A words-only
// step (New words with nothing after them in their section) borrows the step before it, or the one after it at a lesson's start.
function stepAnchors(step: LessonStep): string[] {
  switch (step.kind) {
    case "content": return step.blocks.map((block) => block.id);
    case "words": return [];
    default: return [step.block.id];
  }
}
export function wordAnchors(steps: readonly LessonStep[]): Map<string, Set<string>> {
  const anchors = new Map<string, Set<string>>();
  steps.forEach((step, index) => {
    if (!step.words.length) return;
    const neighbour = steps.slice(0, index).reverse().find((entry) => entry.kind !== "words") ?? steps.slice(index + 1).find((entry) => entry.kind !== "words");
    const ids = step.kind === "words" ? (neighbour ? stepAnchors(neighbour) : []) : stepAnchors(step);
    for (const id of ids) {
      const words = anchors.get(id) ?? new Set<string>();
      for (const word of step.words) words.add(word.id);
      anchors.set(id, words);
    }
  });
  return anchors;
}

// Watches the anchored blocks inside `container` and returns the IDs of the words whose blocks are on screen. While the side
// column (`panel`) sticks near the top of the window, a block counts as on screen only below the column's top.
export function useVisibleWords(container: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>, steps: readonly LessonStep[]) {
  const anchors = useMemo(() => wordAnchors(steps), [steps]);
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const root = container.current;
    if (!root || !anchors.size || typeof IntersectionObserver === "undefined") return;
    const shown = new Set<string>();
    const style = panel.current ? getComputedStyle(panel.current) : null;
    const inset = style?.position === "sticky" ? parseFloat(style.top) || 0 : 0;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.blockId!;
        if (entry.isIntersecting) shown.add(id); else shown.delete(id);
      }
      setVisible(new Set([...shown].flatMap((id) => [...anchors.get(id) ?? []])));
    }, { rootMargin: `-${Math.round(inset)}px 0px 0px 0px` });
    root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((element) => { if (anchors.has(element.dataset.blockId!)) observer.observe(element); });
    return () => observer.disconnect();
  }, [anchors, container, panel]);
  return visible;
}

// When `panel` scrolls on its own, brings its `selector` items (`[aria-current]` by default) into view whenever `highlighted`
// changes: centred when they fit, otherwise starting at the first of them. A highlighted range already in view stays put.
export function useRevealCurrent(panelRef: RefObject<HTMLElement | null>, highlighted: string, selector = "[aria-current]") {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !highlighted || panel.scrollHeight <= panel.clientHeight) return;
    const items = [...panel.querySelectorAll<HTMLElement>(selector)]; if (!items.length) return;
    const frame = panel.getBoundingClientRect();
    // Positions inside the panel's scrolled content.
    const top = items[0]!.getBoundingClientRect().top - frame.top + panel.scrollTop;
    const bottom = items.at(-1)!.getBoundingClientRect().bottom - frame.top + panel.scrollTop;
    const view = panel.clientHeight; const margin = 16;
    if (top >= panel.scrollTop + margin && bottom <= panel.scrollTop + view - margin) return;
    const target = bottom - top + margin * 2 <= view ? (top + bottom - view) / 2 : top - margin;
    panel.scrollTo({ top: Math.max(0, Math.min(target, panel.scrollHeight - view)), behavior: "smooth" });
  }, [highlighted, panelRef, selector]);
}

// Whether the viewer keeps the lesson page's New words panel collapsed. It is a per-device convenience, so storage that cannot be
// read or written leaves the panel open.
const COLLAPSED_KEY = "wordinator:ui:v1:lesson-words-collapsed";
export function useWordsCollapsed() {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; } });
  const toggle = useCallback(() => setCollapsed((value) => {
    try { if (value) localStorage.removeItem(COLLAPSED_KEY); else localStorage.setItem(COLLAPSED_KEY, "1"); } catch { /* keep the choice for this visit only */ }
    return !value;
  }), []);
  return [collapsed, toggle] as const;
}

// Every new word of a lesson, in the order the player introduces them: the lesson page's vocabulary panel. Words whose blocks are on
// screen are highlighted and brought into view. A search box at the top filters the lesson's words by term, forms, or meaning;
// with a library, the search can instead run across the whole library (see LessonWordSearch). Its `placement`:
// - `rail`: fills the frame's right rail and scrolls on its own, the search row pinned to its top. A `collapsible` rail panel
//   collapses to a slim column (`data-rail-slim` narrows the rail) holding only Show new words and the highlighted count.
// - `under`: a card under the text, scrolled with the page; a `collapsible` one collapses to its title, which then counts the
//   highlighted words.
// - `sheet`: the body of the phone's bottom sheet, which names it, so the panel shows no title of its own; it scrolls on its own
//   with the search row pinned, and never collapses.
// A `footer` (told whether the panel is slim) sits in its own box pinned to the panel's bottom edge, also while it is slim.
export type LessonWordsPlacement = "rail" | "under" | "sheet";
export function LessonWords({ steps, active, groupId, collapsed = false, onToggle, collapsible = true, placement = "under", footer }: {
  steps: readonly LessonStep[]; active: ReadonlySet<string>; groupId?: string; collapsed?: boolean; onToggle?: () => void; collapsible?: boolean;
  placement?: LessonWordsPlacement; footer?: (compact: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const speech = useSpeechResolver();
  const panelRef = useRef<HTMLElement>(null); const bodyId = useId();
  const words: RecapWord[] = useMemo(() => runWords(steps), [steps]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<WordSearchMode>("lesson");
  const key = wordSearchKey(query);
  const shown = useMemo(() => key ? words.filter((word) => [word.term, word.meaning, word.forms ?? ""].some((value) => wordSearchKey(value).includes(key))) : words, [words, key]);
  const library = mode === "library" && Boolean(groupId);
  const docked = placement === "rail"; const sheet = placement === "sheet";
  const closed = collapsible && !sheet && collapsed;
  const highlighted = words.filter((word) => active.has(word.id)).length;
  useRevealCurrent(panelRef, library || closed ? "" : shown.filter((word) => active.has(word.id)).map((word) => word.id).join(" "));
  if (!words.length) return null;
  const slim = docked && closed;
  const title = <><span className={styles.title}>{t("courses.words.title")}</span>
    <span className={styles.total} aria-hidden="true">{words.length}</span>
    {closed && highlighted > 0 && <span className={styles.count}>{t("courses.words.highlighted", { count: highlighted })}</span>}</>;
  const footerBox = footer && <div className={styles.footer}>{footer(slim)}</div>;
  if (slim) return <aside ref={panelRef} className={`${styles.panel} ${styles.docked} ${styles.slim}`} data-collapsed data-rail-slim aria-label={t("courses.words.title")}>
    <div className={styles.slimHead}>
      <IconButton tone="quiet" size="sm" label={t("courses.words.show")} title={t("courses.words.show")} aria-expanded={false} onClick={onToggle}>
        <PanelRightOpen aria-hidden="true" />
      </IconButton>
      {highlighted > 0 && <span className={styles.count} aria-label={t("courses.words.highlighted", { count: highlighted })}>{highlighted}</span>}
    </div>
    {footerBox}
  </aside>;
  return <aside ref={panelRef} className={`${styles.panel} ${docked ? styles.docked : sheet ? styles.sheet : ""}`} data-collapsed={closed || undefined} aria-label={t("courses.words.title")}>
    {sheet ? null : collapsible
      ? <button type="button" className={styles.toggle} aria-expanded={!closed} aria-controls={closed ? undefined : bodyId} onClick={onToggle}>
        {title}{docked
          ? <PanelRightClose aria-hidden="true" size={16} className={styles.chevron} />
          : <ChevronDown aria-hidden="true" size={16} className={styles.chevron} />}
      </button>
      : <div className={styles.toggle}>{title}</div>}
    {!closed && <div id={bodyId} className={styles.body}>
      <WordSearchControls query={query} onQuery={setQuery} mode={groupId ? mode : null} onMode={setMode} />
      {library && groupId ? <LibraryWordResults groupId={groupId} query={query} /> : <>
        {key && !shown.length && <p className={styles.status} role="status">{t("courses.words.search.noLessonMatches")}</p>}
        <ul className={styles.list}>{shown.map((word) => <PanelWord key={word.id} word={word} termSpeech={speech(`word:${word.id}`)} exampleSpeech={speech(`wordExample:${word.id}`)}
          active={active.has(word.id)} className={active.has(word.id) ? `${styles.word} ${styles.active}` : styles.word} />)}</ul>
      </>}
    </div>}
    {footerBox}
  </aside>;
}
