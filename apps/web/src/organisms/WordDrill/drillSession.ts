import { wordSearchKey, type WordDrillResult } from "@wordinator/contracts/lesson-document";

// A drill session's queue (docs/words.md#a-card). Cards are indices into the session's deck; the first in `queue` is shown.
// `first` holds each card's first grade, the only one sent; `shown` counts presentations, so a card shown again remounts.
// `done` lists the retired cards in the order they were retired (the Got it pile, last on top).
export type DrillState = {
  readonly queue: readonly number[];
  readonly retired: number;
  readonly done: readonly number[];
  readonly first: ReadonlyMap<number, WordDrillResult>;
  readonly shown: number;
};

export const startDrill = (size: number): DrillState => ({ queue: Array.from({ length: size }, (_, index) => index), retired: 0, done: [], first: new Map(), shown: 0 });

// Again puts the card at the end of the queue, so it comes back once every card ahead of it has been seen; Got it retires it.
export function gradeDrill(state: DrillState, result: WordDrillResult): DrillState {
  const [card, ...rest] = state.queue;
  if (card === undefined) return state;
  const first = state.first.has(card) ? state.first : new Map(state.first).set(card, result);
  if (result === "got") return { queue: rest, retired: state.retired + 1, done: [...state.done, card], first, shown: state.shown + 1 };
  return { queue: [...rest, card], retired: state.retired, done: state.done, first, shown: state.shown + 1 };
}

// The results page's headline tier (docs/words.md#end-of-session), by the share of cards Got it on the first try.
export type DrillTier = "perfect" | "good" | "keepGoing";
export const DRILL_GOOD_ACCURACY = 70;
export const drillTier = (accuracy: number): DrillTier => accuracy === 100 ? "perfect" : accuracy >= DRILL_GOOD_ACCURACY ? "good" : "keepGoing";

// The rounded mean of a session's pronunciation scores, or null when nothing was assessed.
export const averageScore = (scores: readonly number[]) => scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;

// A session's length as a count and unit: seconds under a minute, otherwise whole minutes (rounded).
export const drillDuration = (ms: number) => ms < 60_000
  ? { unit: "seconds" as const, count: Math.max(1, Math.round(ms / 1000)) }
  : { unit: "minutes" as const, count: Math.round(ms / 60_000) };

// The learner's last finished session, kept in this browser only (never sent to the API), namespaced by account.
export type LastDrill = { version: 1; accuracy: number; pronunciation: number | null; durationMs: number; finishedAt: string };
export const lastDrillKey = (accountId: string) => `wordinator:drill:last:v1:${accountId}`;
export function readLastDrill(accountId: string): LastDrill | null {
  try {
    const value = JSON.parse(localStorage.getItem(lastDrillKey(accountId)) ?? "null") as LastDrill | null;
    return value?.version === 1 ? value : null;
  } catch { return null; }
}
export function writeLastDrill(accountId: string, value: LastDrill) {
  try { localStorage.setItem(lastDrillKey(accountId), JSON.stringify(value)); } catch { /* Kept for this visit only. */ }
}

// Folds one character like `wordSearchKey`, without trimming, so positions in the folded text map back to the original.
const foldChar = (char: string) => char.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[ßẞ]/g, "ss").toLowerCase();

// The example's folded text with, for each folded character, the original range it came from.
function foldWithMap(text: string) {
  let folded = ""; const starts: number[] = []; const ends: number[] = [];
  let index = 0;
  for (const char of text) {
    const end = index + char.length;
    if (/\s/.test(char)) {
      if (!folded.endsWith(" ")) { folded += " "; starts.push(index); ends.push(end); } else ends[ends.length - 1] = end;
    } else {
      for (const part of foldChar(char)) { folded += part; starts.push(index); ends.push(end); }
    }
    index = end;
  }
  return { folded, starts, ends };
}

// A leading article is part of many terms ("het kaartje") but rarely of the example's wording, so it is tried without it too.
const LEADING_ARTICLE = /^(?:de|het|een|der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines) (?=\S)/;

export type ExampleSegment = { text: string; blank: boolean };

// The example with every occurrence of the term blanked, compared by search key; null when the example does not contain it.
export function blankExample(example: string, term: string): ExampleSegment[] | null {
  const { folded, starts, ends } = foldWithMap(example);
  const key = wordSearchKey(term);
  for (const needle of [key, key.replace(LEADING_ARTICLE, "")]) {
    if (!needle) continue;
    const ranges: Array<[number, number]> = [];
    for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + needle.length)) ranges.push([starts[at]!, ends[at + needle.length - 1]!]);
    if (!ranges.length) continue;
    const segments: ExampleSegment[] = [];
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) segments.push({ text: example.slice(cursor, start), blank: false });
      segments.push({ text: example.slice(start, end), blank: true });
      cursor = end;
    }
    if (cursor < example.length) segments.push({ text: example.slice(cursor), blank: false });
    return segments;
  }
  return null;
}
