import { SegmentedControl, Tooltip } from "@mantine/core";
import { Check, X } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { diffEdits, diffWords, type WordDiff } from "@wordinator/contracts/tutor";
import { QuestionPips } from "../../molecules/QuestionPips";
import { AnsweredSet as ChatAnsweredSet } from "../../organisms/Tutor/AnsweredSet";
import { AnswerMarks } from "../../organisms/TutorComponents/AnswerMarks";
import styles from "./TempFeedback.module.css";

// Temporary page: prototypes for showing a practice set's answers as the learner's reply, and for marking exactly what was wrong
// in a typed answer. Not translated; delete with its route once a direction is picked.

type Style = "strike" | "inline" | "stacked" | "chips";
const STYLES: Array<{ value: Style; label: string }> = [
  { value: "strike", label: "Strike + tooltip" }, { value: "inline", label: "Inline correction" },
  { value: "stacked", label: "Stacked" }, { value: "chips", label: "Word chips" },
];

type Case = { kind: string; prompt: string; given: string; reference: string; note?: string };
const CASES: Case[] = [
  { kind: "Translate into Dutch", prompt: "I see many things at the market.", given: "ik zie veel spullen in de markt", reference: "Ik zie veel spullen op de markt.", note: "At a market is “op de markt”." },
  { kind: "Translate into Dutch", prompt: "I buy a bunch of flowers.", given: "ik koop bloemen", reference: "Ik koop een bos bloemen.", note: "A bunch of flowers is “een bos bloemen”." },
  { kind: "Fix the mistake", prompt: "Ik heb de het boek gelezen.", given: "ik heb de het boek gelezen", reference: "Ik heb het boek gelezen.", note: "Boek is a het-word; drop “de”." },
  { kind: "Translate into Dutch", prompt: "Tomorrow I go to the market.", given: "ik morgen ga naar de markt", reference: "Ik ga morgen naar de markt.", note: "The verb comes second: “Ik ga morgen…”." },
  { kind: "Dictation", prompt: "(audio)", given: "ik zie veel spulen op de markt", reference: "Ik zie veel spullen op de markt." },
  { kind: "Translate into Dutch", prompt: "Can I taste this?", given: "mag ik deze proeven", reference: "Mag ik deze proeven?" },
];

// What a mark's tooltip says, in plain words.
const explain = (entry: WordDiff): string => {
  switch (entry.type) {
    case "wrong": case "typo": return `→ ${entry.expected}`;
    case "extra": return "Not needed here";
    case "missing": return `Missing: ${entry.expected}`;
    case "moved": return entry.after && entry.before ? `Belongs between “${entry.after}” and “${entry.before}”` : entry.after ? `Belongs after “${entry.after}”` : `Belongs before “${entry.before}”`;
    case "same": return "";
  }
};

