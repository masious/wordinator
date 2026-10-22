import { normalizeAnswer } from "./index";

// Answer marks (docs pending): a word-level diff of a typed answer against its target (the judge's minimal correction of the
// learner's own sentence, or a dictation's sentence). Words compare by the
// shared answer normalisation, so capitals, accents, and punctuation never count. Between matching words, extra and missing words
// pair up as wrong words; a wrong word one or two letters off is a typo; a word that is extra in one place and missing in another
// is moved.

export type WordDiff =
  | { type: "same"; given: string }
  | { type: "wrong"; given: string; expected: string }
  | { type: "typo"; given: string; expected: string; chars: Array<{ text: string; kind: "same" | "extra" | "missing" }> }
  | { type: "extra"; given: string }
  | { type: "missing"; expected: string; before: string | null }
  | { type: "moved"; given: string; after: string | null; before: string | null };

const key = (word: string) => normalizeAnswer(word);

function lcsTable<T>(left: readonly T[], right: readonly T[]): number[][] {
  const table = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1) {
    table[i]![j] = left[i] === right[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  }
  return table;
}

export function levenshtein(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[right.length]!;
}

// The letters of a near miss: kept, extra (typed but not expected), and missing (expected but not typed).
function charDiff(given: string, expected: string): Array<{ text: string; kind: "same" | "extra" | "missing" }> {
  const a = [...given.toLowerCase()]; const b = [...expected.toLowerCase()];
  const table = lcsTable(a, b);
  const out: Array<{ text: string; kind: "same" | "extra" | "missing" }> = [];
  const push = (text: string, kind: "same" | "extra" | "missing") => {
    const last = out[out.length - 1];
    if (last?.kind === kind) last.text += text; else out.push({ text, kind });
  };
  let i = 0; let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push([...given][i]!, "same"); i += 1; j += 1; }
    else if (j < b.length && (i >= a.length || table[i]![j + 1]! >= table[i + 1]![j]!)) { push([...expected][j]!, "missing"); j += 1; }
    else { push([...given][i]!, "extra"); i += 1; }
  }
  return out;
}

export function diffWords(answer: string, reference: string): WordDiff[] {
  const given = answer.trim().split(/\s+/).filter((word) => key(word));
  const expected = reference.trim().split(/\s+/).filter((word) => key(word));
  const a = given.map(key); const b = expected.map(key);
  const table = lcsTable(a, b);
  const out: WordDiff[] = [];
  let extras: string[] = []; let missing: string[] = [];
  // Closes a gap between matching words: pairs extra and missing words in order, then keeps what is left.
  const close = (next: string | null) => {
    const pairs = Math.min(extras.length, missing.length);
    for (let index = 0; index < pairs; index += 1) {
      const typed = extras[index]!; const wanted = missing[index]!;
      const distance = levenshtein(key(typed), key(wanted));
      out.push(distance <= 2 && key(wanted).length > 3 ? { type: "typo", given: typed, expected: wanted, chars: charDiff(typed, wanted) } : { type: "wrong", given: typed, expected: wanted });
    }
    for (const typed of extras.slice(pairs)) out.push({ type: "extra", given: typed });
    // Missing words of one gap are one entry: "een bos", not two.
    const left = missing.slice(pairs);
    if (left.length) out.push({ type: "missing", expected: left.join(" "), before: next });
    extras = []; missing = [];
  };
  let i = 0; let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { close(given[i]!); out.push({ type: "same", given: given[i]! }); i += 1; j += 1; }
    else if (j < b.length && (i >= a.length || table[i]![j + 1]! >= table[i + 1]![j]!)) { missing.push(expected[j]!); j += 1; }
    else { extras.push(given[i]!); i += 1; }
  }
  close(null);
  // A word extra in one place and missing in another moved: the extra one says where it belongs, the missing one goes.
  for (const entry of out) {
    if (entry.type !== "extra") continue;
    const at = out.findIndex((other) => other.type === "missing" && key(other.expected) === key(entry.given));
    if (at === -1) continue;
    const target = out[at] as Extract<WordDiff, { type: "missing" }>;
    const previous = out.slice(0, at).reverse().find((other) => other.type !== "missing" && other.type !== "extra");
    Object.assign(entry, { type: "moved", after: previous && "given" in previous ? previous.given : null, before: target.before });
    out.splice(at, 1);
  }
  return out;
}

/** Edits a diff counts: everything but matching words. */
export const diffEdits = (diff: readonly WordDiff[]) => diff.filter((entry) => entry.type !== "same").length;

// An answer is shown with its marks only when it has at most this many mistakes; past that, the expected answer reads better.
export const ANSWER_MARKS_MAX = 3;
