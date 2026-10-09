export type GridFit = { columns: number; rows: number };

const px = (value: string) => Number.parseFloat(value) || 0;

// Rows of `cardHeight` cards, `gap` apart, that fit in `available` pixels; always at least one.
export function fitRows(available: number, cardHeight: number, gap: number): number {
  if (!(cardHeight > 0)) return 1;
  return Math.max(1, Math.floor((available + gap) / (cardHeight + gap)));
}

// Height taken below `element` up to and including `frame`: later visible siblings with their gaps, and every ancestor's bottom
// padding and border.
function spaceBelow(element: HTMLElement, frame: HTMLElement): number {
  let total = 0;
  let node: HTMLElement = element;
  while (node !== frame) {
    const parent = node.parentElement;
    if (!parent) break;
    const style = getComputedStyle(parent);
    for (let sibling = node.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      if (sibling instanceof HTMLElement && sibling.offsetHeight > 0) total += sibling.offsetHeight + px(style.rowGap);
    }
    total += px(style.paddingBottom) + px(style.borderBottomWidth);
    node = parent;
  }
  return total;
}

// How many cards of `grid` fit inside `recap` without scrolling. Columns come from the grid's CSS tracks; rows from the height the
// recap's frame allows (a dialog's content box, or else the first screen of the page above any `[data-fit-bottom]` bar) minus
// everything around the grid. Every term is measured
// independently of the grid's own height, so applying the result never changes the next measurement.
export function measureFit(grid: HTMLElement, recap: HTMLElement): GridFit {
  const style = getComputedStyle(grid);
  const columns = Math.max(1, style.gridTemplateColumns.split(" ").filter(Boolean).length);
  const frame = recap.closest<HTMLElement>(".mantine-Modal-content");
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  let budget: number; let above: number; let below: number;
  if (frame) {
    const inner = frame.parentElement;
    const innerStyle = inner ? getComputedStyle(inner) : null;
    budget = inner && innerStyle ? inner.clientHeight - px(innerStyle.paddingTop) - px(innerStyle.paddingBottom) : viewport;
    const maxHeight = px(getComputedStyle(frame).maxHeight);
    if (maxHeight > 0) budget = Math.min(budget, maxHeight);
    above = recap.getBoundingClientRect().top - frame.getBoundingClientRect().top + frame.scrollTop;
    below = spaceBelow(recap, frame);
  } else {
    // On a page the cards fit the first screen, above a fixed bottom bar (the mobile dock) when one shows. The page's own bottom
    // padding is not counted: on wide screens it is only whitespace.
    const bar = [...document.querySelectorAll<HTMLElement>("[data-fit-bottom]")].find((element) => element.offsetHeight > 0);
    budget = (bar ? bar.getBoundingClientRect().top : viewport) - px(getComputedStyle(recap).rowGap);
    above = recap.getBoundingClientRect().top + window.scrollY;
    below = 0;
  }
  const around = recap.offsetHeight - grid.offsetHeight;
  return { columns, rows: fitRows(budget - above - below - around, px(style.gridAutoRows), px(style.rowGap)) };
}
