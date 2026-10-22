import type { TutorPart } from "@wordinator/contracts/tutor";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QuestionPips, type QuestionPipState } from "../../molecules/QuestionPips";
import { AnswerComponent, BareFrameContext, type ClipSource } from "../TutorComponents";
import styles from "./Tutor.module.css";

type ComponentPart = Extract<TutorPart, { type: "component" }>;

const pipState = (part: ComponentPart): QuestionPipState =>
  part.skipped ? "skipped" : part.grade ? (part.grade.correct ? "done" : "missed") : "answered";

// A message's questions once every one is answered or skipped: the learner's turn, on their side of the chat. One answer shows at
// a time, read-only with its grade and marks; the head names its kind beside the dock's pips, and the count of right answers
// closes the card.
export function AnsweredSet({ parts, language, clip }: {
  parts: readonly ComponentPart[]; language?: string; clip?: (toolCallId: string) => ClipSource | undefined;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const part = parts[current] ?? parts[0]!;
  const right = parts.filter((entry) => entry.grade?.correct).length;
  return <div className={styles.userRow}>
    <section className={styles.answeredSet} aria-label={t("tutor.answers.label")}>
      <header className={styles.answeredHead}>
        <p className={styles.answeredTitle}>{t("tutor.answers.title", { kind: t(`tutorComponents.kinds.${part.kind}`) })}</p>
        {parts.length > 1 && <QuestionPips label={t("tutor.answers.pips")} current={current} onSelect={setCurrent}
          items={parts.map((entry, index) => ({ id: entry.toolCallId, state: pipState(entry), label: t(`tutor.answers.pip.${pipState(entry)}`, { number: index + 1 }) }))} />}
      </header>
      {part.skipped ? <p className={styles.answeredSkipped}>{t("tutorComponents.skipped")}</p>
        : <BareFrameContext.Provider value={true}>
          <AnswerComponent key={part.toolCallId} view={part.view} answer={part.answer} grade={part.grade} disabled language={language}
            clip={clip?.(part.toolCallId)} onAnswer={() => undefined} />
        </BareFrameContext.Provider>}
      <p className={styles.answeredCount}>{t("tutor.answers.right", { count: right, total: parts.length })}</p>
    </section>
  </div>;
}
