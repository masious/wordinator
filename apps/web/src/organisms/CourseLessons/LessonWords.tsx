import type { LessonStep } from "@wordinator/contracts/lesson-document";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { WordBookmarkToggle } from "../WordBookmark/WordBookmark";
import { runWords, type RecapWord } from "../WordRecap/WordRecap";
import styles from "./LessonWords.module.css";

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

// Watches the anchored blocks inside `container` and returns the IDs of the words whose blocks are on screen. While the words
// panel sticks below the navigation bar, a block counts as on screen only below the panel's top, so blocks under the bar do not.
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

// Every new word of a lesson, in the order the player introduces them, beside the reading column. Words whose blocks are on
// screen are highlighted. When the panel scrolls on its own, it brings the highlighted words into view: centred when they fit,
// otherwise starting at the first of them. A highlighted range already in view stays put.
export function LessonWords({ steps, active, panelRef }: { steps: readonly LessonStep[]; active: ReadonlySet<string>; panelRef: RefObject<HTMLElement | null> }) {
  const { t } = useTranslation();
  const words: RecapWord[] = useMemo(() => runWords(steps), [steps]);
  const highlighted = words.filter((word) => active.has(word.id)).map((word) => word.id).join(" ");
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !highlighted || panel.scrollHeight <= panel.clientHeight) return;
    const items = [...panel.querySelectorAll<HTMLElement>("[aria-current]")]; if (!items.length) return;
    const frame = panel.getBoundingClientRect();
    // Positions inside the panel's scrolled content.
    const top = items[0]!.getBoundingClientRect().top - frame.top + panel.scrollTop;
    const bottom = items.at(-1)!.getBoundingClientRect().bottom - frame.top + panel.scrollTop;
    const view = panel.clientHeight; const margin = 16;
    if (top >= panel.scrollTop + margin && bottom <= panel.scrollTop + view - margin) return;
    const target = bottom - top + margin * 2 <= view ? (top + bottom - view) / 2 : top - margin;
    panel.scrollTo({ top: Math.max(0, Math.min(target, panel.scrollHeight - view)), behavior: "smooth" });
  }, [highlighted, panelRef]);
  if (!words.length) return null;
  return <aside ref={panelRef} className={styles.panel} aria-label={t("courses.words.title")}>
    <p className={styles.title} aria-hidden="true">{t("courses.words.title")}</p>
    <ul className={styles.list}>{words.map((word) => <li key={word.id} className={active.has(word.id) ? `${styles.word} ${styles.active}` : styles.word} aria-current={active.has(word.id) || undefined}>
      <p className={styles.head}><span className={styles.term}>{word.term}</span>{word.forms && <span className={styles.forms}>{word.forms}</span>}
        <span className={styles.bookmark}><WordBookmarkToggle wordId={word.id} term={word.term} /></span></p>
      <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
    </li>)}</ul>
  </aside>;
}
