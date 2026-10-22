import { okResponseSchema } from "@wordinator/contracts";
import { wordSearchKey, type WordDrillCard as DrillCard, type WordDrillResult } from "@wordinator/contracts/lesson-document";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Medal, Sprout, Trophy } from "lucide-react";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, weakWordsKey } from "../../api";
import { PlainText } from "../../molecules/PlainText";
import { SCORE_FAIR, SCORE_GOOD } from "../../molecules/SpeakControls";
import { SpeechButton } from "../../molecules/Speech";
import { Button, IconButton, Surface } from "../../ui";
import { drillDuration, drillTier, type LastDrill } from "./drillSession";
import { WordPracticeDialog } from "./WordPracticeDialog";
import styles from "./DrillResults.module.css";

export type FinishedDrill = { durationMs: number; pronunciation: number | null; previous: LastDrill | null };

const TIER_ICONS = { perfect: Trophy, good: Medal, keepGoing: Sprout } as const;

// A perfect run's confetti: pieces burst from the medal along fixed angles and distances, so the burst is the same every time.
const CONFETTI = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * 2 * Math.PI + (index % 2 ? 0.2 : -0.1);
  const distance = 90 + (index % 3) * 34;
  return { "--dx": `${Math.round(Math.cos(angle) * distance * 1.6)}px`, "--dy": `${Math.round(Math.sin(angle) * distance)}px`, "--spin": `${(index % 2 ? 1 : -1) * (180 + index * 25)}deg`, "--delay": `${(index % 4) * 40}ms` } as CSSProperties;
});
const band = (score: number) => score >= SCORE_GOOD ? "good" : score >= SCORE_FAIR ? "fair" : "weak";

// The session's pronunciation score as a bar, with the change since the last session when both were assessed.
function PronunciationPanel({ score, previous }: { score: number; previous: number | null }) {
  const { t } = useTranslation();
  const delta = previous === null ? null : score - previous;
  return <div className={styles.panel}>
    <div className={styles.panelHead}>
      <span>{t("drill.results.pronunciation")} <strong className={styles.panelScore}>{score}</strong></span>
      {delta !== null && <span className={styles.delta} data-trend={delta > 0 ? "up" : delta < 0 ? "down" : "same"}>
        {delta === 0 ? t("drill.results.deltaSame") : t("drill.results.delta", { delta: delta > 0 ? `+${delta}` : `−${-delta}` })}
      </span>}
    </div>
    <div className={styles.track} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label={t("drill.results.pronunciation")}>
      <span className={styles.fill} data-band={band(score)} style={{ "--score": score } as CSSProperties} />
    </div>
  </div>;
}

