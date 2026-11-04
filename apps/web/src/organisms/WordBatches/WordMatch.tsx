import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlainText } from "../../molecules/PlainText";
import { playSpeech, useSpeechResolver, useStopSpeechOnUnmount } from "../../molecules/Speech";
import { ProgressMeter } from "../../molecules/ProgressMeter";
import { Button } from "../../ui";
import type { RecapWord } from "../WordRecap/WordRecap";
import styles from "./WordMatch.module.css";

const percentFormat = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });
// How long a wrong pair stays marked before both sides clear.
const MISS_MS = 650;

// A copy of `items` in random order (Fisher–Yates). With more than one item, `avoid` (the other column) is never repeated as is,
// so no row starts out lined up with its pair.
export function shuffled<T>(items: readonly T[], random: () => number = Math.random, avoid?: readonly T[]): T[] {
  for (let tries = 0; ; tries += 1) {
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [next[index], next[other]] = [next[other]!, next[index]!];
    }
    if (!avoid || next.length < 2 || tries >= 8 || next.some((item, index) => item !== avoid[index])) return next;
  }
}

// A term and a translation pair up when they are the same word, or when the two cards cannot be told apart: a repeated term, or
// two words with the same translation.
export const isPair = (term: RecapWord, meaning: RecapWord) => term.id === meaning.id || term.term === meaning.term || term.meaning === meaning.meaning;

// The share of tries that were matches, from 0 to 1; null before the first try.
export const successRate = (matches: number, tries: number) => tries > 0 ? matches / tries : null;

type Round = { terms: RecapWord[]; meanings: RecapWord[] };
const deal = (words: readonly RecapWord[], random: () => number): Round => {
  const terms = shuffled(words, random);
  return { terms, meanings: shuffled(words, random, terms) };
};

// A finished round (docs/words.md#matching-game): a verdict, the success rate, the pairs matched and missed, `progress` (the
// lesson's words, from the caller), the words that were part of a miss with a promise to bring them back more often, then `actions`.
// `label` names the region; `when` sits above the verdict, for a round from an earlier visit.
export function MatchResult({ words, matches, tries, missed, label, when, progress, actions, status }: {
  words: readonly RecapWord[]; matches: number; tries: number; missed: ReadonlySet<string>; label: string; when?: ReactNode;
  progress?: ReactNode; actions: ReactNode; status?: ReactNode;
}) {
  const { t } = useTranslation();
  const score = successRate(matches, tries) ?? 0;
  const verdict = score >= 0.9 ? "great" : score >= 0.6 ? "good" : "keepGoing";
  const wrong = words.filter((word) => missed.has(word.id));
  return <section className={styles.result} aria-label={label}>
    {status}
    {when && <p className={styles.when}>{when}</p>}
    <p className={styles.verdict}>{t(`words.batches.match.verdict.${verdict}`)}</p>
    <p className={styles.score} data-verdict={verdict}>{percentFormat.format(score)}</p>
    <p className={styles.scoreLabel}>{t("words.batches.match.successRate")}</p>
    <p className={styles.summary}>{t("words.batches.match.summary", { count: matches, misses: tries - matches })}</p>
    {progress}
    {wrong.length > 0 && <div className={styles.wrong}>
      <h4 className={styles.wrongTitle}>{t("words.batches.match.wrongTitle", { count: wrong.length })}</h4>
      <ul className={styles.wrongList}>{wrong.map((word) => <li key={word.id}>
        <span className={styles.wrongTerm}>{word.term}</span> <span className={styles.wrongMeaning}><PlainText>{word.meaning}</PlainText></span>
      </li>)}</ul>
      <p className={styles.wrongNote}>{t("words.batches.match.wrongNote")}</p>
    </div>}
    <div className={styles.actions}>{actions}</div>
  </section>;
}

