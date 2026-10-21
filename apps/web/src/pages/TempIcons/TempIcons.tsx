import { useMemo, useState } from "react";
import { AnimatedEmoji } from "../../molecules/AnimatedEmoji";
import badgeStyles from "../../organisms/CourseLessons/LessonIndex.module.css";
import styles from "./TempIcons.module.css";

// Temporary page comparing grammar icon candidates in the lesson index's violet badge. Not translated; delete with its route.
const stillSources = import.meta.glob<string>("./noto/*.svg", { query: "?raw", import: "default" });
const stills = Object.fromEntries(Object.entries(stillSources).map(([path, load]) =>
  [path, () => load().then((svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)])) as Record<string, () => Promise<string>>;
const animations: Record<string, () => Promise<unknown>> = import.meta.glob("./noto/*.json", { import: "default" });

type Candidate = { emoji: string; codepoint: string; name: string; note?: string };

const requested: Candidate[] = [
  { emoji: "📝", codepoint: "1f4dd", name: "Memo", note: "note" },
  { emoji: "🗒️", codepoint: "1f5d2_fe0f", name: "Spiral notepad", note: "closest to sticky note" },
  { emoji: "📄", codepoint: "1f4c4", name: "Page facing up", note: "paper" },
  { emoji: "📃", codepoint: "1f4c3", name: "Page with curl", note: "paper" },
  { emoji: "📜", codepoint: "1f4dc", name: "Scroll" },
  { emoji: "📖", codepoint: "1f4d6", name: "Open book" },
  { emoji: "📕", codepoint: "1f4d5", name: "Closed book" },
  { emoji: "📘", codepoint: "1f4d8", name: "Blue book" },
  { emoji: "📓", codepoint: "1f4d3", name: "Notebook" },
  { emoji: "📒", codepoint: "1f4d2", name: "Ledger" },
];

const animated: Candidate[] = [
  { emoji: "⚙️", codepoint: "2699_fe0f", name: "Gear", note: "current" },
  { emoji: "🧐", codepoint: "1f9d0", name: "Monocle face", note: "inspecting the rules" },
  { emoji: "🤓", codepoint: "1f913", name: "Nerd face" },
  { emoji: "🎓", codepoint: "1f393", name: "Graduation cap" },
  { emoji: "🛠️", codepoint: "1f6e0_fe0f", name: "Hammer and wrench", note: "building sentences" },
  { emoji: "⛓️", codepoint: "26d3_fe0f", name: "Chains", note: "linking words" },
  { emoji: "🖇️", codepoint: "1f587_fe0f", name: "Linked paperclips", note: "paper + linking" },
  { emoji: "🔎", codepoint: "1f50e", name: "Magnifying glass", note: "a closer look" },
  { emoji: "⚖️", codepoint: "2696_fe0f", name: "Balance scale", note: "rules" },
  { emoji: "✂️", codepoint: "2702_fe0f", name: "Scissors", note: "taking sentences apart" },
  { emoji: "🤔", codepoint: "1f914", name: "Thinking face" },
  { emoji: "❓", codepoint: "2753", name: "Question mark" },
  { emoji: "📚", codepoint: "1f4da", name: "Books", note: "taken by Reading" },
];

function Row({ candidate, motion }: { candidate: Candidate; motion: string }) {
  const art = useMemo(() => ({ still: stills[`./noto/${candidate.codepoint}.svg`], animation: animations[`./noto/${candidate.codepoint}.json`] }), [candidate.codepoint]);
  const hasAnimation = Boolean(art.animation);
  return <li className={styles.row}>
    <span className={badgeStyles.badge} data-tone="violet"><AnimatedEmoji emoji={candidate.emoji} still={art.still} /></span>
    <span className={badgeStyles.badge} data-tone="violet">
      {hasAnimation
        ? <AnimatedEmoji emoji={candidate.emoji} {...art} playing />
        : <AnimatedEmoji emoji={candidate.emoji} still={art.still} className={styles[motion]} />}
    </span>
    <span className={styles.label}>
      <strong>{candidate.emoji} {candidate.name}</strong>
      <small>{candidate.codepoint}{candidate.note ? ` · ${candidate.note}` : ""}{hasAnimation ? "" : " · CSS motion (no Noto animation)"}</small>
    </span>
  </li>;
}

export function TempIcons() {
  const [motion, setMotion] = useState("wiggle");
  return <main className={styles.page}>
    <h1>Grammar icon candidates</h1>
    <p>Each row: still, then animated, in the lesson index's violet badge at index size.</p>
    <section>
      <h2>Requested (Noto has no animation for these)</h2>
      <p className={styles.motions}>CSS fallback motion:{" "}
        {["wiggle", "bob", "flip", "pulse"].map((name) =>
          <button key={name} type="button" aria-pressed={motion === name} onClick={() => setMotion(name)}>{name}</button>)}
      </p>
      <ul className={styles.list}>{requested.map((candidate) => <Row key={candidate.codepoint} candidate={candidate} motion={motion} />)}</ul>
    </section>
    <section>
      <h2>Suggested (Noto animates these)</h2>
      <ul className={styles.list}>{animated.map((candidate) => <Row key={candidate.codepoint} candidate={candidate} motion={motion} />)}</ul>
    </section>
  </main>;
}
