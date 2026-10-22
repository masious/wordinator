import { Tooltip } from "@mantine/core";
import { ANSWER_MARKS_MAX, diffEdits, diffWords, type TutorComponentKind, type TutorGrade, type WordDiff } from "@wordinator/contracts/tutor";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import styles from "./TutorComponents.module.css";

// Answer marks: a typed answer that missed by a few words shows those words corrected in place. Each fix stands over the word
// that was typed, which is smaller, struck, and red; a missing word is inserted, an extra one struck, and a moved one says where
// it belongs. The target is the judge's minimal correction of the learner's own sentence (`grade.corrected`), or a dictation's
// sentence. More than `ANSWER_MARKS_MAX` mistakes, or no target, shows no marks.

export function answerMarks(kind: TutorComponentKind, answer: string, grade: TutorGrade): { diff: WordDiff[]; target: string } | null {
  const target = grade.corrected ?? (kind === "dictation" ? grade.reference : null);
  if (grade.correct || !target) return null;
  const diff = diffWords(answer, target);
  const edits = diffEdits(diff);
  return edits >= 1 && edits <= ANSWER_MARKS_MAX ? { diff, target } : null;
}

function Fix({ entry }: { entry: Extract<WordDiff, { type: "wrong" | "typo" }> }) {
  // A typo's fix underlines the letters that were missing.
  const fix = entry.type === "typo"
    ? entry.chars.filter((part) => part.kind !== "extra").map((part, index) => part.kind === "missing" ? <u key={index} className={styles.fixLetters}>{part.text}</u> : <Fragment key={index}>{part.text}</Fragment>)
    : entry.expected;
  return <span className={styles.stack}><ins className={styles.fix}>{fix}</ins><del className={styles.typed}>{entry.given}</del></span>;
}

function Mark({ entry }: { entry: WordDiff }) {
  const { t } = useTranslation();
  switch (entry.type) {
    case "same": return <>{entry.given}</>;
    case "wrong": case "typo": return <Fix entry={entry} />;
    case "missing": return <ins className={styles.fix}>{entry.expected}</ins>;
    case "extra": return <del className={styles.typed}>{entry.given}</del>;
    case "moved": {
      const label = entry.after && entry.before ? t("tutorComponents.marks.between", { word: entry.given, after: entry.after, before: entry.before })
        : entry.after ? t("tutorComponents.marks.after", { word: entry.given, after: entry.after }) : t("tutorComponents.marks.before", { word: entry.given, before: entry.before ?? "" });
      return <Tooltip label={label} withArrow events={{ hover: true, focus: true, touch: true }}>
        <span tabIndex={0} className={styles.moved} aria-label={label}>{entry.given} <span aria-hidden="true">↔</span></span>
      </Tooltip>;
    }
  }
}

export function AnswerMarks({ label, diff }: { label: string; diff: readonly WordDiff[] }) {
  return <div className={styles.marked}>
    <p className={styles.markedLabel}>{label}</p>
    <p className={styles.markedLine}>{diff.map((entry, index) => <Fragment key={index}>{index > 0 && " "}<Mark entry={entry} /></Fragment>)}</p>
  </div>;
}