// The batch's matching game (docs/words.md#matching-game): its terms in one column and their translations in the other, each in its
// own random order. Picking one card on each side tries them as a pair, in either order: a match turns both green and sets them
// aside; a miss shakes both and clears them. The header counts the matches and the success rate (matches over tries). Once every
// pair is matched it shows the round's `MatchResult`, with Play again, `finish` (the batch's other actions), and the done action.
// `onFinish` hears once per round its matches, tries, and which word IDs were part of a miss. `preview` shows only the columns, for
// a card that is not open yet; the round stays the same when it opens. Picking a Dutch card speaks its term when its clip is ready
// (the word's own clip, or the lesson's speech scope), whatever the pick does.
export type WordMatchResult = { matches: number; tries: number; missed: ReadonlySet<string> };
export function WordMatch({ words, doneLabel, onDone, finish, progress, onFinish, preview = false, random = Math.random }: {
  words: readonly RecapWord[]; doneLabel: string; onDone: () => void; finish?: ReactNode; progress?: ReactNode;
  onFinish?: (result: WordMatchResult) => void; preview?: boolean; random?: () => number;
}) {
  const { t } = useTranslation();
  const id = useId();
  const resolveSpeech = useSpeechResolver();
  useStopSpeechOnUnmount(id);
  const [round, setRound] = useState(() => deal(words, random));
  const [term, setTerm] = useState<number | null>(null);
  const [meaning, setMeaning] = useState<number | null>(null);
  const [matchedTerms, setMatchedTerms] = useState<ReadonlySet<number>>(new Set());
  const [matchedMeanings, setMatchedMeanings] = useState<ReadonlySet<number>>(new Set());
  const [missed, setMissed] = useState<{ term: number; meaning: number } | null>(null);
  const [tries, setTries] = useState(0);
  const [wrong, setWrong] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const missTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(missTimer.current), []);
  const matches = matchedTerms.size;
  const total = round.terms.length;
  const rate = successRate(matches, tries);
  const done = total > 0 && matches === total;
  // Heard once per round, also when development runs effects twice.
  const latestFinish = useRef(onFinish); latestFinish.current = onFinish;
  const reported = useRef(false);
  useEffect(() => {
    if (!done) { reported.current = false; return; }
    if (!reported.current) { reported.current = true; latestFinish.current?.({ matches, tries, missed: wrong }); }
  }, [done, matches, tries, wrong]);

  const tryPair = (termIndex: number, meaningIndex: number) => {
    const left = round.terms[termIndex]!; const right = round.meanings[meaningIndex]!;
    setTries((count) => count + 1);
    setTerm(null); setMeaning(null);
    if (isPair(left, right)) {
      setMatchedTerms((current) => new Set(current).add(termIndex));
      setMatchedMeanings((current) => new Set(current).add(meaningIndex));
      setAnnouncement(t("words.batches.match.matched", { term: left.term, meaning: right.meaning }));
      return;
    }
    clearTimeout(missTimer.current);
    setMissed({ term: termIndex, meaning: meaningIndex });
    // Both words were mixed up, so both come back more often.
    setWrong((current) => new Set(current).add(left.id).add(right.id));
    missTimer.current = setTimeout(() => setMissed(null), MISS_MS);
    setAnnouncement(t("words.batches.match.missed", { term: left.term, meaning: right.meaning }));
  };
  const pickTerm = (index: number) => {
    const word = round.terms[index]!;
    const clip = word.speech ? word.speech.term : resolveSpeech(`word:${word.id}`);
    if (clip) playSpeech(id, [clip]);
    if (meaning !== null) tryPair(index, meaning);
    else setTerm((current) => current === index ? null : index);
  };
  const pickMeaning = (index: number) => {
    if (term !== null) tryPair(term, index);
    else setMeaning((current) => current === index ? null : index);
  };
  const again = () => {
    clearTimeout(missTimer.current);
    setRound(deal(words, random)); setTerm(null); setMeaning(null); setMissed(null);
    setMatchedTerms(new Set()); setMatchedMeanings(new Set()); setTries(0); setWrong(new Set()); setAnnouncement("");
  };

  const state = (matched: boolean, picked: boolean, miss: boolean) => matched ? "matched" : miss ? "missed" : picked ? "picked" : undefined;
  const status = <p className={styles.live} role="status">{announcement}</p>;

  if (done) {
    return <MatchResult words={words} matches={matches} tries={tries} missed={wrong} label={t("words.batches.match.resultLabel")} progress={progress} status={status}
      actions={<><Button variant="secondary" onClick={again}>{t("words.batches.match.again")}</Button>{finish}<Button onClick={onDone}>{doneLabel}</Button></>} />;
  }

  return <div className={styles.game}>
    {!preview && <><div className={styles.header}>
      <ProgressMeter size="compact" value={total ? (matches / total) * 100 : 0} showLabel label={t("words.batches.match.progress", { matches, total })} className={styles.progress} />
      <p className={styles.rate}>
        <span>{t("words.batches.match.successRate")}</span>
        <strong>{rate === null ? "–" : percentFormat.format(rate)}</strong>
      </p>
    </div>
    <p className={styles.hint}>{t("words.batches.match.hint")}</p></>}
    <div className={styles.board}>
      <div className={styles.column}>
        <h3 className={styles.columnTitle} id={`${id}-terms`}>{t("words.batches.match.terms")}</h3>
        <ul className={styles.cards} aria-labelledby={`${id}-terms`}>
          {round.terms.map((word, index) => {
            const matched = matchedTerms.has(index);
            return <li key={`${word.id}:${index}`}>
              <button type="button" className={styles.card} data-side="term" data-state={state(matched, term === index, missed?.term === index)}
                aria-pressed={term === index} disabled={matched} onClick={() => pickTerm(index)}>
                <span className={styles.cardText}>{word.term}</span>
                {matched && <Check aria-hidden="true" className={styles.check} />}
              </button>
            </li>;
          })}
        </ul>
      </div>
      <div className={styles.column}>
        <h3 className={styles.columnTitle} id={`${id}-meanings`}>{t("words.batches.match.meanings")}</h3>
        <ul className={styles.cards} aria-labelledby={`${id}-meanings`}>
          {round.meanings.map((word, index) => {
            const matched = matchedMeanings.has(index);
            return <li key={`${word.id}:${index}`}>
              <button type="button" className={styles.card} data-side="meaning" data-state={state(matched, meaning === index, missed?.meaning === index)}
                aria-pressed={meaning === index} disabled={matched} onClick={() => pickMeaning(index)}>
                <span className={styles.cardText}><PlainText linkify={false}>{word.meaning}</PlainText></span>
                {matched && <Check aria-hidden="true" className={styles.check} />}
              </button>
            </li>;
          })}
        </ul>
      </div>
    </div>
    {!preview && status}
  </div>;
}
