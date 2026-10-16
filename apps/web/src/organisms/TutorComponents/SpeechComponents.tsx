import type { WordDrillCard as DrillCard, WordDrillResult } from "@wordinator/contracts/lesson-document";
import type { QuickReviewCardView } from "@wordinator/contracts/tutor";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AssessmentBreakdown, ListenStatusLine, ScoreRing, SpeakButton } from "../../molecules/SpeakControls";
import { effectiveRecognizer, microsoftRecognitionSupported, SENTENCE_ANSWER_WINDOW, setRecognizer, useRecognizerPreference, useSpokenAnswer } from "../../molecules/speechRecognition";
import { Button } from "../../ui";
import { WordDrillCard } from "../WordDrill/WordDrillCard";
import { ClipButton } from "./ClipButton";
import { ComponentFrame, GradePending, VerdictBadge, useAnswerFlow } from "./shared";
import type { AnswerComponentProps } from "./types";
import styles from "./TutorComponents.module.css";

// The drill card needs a course word; a quick review card has the word's text only, and no clips or context line.
const drillCard = (card: QuickReviewCardView): DrillCard => ({
  word: { id: card.wordId, lessonId: card.lessonId, term: card.term, meaning: card.meaning, forms: card.forms, example: card.example, note: null, speech: { term: null, example: null } },
  direction: card.direction, course: { id: "", slug: "", title: "" }, lesson: { id: card.lessonId, slug: "", title: "" },
});

// Quick review: drill cards one at a time (Show answer, then Again or Got it, with the drill's keys); the last grade sends them all.
export function QuickReviewComponent({ view, answer, grade, onAnswer, disabled, language }: AnswerComponentProps<"quick_review">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const [results, setResults] = useState<WordDrillResult[]>([]);
  const [revealed, setRevealed] = useState(false);
  const done = flow.answered?.results ?? null;
  const card = view.cards[results.length];
  const locked = flow.pending || Boolean(disabled);
  const gradeCard = (result: WordDrillResult) => {
    if (locked) return;
    const next = [...results, result];
    setResults(next); setRevealed(false);
    if (next.length === view.cards.length) void flow.submit({ kind: "quick_review", results: next }).then(() => undefined);
  };
  const shown = done ?? (flow.failed || flow.pending ? results : null);
  const got = (shown ?? []).filter((result) => result === "got").length;
  return <ComponentFrame kind="quick_review">
    {shown ? <>
      {grade ? <VerdictBadge ok={grade.correct} label={t("tutorComponents.review.summary", { got, total: view.cards.length })} /> : flow.answered ? <GradePending /> : null}
      <ul className={styles.reviewList}>{view.cards.map((entry, index) => <li key={index}>
        <span>{entry.term}</span><span data-result={shown[index]}>{shown[index] ? t(`drill.${shown[index]}`) : ""}</span>
      </li>)}</ul>
      {flow.failed && <div className={styles.submitRow}>
        <p className={styles.sendError} role="alert">{t("tutorComponents.sendFailed")}</p>
        <Button onClick={() => void flow.submit({ kind: "quick_review", results })}>{t("tutorComponents.sendAgain")}</Button>
      </div>}
    </> : card && !disabled ? <div className={styles.review}>
      <p className={styles.muted}>{t("tutorComponents.review.counter", { number: results.length + 1, total: view.cards.length })}</p>
      <WordDrillCard key={results.length} card={drillCard(card)} language={language ?? ""} revealed={revealed} autoFocus={results.length > 0}
        onReveal={() => setRevealed(true)} onGrade={gradeCard} />
    </div> : <ul className={styles.reviewList}>{view.cards.map((entry, index) => <li key={index}><span>{entry.term}</span></li>)}</ul>}
  </ComponentFrame>;
}

// Say it: hear the sentence, then say it; Microsoft's pronunciation assessment is the answer (docs/words.md#pronunciation-assessment).
// The browser's recognizer cannot score, so with it the component says Say it needs Microsoft and offers to switch on this device.
export function SayItComponent({ view, answer, grade, onAnswer, disabled, clip }: AnswerComponentProps<"say_it">) {
  const { t } = useTranslation();
  const flow = useAnswerFlow(answer, onAnswer);
  const [unscored, setUnscored] = useState(false);
  const recognizer = effectiveRecognizer(useRecognizerPreference());
  const listening = useSpokenAnswer(view.sentence, (heard) => {
    if (!heard.assessment) { setUnscored(true); return; }
    setUnscored(false);
    void flow.submit({ kind: "say_it", scores: { ...heard.assessment, words: heard.assessment.words.slice(0, 100) } });
  }, undefined, SENTENCE_ANSWER_WINDOW);
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);
  const scores = flow.answered?.scores ?? null;
  return <ComponentFrame kind="say_it">
    <div className={styles.promptRow}>
      <p className={styles.prompt}>{view.sentence}</p>
      {clip && <ClipButton clip={clip} label={t("tutorComponents.audio.playSentence")} />}
    </div>
    {view.translation && <p className={styles.muted}>{view.translation}</p>}
    {scores ? <div className={styles.grade}>
      {grade ? <VerdictBadge ok={grade.correct} label={grade.correct ? t("tutorComponents.verdict.passed") : t("tutorComponents.verdict.miss")}>
        <ScoreRing score={scores.overall} compact />
      </VerdictBadge> : <GradePending />}
      <AssessmentBreakdown assessment={scores} />
    </div> : recognizer !== "microsoft" ? <div className={styles.noticeRow}>
      <p className={styles.notice}>{t("tutorComponents.sayIt.needsMicrosoft")}</p>
      {microsoftRecognitionSupported() && !disabled && <Button variant="secondary" onClick={() => setRecognizer("microsoft")}>{t("tutorComponents.sayIt.useMicrosoft")}</Button>}
    </div> : !locked && listening.available ? <>
      <div className={styles.promptRow}><SpeakButton state={listening} onListen={listening.listen} compact /><span className={styles.muted}>{t("tutorComponents.sayIt.prompt")}</span></div>
      <ListenStatusLine status={listening.status} />
      {unscored && <p className={styles.sendError} role="status">{t("tutorComponents.sayIt.unscored")}</p>}
      {flow.failed && <p className={styles.sendError} role="alert">{t("tutorComponents.sendFailed")}</p>}
    </> : flow.pending ? <GradePending /> : null}
  </ComponentFrame>;
}
