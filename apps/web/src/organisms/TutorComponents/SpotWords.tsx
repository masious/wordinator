import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkedPassage } from "../../molecules/PracticeWord";
import { ComponentFrame, GradePending, SubmitRow, VerdictBadge, useAnswerFlow } from "./shared";
import type { AnswerComponentProps } from "./types";
import styles from "./TutorComponents.module.css";

// Spot the words: a short passage and a checklist of the lesson words it uses. The learner ticks the ones they recognised and
// sends the list; then each word shows its meaning and the passage its translation. Practice words marked in the passage are
// highlighted, and show their card only once the checklist is sent, so it cannot give a meaning away.
export function SpotWordsComponent({ view, answer, grade, onAnswer, disabled }: AnswerComponentProps<"spot_words">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const [known, setKnown] = useState<boolean[]>(() => view.words.map(() => false));
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  const shown = flow.answered?.known ?? null;
  const toggle = (index: number) => setKnown((current) => current.map((value, position) => position === index ? !value : value));
  return <ComponentFrame kind="spot_words">
    <p className={styles.passage}><MarkedPassage text={view.passage} marks={view.marks ?? []} card={Boolean(shown)} /></p>
    {shown ? <>
      {grade ? <VerdictBadge ok={grade.correct} label={t("tutorComponents.spotWords.result", { known: shown.filter(Boolean).length, total: view.words.length })} /> : <GradePending />}
      <ul className={styles.reviewList}>{view.words.map((word, index) => <li key={`${word.lessonId}:${word.wordId}`}>
        <span><strong>{word.term}</strong> {word.meaning}</span><span data-result={shown[index] ? "got" : "again"}>{shown[index] ? "✓" : "✗"}</span>
      </li>)}</ul>
      {view.translation && <p className={styles.muted}>{t("tutorComponents.spotWords.translation")}: {view.translation}</p>}
    </> : <>
      <p className={styles.muted}>{t("tutorComponents.spotWords.help")}</p>
      <ul className={styles.spotList} aria-label={t("tutorComponents.spotWords.words")}>
        {view.words.map((word, index) => <li key={`${word.lessonId}:${word.wordId}`}>
          <button type="button" className={styles.toggle} aria-pressed={known[index]} aria-label={t("tutorComponents.spotWords.recognised", { term: word.term })}
            disabled={locked} onClick={() => toggle(index)}>{word.term}</button>
        </li>)}
      </ul>
      <SubmitRow label={t("tutorComponents.spotWords.send")} disabled={locked} pending={flow.pending} failed={flow.failed}
        onSubmit={() => void flow.submit({ kind: "spot_words", known })} />
    </>}
  </ComponentFrame>;
}
