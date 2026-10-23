import type { WordDrillCard as DrillCard } from "@wordinator/contracts/lesson-document";
import { Check } from "lucide-react";
import { LayoutGroup, MotionConfig, motion, type Transition } from "motion/react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DrillState } from "./drillSession";
import styles from "./DrillTable.module.css";

// One flight between two places on the table: about the reveal's length, on the physical ease.
export const DRILL_FLIGHT_MS = 520;
const flight: Transition = { duration: DRILL_FLIGHT_MS / 1000, ease: [0.32, 0.72, 0, 1] };
// A pile shows at most this many cards' edges under its top card.
const PILE_DEPTH = 6;

const cardId = (index: number) => `drill-card-${index}`;
const depth = (fromTop: number) => ({ "--depth": Math.min(fromTop, PILE_DEPTH) }) as CSSProperties;

// The drill table (docs/words.md#the-table): every card of the session has one place on it, and moves between places as one card.
// Up next is a face-down deck; the current card is dealt from it to the middle; Got it stacks retired cards face down on the other
// side; and Coming back keeps each card that needed Again face up, in the order it returns (after every card not yet seen), until it
// is dealt again.
export function DrillTable({ cards, state, toolbar, card, footer }: {
  cards: readonly DrillCard[]; state: DrillState; toolbar: ReactNode; card: ReactNode; footer: ReactNode;
}) {
  const { t } = useTranslation();
  // The first card is dealt from the deck after the table is drawn, so the session starts with a flight too.
  const [dealt, setDealt] = useState(false);
  useEffect(() => setDealt(true), []);
  const current = dealt ? state.queue[0] : undefined;
  const waiting = dealt ? state.queue.slice(1) : state.queue;
  const upcoming = waiting.filter((index) => !state.first.has(index));
  // A card that needed Again comes back after the cards ahead of it in the queue, the current one included.
  const returning = waiting.flatMap((index, position) => state.first.has(index) ? [{ index, after: position + (dealt ? 1 : 0) }] : []);

  return <MotionConfig reducedMotion="user" transition={flight}><LayoutGroup id="drill">
    <div className={styles.table}>
      <section className={`${styles.place} ${styles.deck}`} aria-label={t("drill.table.upcoming")}>
        <p className={styles.label} aria-hidden="true">{t("drill.table.upcoming")}<span className={styles.count}>{upcoming.length}</span></p>
        <div className={styles.pile}>
          {/* The next card is drawn last, on top. */}
          {[...upcoming].reverse().map((index, position, deck) => <motion.div key={index} layoutId={cardId(index)} aria-hidden="true"
            className={`${styles.mini} ${styles.faceDown}`} style={depth(deck.length - 1 - position)} />)}
        </div>
      </section>

      <section className={`${styles.place} ${styles.again}`} aria-label={t("drill.table.again")}>
        <p className={styles.label} aria-hidden="true">{t("drill.table.again")}<span className={styles.count}>{returning.length}</span></p>
        <ol className={styles.returning}>
          {returning.map(({ index, after }) => {
            const { word } = cards[index]!;
            return <li key={index}>
              {/* Graded only once revealed, so the back is the side left up: the term and its meaning. */}
              <motion.div layoutId={cardId(index)} className={`${styles.mini} ${styles.faceUp}`}>
                <span className={styles.miniTerm}>{word.term}</span>
                <span className={styles.miniMeaning}>{word.meaning}</span>
              </motion.div>
              <span className={styles.after}>{t("drill.table.after", { count: after })}</span>
            </li>;
          })}
        </ol>
      </section>

      <div className={styles.stage}>
        {toolbar}
        <div className={styles.slot}>
          {current !== undefined && <motion.div key={state.shown} layoutId={cardId(current)} className={styles.current}>{card}</motion.div>}
        </div>
        {footer}
      </div>

      <section className={`${styles.place} ${styles.got}`} aria-label={t("drill.table.got")}>
        <p className={styles.label} aria-hidden="true">{t("drill.table.got")}<span className={styles.count}>{state.done.length}</span></p>
        <div className={styles.pile}>
          {state.done.map((index, position) => <motion.div key={index} layoutId={cardId(index)} aria-hidden="true"
            className={`${styles.mini} ${styles.faceDown} ${styles.retired}`} style={depth(state.done.length - 1 - position)}>
            <Check size={20} aria-hidden="true" />
          </motion.div>)}
        </div>
      </section>
    </div>
  </LayoutGroup></MotionConfig>;
}