// The words that needed Again, each with I know this word, which marks its memory known in both directions (docs/words.md#word-memory).
function AgainWords({ groupId, cards }: { groupId: string; cards: readonly DrillCard[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState(false);
  const mark = useMutation({
    mutationFn: (termKey: string) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/word-memory/${encodeURIComponent(termKey)}/known`, okResponseSchema, { method: "PUT" }),
    onMutate: () => setFailure(false),
    onSuccess: (_data, termKey) => {
      setKnown((current) => new Set(current).add(termKey));
      void queryClient.invalidateQueries({ queryKey: weakWordsKey(groupId) });
    },
    onError: () => setFailure(true),
  });
  return <div className={styles.again}>
    <h3 className={styles.againTitle}>{t("drill.results.againTitle", { count: cards.length })}</h3>
    {failure && <p className={styles.error} role="alert">{t("words.weak.knownFailed")}</p>}
    <ul className={styles.againList}>
      {cards.map(({ word }) => {
        const termKey = wordSearchKey(word.term);
        const isKnown = known.has(termKey);
        return <li key={word.id} className={styles.againRow} data-known={isKnown || undefined}>
          <div className={styles.againWord}>
            <p className={styles.term}>{word.term}
              <SpeechButton url={word.speech.term} label={t("courses.speech.term", { term: word.term })} className={styles.speech} /></p>
            <p className={styles.meaning}><PlainText>{word.meaning}</PlainText></p>
          </div>
          {isKnown
            ? <span className={styles.knownMark}><CircleCheck aria-hidden="true" size={18} />{t("drill.results.markedKnown")}</span>
            : <IconButton tone="quiet" label={t("words.weak.knownFor", { term: word.term })} title={t("words.weak.known")}
                loading={mark.isPending && mark.variables === termKey} onClick={() => mark.mutate(termKey)}>
                <CircleCheck aria-hidden="true" size={18} />
              </IconButton>}
        </li>;
      })}
    </ul>
  </div>;
}

// The end of a session (docs/words.md#end-of-session): a tiered headline, accuracy, words recalled, and time, the pronunciation
// score against the last session, and the words that needed Again. Practise drill words and more opens the word practice picker,
// which starts a tutor conversation with `onPractice`.
export function DrillResults({ groupId, cards, first, finished, failure, onAgain, onBack, onPractice }: {
  groupId: string; cards: readonly DrillCard[]; first: ReadonlyMap<number, WordDrillResult>; finished: FinishedDrill;
  failure: ReactNode; onAgain: () => void; onBack: () => void; onPractice?: (conversationId: string) => void;
}) {
  const { t } = useTranslation();
  const [practising, setPractising] = useState(false);
  const labelId = useId();
  const got = [...first.values()].filter((result) => result === "got").length;
  const accuracy = cards.length ? Math.round(got / cards.length * 100) : 0;
  const tier = drillTier(accuracy);
  const Icon = TIER_ICONS[tier];
  const duration = drillDuration(finished.durationMs);
  const again = cards.filter((_card, index) => first.get(index) === "again");
  return <Surface className={styles.results}>
    <section aria-labelledby={labelId} className={styles.body} data-tier={tier}>
      <div className={styles.hero}>
        <span className={styles.medalWrap}>
          {tier === "perfect" && <span className={styles.confetti} aria-hidden="true">{CONFETTI.map((style, index) => <i key={index} style={style} />)}</span>}
          <span className={styles.medal}><Icon aria-hidden="true" size={32} strokeWidth={1.75} /></span>
        </span>
        <p id={labelId} className={styles.eyebrow}>{t("drill.summary.title")}</p>
        <h2 className={styles.title}>{t(`drill.results.tier.${tier}.title`)}</h2>
        <p className={styles.intro}>{t(`drill.results.tier.${tier}.body`)}</p>
      </div>
      <dl className={styles.stats}>
        <div><dd>{t("drill.results.percent", { value: accuracy })}</dd><dt>{t("drill.results.accuracy")}</dt></div>
        <div><dd>{t("drill.results.recalledValue", { got, total: cards.length })}</dd><dt>{t("drill.results.recalled")}</dt></div>
        <div><dd>{t(`drill.results.${duration.unit}`, { count: duration.count })}</dd><dt>{t("drill.results.time")}</dt></div>
      </dl>
      {finished.pronunciation !== null && <PronunciationPanel score={finished.pronunciation} previous={finished.previous?.pronunciation ?? null} />}
      {again.length > 0 && <AgainWords groupId={groupId} cards={again} />}
      {failure}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onBack}>{t("drill.backToWords")}</Button>
        {onPractice && <Button variant="secondary" onClick={() => setPractising(true)}>{t("drill.practiceMore")}</Button>}
        <Button onClick={onAgain}>{t("drill.drillAgain")}</Button>
      </div>
      {onPractice && <WordPracticeDialog opened={practising} onClose={() => setPractising(false)} onStarted={onPractice}
        drillWords={again.map(({ word }) => ({ lessonId: word.lessonId, wordId: word.id, term: word.term, meaning: word.meaning }))}
        lessonIds={cards.map(({ word }) => word.lessonId)} />}
    </section>
  </Surface>;
}
