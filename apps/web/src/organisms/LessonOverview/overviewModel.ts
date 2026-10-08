import {
  flattenToSteps, inlineText, lessonStepKey, readDialogueTurns, readPracticeBlock, walkLessonBlocks,
  type LessonDocument, type LessonStep, type VocabularyWord,
} from "@wordinator/contracts/lesson-document";

// The lesson overview keeps only what a reader needs to see where they are: one stop per heading section, what kind of
// work it holds, and how much of it there is. Each stop covers a run of player steps, so the reader's saved step decides
// which stops are done, which one is next, and which are still ahead.
export type OverviewKind = "topic" | "story" | "practice" | "reading";
export type OverviewStop = {
  id: string;
  title: string;
  // The level-1 or level-2 heading the stop sits under. Level-3 headings become stops of their own inside it.
  chapter: string | null;
  kind: OverviewKind;
  // Player steps [start, end).
  start: number;
  end: number;
  words: VocabularyWord[];
  questions: number;
  lines: number;
  speakers: string[];
  teaser: string | null;
};
export type LessonOverview = { title: string; goal: string | null; steps: LessonStep[]; stops: OverviewStop[]; words: number; questions: number };
export type StopStatus = "done" | "current" | "upcoming";

type Section = { id: string; title: string; chapter: string | null };

// Every block, nested ones included, mapped to the heading section it sits in. Empty headings keep the previous section,
// as they keep the previous step heading in `flattenToSteps`.
function sectionsByBlock(document: LessonDocument, lessonTitle: string) {
  const sections = new Map<string, Section>();
  let chapter: string | null = null;
  let current: Section = { id: "intro", title: lessonTitle, chapter: null };
  for (const top of document.blocks) {
    if (top.type === "heading") {
      const title = inlineText(top.content).trim();
      if (title) {
        if (top.props.level < 3) chapter = title;
        current = { id: top.id, title, chapter };
      }
    }
    for (const { block } of walkLessonBlocks([top])) sections.set(block.id, current);
  }
  return sections;
}

const kindOf = (steps: readonly LessonStep[]): OverviewKind => {
  const practice = steps.find((step) => step.kind === "practiceItem");
  if (practice) return readPracticeBlock(practice.block).passage ? "reading" : "practice";
  return steps.some((step) => step.kind === "dialogueTurn") ? "story" : "topic";
};

// One line that says what a stop is about: a practice's instruction or reading title, a story's scene, or a topic's rule.
function teaserOf(kind: OverviewKind, steps: readonly LessonStep[]): string | null {
  if (kind === "practice" || kind === "reading") {
    const step = steps.find((entry) => entry.kind === "practiceItem");
    if (!step) return null;
    const payload = readPracticeBlock(step.block);
    return kind === "reading" ? payload.passage?.title ?? payload.instruction : payload.instruction;
  }
  const rule = kind === "topic" && steps.find((step) => step.kind === "callout" && (step.block.props.variant === "grammar" || step.block.props.variant === "important"));
  if (rule && rule.kind === "callout") return inlineText(rule.block.content).trim();
  for (const step of steps) {
    if (step.kind !== "content") continue;
    const paragraph = step.blocks.find((block) => block.type === "paragraph" && inlineText(block.content).trim());
    if (paragraph?.type === "paragraph") return inlineText(paragraph.content).trim();
  }
  return null;
}

function toStop(section: Section, steps: LessonStep[], start: number): OverviewStop {
  const kind = kindOf(steps);
  const words = new Map<string, VocabularyWord>();
  // Every item of a practice carries the same words, so they are counted once by ID.
  for (const step of steps) for (const word of step.words) words.set(word.id, word);
  const dialogues = new Set(steps.flatMap((step) => step.kind === "dialogueTurn" ? [step.block] : []));
  return {
    id: section.id, title: section.title, chapter: section.chapter, kind, start, end: start + steps.length,
    words: [...words.values()],
    questions: steps.filter((step) => step.kind === "practiceItem").length,
    lines: steps.filter((step) => step.kind === "dialogueTurn").length,
    speakers: [...new Set([...dialogues].flatMap((block) => readDialogueTurns(block).map((turn) => turn.speaker)))],
    teaser: teaserOf(kind, steps),
  };
}

export function buildOverview(title: string, goal: string | null, document: LessonDocument): LessonOverview {
  const steps = flattenToSteps(document);
  const sections = sectionsByBlock(document, title);
  const stops: OverviewStop[] = [];
  let section = null as Section | null; let start = 0;
  for (let index = 0; index <= steps.length; index += 1) {
    const step = steps[index];
    const next: Section | null = step ? sections.get(lessonStepKey(step).split(":")[0]!) ?? section : null;
    if (next?.id === section?.id) continue;
    if (section) stops.push(toStop(section, steps.slice(start, index), start));
    section = next ?? null; start = index;
  }
  return {
    title, goal, steps, stops,
    words: stops.reduce((sum, stop) => sum + stop.words.length, 0),
    questions: stops.reduce((sum, stop) => sum + stop.questions, 0),
  };
}

// `reached` is the number of steps the reader has gone past: the index of their saved step, or every step once finished.
export const stopStatus = (stop: OverviewStop, reached: number): StopStatus =>
  reached >= stop.end ? "done" : reached >= stop.start ? "current" : "upcoming";

export const stopProgress = (stop: OverviewStop, reached: number) =>
  Math.min(1, Math.max(0, (reached - stop.start) / (stop.end - stop.start)));

// What the reader has covered so far, for the summary at the top of the page.
export function overviewTotals(overview: LessonOverview, reached: number) {
  const done = overview.stops.filter((stop) => stopStatus(stop, reached) === "done");
  const covered = overview.steps.slice(0, reached);
  return {
    percent: overview.steps.length ? Math.round((Math.min(reached, overview.steps.length) / overview.steps.length) * 100) : 100,
    stops: done.length,
    words: new Set(covered.flatMap((step) => step.words.map((word) => word.id))).size,
    questions: covered.filter((step) => step.kind === "practiceItem").length,
  };
}