function Hint({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip label={label} withArrow events={{ hover: true, focus: true, touch: true }}>
    <span tabIndex={0} className={styles.hint}>{children}</span>
  </Tooltip>;
}

const Typo = ({ entry }: { entry: Extract<WordDiff, { type: "typo" }> }) =>
  <>{entry.chars.map((part, index) => <span key={index} className={styles[`char_${part.kind}`]}>{part.text}</span>)}</>;

// One word of the answer in the chosen style. Missing words are a caret between words; moved words keep their place, dashed.
function DiffWord({ entry, style }: { entry: WordDiff; style: Style }) {
  if (entry.type === "same") return <span className={style === "chips" ? styles.chip : undefined}>{entry.given}</span>;
  if (entry.type === "missing") {
    if (style === "inline" || style === "stacked") return <ins className={styles.inserted}>{entry.expected}</ins>;
    if (style === "chips") return <span className={`${styles.chip} ${styles.chipMissing}`}>+ {entry.expected}</span>;
    return <Hint label={explain(entry)}><span className={styles.caret} aria-label={explain(entry)}>‸</span></Hint>;
  }
  if (entry.type === "moved") return <Hint label={explain(entry)}><span className={`${styles.moved} ${style === "chips" ? styles.chip : ""}`}>{entry.given} <span aria-hidden="true">↔</span></span></Hint>;
  if (entry.type === "extra") {
    if (style === "chips") return <Hint label={explain(entry)}><span className={`${styles.chip} ${styles.chipWrong}`}><del>{entry.given}</del></span></Hint>;
    return <Hint label={explain(entry)}><del className={styles.extra}>{entry.given}</del></Hint>;
  }
  // Wrong word or typo.
  switch (style) {
    case "strike": return <Hint label={explain(entry)}>{entry.type === "typo" ? <span className={styles.typo}>{entry.given}</span> : <del className={styles.wrong}>{entry.given}</del>}</Hint>;
    // A typo is corrected letter by letter in place; a wrong word is struck with the right one after it.
    case "inline": return entry.type === "typo" ? <span className={styles.pair}><Typo entry={entry} /></span>
      : <span className={styles.pair}><del className={styles.wrong}>{entry.given}</del> <ins className={styles.inserted}>{entry.expected}</ins></span>;
    case "stacked": return <span className={styles.stack}><ins className={styles.stackTop}>{entry.expected}</ins><del className={styles.stackTyped}>{entry.given}</del></span>;
    case "chips": return <span className={`${styles.chip} ${styles.chipWrong}`}><del>{entry.given}</del><span className={styles.chipFix}>{entry.expected}</span></span>;
  }
}

export function DiffLine({ answer, reference, style }: { answer: string; reference: string; style: Style }) {
  const diff = diffWords(answer, reference);
  return <p className={style === "chips" ? styles.chips : styles.line} data-style={style}>
    {diff.map((entry, index) => <Fragment key={index}>{index > 0 && style !== "chips" && " "}<DiffWord entry={entry} style={style} /></Fragment>)}
  </p>;
}

// The verdict line: right, or how many words to change; a near-miss says so instead of "Not quite".
function Verdict({ answer, reference }: { answer: string; reference: string }) {
  const edits = diffEdits(diffWords(answer, reference));
  return <p className={styles.verdict} data-ok={edits === 0 || undefined}>
    <span className={styles.verdictIcon} aria-hidden="true">{edits === 0 ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}</span>
    {edits === 0 ? "Correct" : edits === 1 ? "One word off" : `${edits} words to fix`}
  </p>;
}

// A practice set's answers as the learner's own turn: right-aligned, one answer at a time with the dock's pips. The head names
// the question's kind; the count of right answers closes the card. Answers use the chosen style; Stacked is the real AnswerMarks.
function AnsweredSet({ cases, style }: { cases: readonly Case[]; style: Style }) {
  const [current, setCurrent] = useState(0);
  const right = cases.filter((entry) => diffEdits(diffWords(entry.given, entry.reference)) === 0).length;
  const item = cases[current]!;
  return <div className={styles.userRow}>
    <section className={styles.answers} aria-label="Your answers">
      <header className={styles.answersHead}>
        <p className={styles.answersTitle}>Your answers · {item.kind}</p>
        <QuestionPips label="Answers" current={current} onSelect={setCurrent}
          items={cases.map((entry, index) => ({ id: String(index), label: `Answer ${index + 1}`, state: diffEdits(diffWords(entry.given, entry.reference)) === 0 ? "done" : "missed" }))} />
      </header>
      <p className={styles.prompt}>{item.prompt}</p>
      {style === "stacked" ? <AnswerMarks label="Your translation" diff={diffWords(item.given, item.reference)} /> : <DiffLine answer={item.given} reference={item.reference} style={style} />}
      <Verdict answer={item.given} reference={item.reference} />
      {item.note && <p className={styles.note}>{item.note}</p>}
      <p className={styles.answersCount}>{right} of {cases.length} right</p>
    </section>
  </div>;
}

export function TempFeedback() {
  const [style, setStyle] = useState<Style>("stacked");
  return <main className={styles.page}>
    <header className={styles.header}>
      <h1>Answer feedback</h1>
      <p>Temporary prototypes. Capitals, accents, and punctuation never count as mistakes. Hover or tab to a marked word.</p>
      <SegmentedControl value={style} onChange={(value) => setStyle(value as Style)} data={STYLES} />
    </header>
    <section className={styles.section}>
      <h2>1 · A set's answers as your reply</h2>
      <p className={styles.lead}>After Check answers, the set leaves the tutor's card and shows on your side of the chat, one answer at a time. The first card is the chat's real component.</p>
      <ChatAnsweredSet language="Dutch" parts={[CASES[0]!, CASES[5]!, CASES[3]!, CASES[1]!].map((entry, index) => {
        const target = entry === CASES[5] ? null : entry.reference;
        return {
          type: "component", toolCallId: `00000000-0000-4000-8000-00000000000${index}`, kind: "translate", answeredAt: 1, skipped: false,
          view: { kind: "translate", source: entry.prompt }, answer: { kind: "translate", text: entry.given },
          grade: { correct: target === null, matched: target === null, verdict: target ? "error" : null, note: entry.note ?? null, reference: entry.reference, items: [], score: null, corrected: target },
        } as const;
      })} />
      <p className={styles.lead}>The prototype with every style:</p>
      <AnsweredSet cases={[CASES[0]!, CASES[5]!, CASES[3]!, CASES[1]!]} style={style} />
    </section>
    <section className={styles.section}>
      <h2>2 · Every style, every kind of mistake</h2>
      <table className={styles.table}>
        <thead><tr><th>Mistake</th>{STYLES.map((entry) => <th key={entry.value}>{entry.label}</th>)}</tr></thead>
        <tbody>{CASES.map((entry, index) => <tr key={index}>
          <th scope="row">{["Wrong word", "Missing words", "Extra word", "Word order", "Typo", "Correct"][index]}<span className={styles.reference}>{entry.reference}</span></th>
          {STYLES.map((option) => <td key={option.value}><DiffLine answer={entry.given} reference={entry.reference} style={option.value} /></td>)}
        </tr>)}</tbody>
      </table>
    </section>
  </main>;
}
