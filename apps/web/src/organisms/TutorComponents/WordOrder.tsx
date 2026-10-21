import { useState } from "react";
import { WordOrderBoard } from "../../molecules/WordOrderBoard";
import { ComponentFrame, GradePending, GradeResult, HintRow, MarkedText, SubmitRow, useAnswerFlow } from "./shared";
import type { AnswerComponentProps } from "./types";
import styles from "./TutorComponents.module.css";

// Word order: the shared board (molecules/WordOrderBoard) plus the tutor's submit flow.
export function WordOrderComponent({ view, answer, grade, onAnswer, disabled, autoFocus }: AnswerComponentProps<"word_order">) {
  const flow = useAnswerFlow(answer, onAnswer);
  const [order, setOrder] = useState<number[]>([]);
  const locked = Boolean(flow.answered) || flow.pending || Boolean(disabled);

  const shownAnswer = flow.answered ? flow.answered.chunks : null;
  return <ComponentFrame kind="word_order">
    <div className={styles.grade}>
      {view.translation && <p className={styles.prompt}><MarkedText text={view.translation} /></p>}
      <HintRow />
      <WordOrderBoard chunks={view.chunks} order={order} onChange={setOrder} disabled={locked} answered={shownAnswer} autoFocus={autoFocus} />
    </div>
    {grade ? <GradeResult kind="word_order" grade={grade} /> : flow.answered ? <GradePending />
      : <SubmitRow disabled={locked || order.length < view.chunks.length} pending={flow.pending} failed={flow.failed}
        onSubmit={() => void flow.submit({ kind: "word_order", chunks: order.map((chunk) => view.chunks[chunk]!) })} />}
  </ComponentFrame>;
}
