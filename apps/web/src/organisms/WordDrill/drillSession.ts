import { wordSearchKey, type WordDrillResult } from "@wordinator/contracts/lesson-document";

// A drill session's queue (docs/words.md#a-card). Cards are indices into the session's deck; the first in `queue` is shown.
// `first` holds each card's first grade, the only one sent; `shown` counts presentations, so a card shown again remounts.
export type DrillState = {
  readonly queue: readonly number[];
  readonly retired: number;
  readonly first: ReadonlyMap<number, WordDrillResult>;
  readonly shown: number;
};

export const startDrill = (size: number): DrillState => ({ queue: Array.from({ length: size }, (_, index) => index), retired: 0, first: new Map(), shown: 0 });

// Again puts the card back three to five cards later (at the end when fewer remain); Got it retires it.
export function gradeDrill(state: DrillState, result: WordDrillResult, random: () => number = Math.random): DrillState {
  const [card, ...rest] = state.queue;
  if (card === undefined) return state;
  const first = state.first.has(card) ? state.first : new Map(state.first).set(card, result);
  if (result === "got") return { queue: rest, retired: state.retired + 1, first, shown: state.shown + 1 };
  const later = 3 + Math.min(2, Math.floor(random() * 3));
  rest.splice(Math.min(later, rest.length), 0, card);
  return { queue: rest, retired: state.retired, first, shown: state.shown + 1 };
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
