import { PlainText } from "../../molecules/PlainText";
import styles from "./DialoguePrompt.module.css";

export type DialogueTurn = { speaker: string; text: string };

// A speaker label: a capitalised name or role, optionally two words ("Daans moeder"), then a colon and the line.
const TURN = /^\s*(\p{Lu}[\p{L}'’-]*(?: [\p{L}'’-]+)?):\s+(\S.*)$/u;

// Practice prompts write short exchanges as "Noor: Wat … jullie drinken? / Sofia: Ik … graag een thee.". A prompt is a dialogue only
// when every " / " segment is a speaker turn and there are at least two; anything else (an "Arrange: … / …" word list, a hint with a
// slash) stays plain text.
export function dialogueTurns(prompt: string): DialogueTurn[] | null {
  const segments = prompt.split(" / ");
  if (segments.length < 2) return null;
  const turns: DialogueTurn[] = [];
  for (const segment of segments) {
    const match = TURN.exec(segment);
    if (!match) return null;
    turns.push({ speaker: match[1]!, text: match[2]!.trim() });
  }
  return turns;
}

// The active practice question as separate turns: each speaker keeps one side (in order of first appearance), so a two-person
// exchange reads as two voices. The text stays escaped plain text.
export function DialoguePrompt({ turns, className }: { turns: readonly DialogueTurn[]; className?: string | undefined }) {
  const speakers = [...new Set(turns.map((turn) => turn.speaker))];
  return <ol className={className ? `${styles.dialogue} ${className}` : styles.dialogue}>
    {turns.map((turn, index) => <li key={index} className={styles.turn} data-side={speakers.indexOf(turn.speaker) % 2 === 0 ? "start" : "end"}>
      <span className={styles.speaker}>{turn.speaker}</span>
      <span className={styles.text}><PlainText>{turn.text}</PlainText></span>
    </li>)}
  </ol>;
}
