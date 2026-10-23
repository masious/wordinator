import { wordSearchKey, type VocabularyWord } from "@wordinator/contracts/lesson-document";

// Prototype: finds a lesson's new words in its text, so the reader can mark them and open their hovercards. Text and words are
// compared by search key (`wordSearchKey`), word by word, ignoring punctuation. A word is written as its term or any of its forms
// (split on `·`, `/`, `,`, or `;`), with a leading article optional. Close inflections match too: Dutch words take the regular
// verb, plural, and adjective endings with their spelling changes (wonen → woon, woont, gewoond; groot → grote; huis → huizen),
// and in every language a single word matches a text word that shares nearly all of its start (komen → kom, komt). Separable
// verbs split across the sentence (opstaan → sta … op) are not found.
export type WordSpan = { start: number; end: number; wordId: string };
export type MatchLanguage = "nl" | "de";

type Token = { key: string; start: number; end: number };

const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const ARTICLES = new Set(["de", "het", "een", "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines"]);

function tokenize(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((match) => ({ key: wordSearchKey(match[0]).replace(/’/g, "'"), start: match.index, end: match.index + match[0].length }));
}

// The written variants of a word as lists of token keys: the term and each form, each also without a leading article.
export function wordVariants(word: Pick<VocabularyWord, "term" | "forms">): string[][] {
  const sources = [word.term, ...(word.forms ?? "").split(/[·/,;]/)];
  const variants = new Map<string, string[]>();
  for (const source of sources) {
    const keys = tokenize(source.replace(/\([^)]*\)/g, " ")).map((token) => token.key);
    if (!keys.length) continue;
    variants.set(keys.join(" "), keys);
    if (keys.length > 1 && ARTICLES.has(keys[0]!)) variants.set(keys.slice(1).join(" "), keys.slice(1));
  }
  return [...variants.values()];
}

const DIPHTHONG = /(?:aa|ee|oo|uu|ie|oe|ui|ei|ij|ou|au|eu)[fs]$/;
const voiceless = (stem: string) => stem.replace(/v$/, "f").replace(/z$/, "s");
const voiced = (base: string) => DIPHTHONG.test(base) ? base.replace(/f$/, "v").replace(/s$/, "z") : base;

// Regular Dutch inflections of one word. Over-generating is harmless: matching only looks inside the block the word belongs to.
export function dutchInflections(key: string): string[] {
  const forms = new Set<string>();
  if (key.length > 4 && key.endsWith("en")) {
    // A verb (or a plural): the stem drops -en, a doubled consonant, and voicing, and keeps a long vowel long (wonen → woon).
    let stem = key.slice(0, -2);
    if (/([^aeiou])\1$/.test(stem)) stem = stem.slice(0, -1);
    const stems = new Set([voiceless(stem)]);
    if (/(?:^|[^aeiou])[aeiou][^aeiou]$/.test(stem)) stems.add(voiceless(stem.slice(0, -1) + stem.at(-2)! + stem.at(-1)!));
    for (const base of stems) for (const ending of ["", "t", "te", "de", "ten", "den"]) forms.add(base + ending);
    for (const base of stems) { forms.add(`ge${base}t`); forms.add(`ge${base}d`); }
  } else {
    // A noun or adjective takes -e, -en, and -s: a long vowel loses its double (groot → grote), a short one doubles the consonant
    // (wit → witte), and f and s after a long vowel are voiced (huis → huizen).
    const long = /([aeiou])\1([^aeiou])$/.exec(key);
    const short = /(?:^|[^aeiou])[aeiou]([bdfgklmnprst])$/.exec(key);
    const base = long ? key.slice(0, -3) + long[1] + long[2] : short ? key + short[1] : key;
    for (const stem of new Set([voiced(base), voiced(key)])) { forms.add(`${stem}e`); forms.add(`${stem}en`); }
    forms.add(`${key}s`); forms.add(`${key}'s`);
  }
  forms.delete(key);
  return [...forms];
}

// Two single words are close when they share at least three leading letters and differ only in the last letter or so of the
// shorter one, at most three letters apart in length: kom and komt for komen, but not wat for waar.
export function closeForms(a: string, b: string): boolean {
  const shorter = Math.min(a.length, b.length);
  if (shorter < 3 || Math.abs(a.length - b.length) > 3) return false;
  let shared = 0;
  while (shared < shorter && a[shared] === b[shared]) shared += 1;
  return shared >= 3 && shared >= shorter - 1;
}

type Pattern = { wordId: string; positions: Array<{ key: string; accepts: Set<string> }> };

function patterns(words: readonly Pick<VocabularyWord, "id" | "term" | "forms">[], language: MatchLanguage): Pattern[] {
  return words.flatMap((word) => wordVariants(word).map((keys) => ({
    wordId: word.id,
    positions: keys.map((key) => ({ key, accepts: new Set([key, ...(language === "nl" ? dutchInflections(key) : [])]) })),
  })));
}

const matchesAt = (position: Pattern["positions"][number], token: Token) =>
  position.accepts.has(token.key) || (position.key.length >= 3 && closeForms(position.key, token.key));

// Every occurrence of the words in `text` as character spans, in text order. Where spans overlap, the one with more words wins
// (Waar kom je vandaan? over waar), then the earlier one, then exact matches over close ones.
export function findWords(text: string, words: readonly Pick<VocabularyWord, "id" | "term" | "forms">[], language: MatchLanguage): WordSpan[] {
  const tokens = tokenize(text);
  const candidates: Array<{ from: number; to: number; wordId: string; exact: boolean }> = [];
  for (const pattern of patterns(words, language)) {
    const length = pattern.positions.length;
    for (let from = 0; from + length <= tokens.length; from += 1) {
      const span = tokens.slice(from, from + length);
      if (!pattern.positions.every((position, index) => matchesAt(position, span[index]!))) continue;
      candidates.push({ from, to: from + length, wordId: pattern.wordId, exact: pattern.positions.every((position, index) => position.key === span[index]!.key) });
    }
  }
  candidates.sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.from - b.from || Number(b.exact) - Number(a.exact));
  const taken = new Array<boolean>(tokens.length).fill(false);
  const chosen: WordSpan[] = [];
  for (const candidate of candidates) {
    if (taken.slice(candidate.from, candidate.to).some(Boolean)) continue;
    for (let index = candidate.from; index < candidate.to; index += 1) taken[index] = true;
    chosen.push({ start: tokens[candidate.from]!.start, end: tokens[candidate.to - 1]!.end, wordId: candidate.wordId });
  }
  return chosen.sort((a, b) => a.start - b.start);
}
