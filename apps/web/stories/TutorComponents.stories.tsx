import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PronunciationScores } from "@wordinator/contracts/learning";
import type { TutorComponentAnswer, TutorComponentKind, TutorComponentView, TutorGrade } from "@wordinator/contracts/tutor";
import { AnswerComponent } from "../src/organisms/TutorComponents";
import { lessonId } from "./fixtures";
import { clip, grade, view, wordId } from "./tutorFixtures";

// The answer components the tutor's `ask_*` tools and the lesson page's AI practices show (docs/ai-tutor.md#answer-components).
// `state` picks the open component, an answered one with a correct or wrong grade, or a pending grade. Sending reaches no API.
type State = "open" | "correct" | "wrong" | "awaitingGrade";
type Args = { kind: TutorComponentKind; state: State; skippable: boolean; disabled: boolean };
type Case = { view: TutorComponentView; answer: TutorComponentAnswer; correct: TutorGrade; wrong: TutorGrade };

const scores = (overall: number): PronunciationScores => ({
  overall, accuracy: overall, fluency: 80, completeness: 100,
  words: [{ word: "Deze", accuracy: 95, error: "none" }, { word: "jas", accuracy: overall < 60 ? 30 : 90, error: overall < 60 ? "mispronunciation" : "none" },
    { word: "is", accuracy: 98, error: "none" }, { word: "warmer", accuracy: 88, error: "none" }],
});

const cases: Record<TutorComponentKind, Case> = {
  fill_in: {
    view: view({ kind: "fill_in", prompt: "Ik hou meer van … dan van koffie.", blanks: 1, translation: "I like hot chocolate more than coffee." }),
    answer: { kind: "fill_in", blanks: ["chocolademelk"] },
    correct: grade({ correct: true, matched: true, reference: "chocolademelk", items: [{ expected: "chocolademelk", given: "chocolademelk", ok: true }] }),
    wrong: grade({ correct: false, matched: false, reference: "chocolademelk", items: [{ expected: "chocolademelk", given: "thee", ok: false }] }),
  },
  translate: {
    view: view({ kind: "translate", source: "This coat is warmer than that one." }),
    answer: { kind: "translate", text: "Deze jas is warmer dan die." },
    correct: grade({ correct: true, matched: false, verdict: "acceptable", note: "Good. You can also say “dan die jas”.", reference: "Deze jas is warmer dan die jas." }),
    wrong: grade({ correct: false, matched: false, verdict: "error", note: "Comparatives take -er: warm → warmer.", reference: "Deze jas is warmer dan die." }),
  },
  word_order: {
    view: view({ kind: "word_order", chunks: ["warmer", "Deze jas", "dan die", "is"], translation: "This coat is warmer than that one." }),
    answer: { kind: "word_order", chunks: ["Deze jas", "is", "warmer", "dan die"] },
    correct: grade({ correct: true, matched: true, reference: "Deze jas is warmer dan die" }),
    wrong: grade({ correct: false, matched: false, reference: "Deze jas is warmer dan die" }),
  },
  article: {
    view: view({ kind: "article", options: ["de", "het"], nouns: [{ noun: "jas", meaning: "coat" }, { noun: "huis", meaning: "house" }, { noun: "tafel", meaning: null }] }),
    answer: { kind: "article", articles: ["de", "de", "de"] },
    correct: grade({ correct: true, matched: true, items: [{ expected: "de", given: "de", ok: true }, { expected: "het", given: "het", ok: true }, { expected: "de", given: "de", ok: true }] }),
    wrong: grade({ correct: false, matched: false, items: [{ expected: "de", given: "de", ok: true }, { expected: "het", given: "de", ok: false }, { expected: "de", given: "de", ok: true }] }),
  },
  choice: {
    view: view({ kind: "choice", question: "Which is the comparative of “groot”?", options: ["groter", "grootste", "meer groot", "grooter"] }),
    answer: { kind: "choice", choice: 0 },
    correct: grade({ correct: true, matched: true, reference: "groter" }),
    wrong: grade({ correct: false, matched: false, reference: "groter" }),
  },
  quick_review: {
    view: view({ kind: "quick_review", cards: [
      { lessonId, wordId, direction: "understand", term: "de jas", meaning: "the coat", forms: "jassen", example: "Deze jas is warmer." },
      { lessonId, wordId: "70000000-0000-4000-8000-000000000002", direction: "produce", term: "warm", meaning: "warm", forms: "warmer, warmst", example: null },
    ] }),
    answer: { kind: "quick_review", results: ["got", "again"] },
    correct: grade({ correct: true, items: [{ expected: "de jas", given: "got", ok: true }, { expected: "warm", given: "got", ok: true }] }),
    wrong: grade({ correct: false, items: [{ expected: "de jas", given: "got", ok: true }, { expected: "warm", given: "again", ok: false }] }),
  },
  say_it: {
    view: view({ kind: "say_it", sentence: "Deze jas is warmer.", translation: "This coat is warmer." }),
    answer: { kind: "say_it", scores: scores(86) },
    correct: grade({ correct: true, score: 86, reference: "Deze jas is warmer." }),
    wrong: grade({ correct: false, score: 42, reference: "Deze jas is warmer.", items: [{ expected: "jas", given: "jas", ok: false }] }),
  },
  dictation: {
    view: view({ kind: "dictation", translation: "This coat is warmer." }),
    answer: { kind: "dictation", text: "Deze jas is warmer" },
    correct: grade({ correct: true, matched: true, reference: "Deze jas is warmer.", items: ["deze", "jas", "is", "warmer"].map((word) => ({ expected: word, given: word, ok: true })) }),
    wrong: grade({ correct: false, matched: false, reference: "Deze jas is warmer.",
      items: [{ expected: "deze", given: "deze", ok: true }, { expected: "jas", given: "jars", ok: false }, { expected: "is", given: "is", ok: true }, { expected: "warmer", given: "warmer", ok: true }] }),
  },
  fix_mistake: {
    view: view({ kind: "fix_mistake", sentence: "Deze jas is meer warm dan die.", hint: "Look at the comparative." }),
    answer: { kind: "fix_mistake", text: "Deze jas is warmer dan die." },
    correct: grade({ correct: true, matched: true, reference: "Deze jas is warmer dan die." }),
    wrong: grade({ correct: false, matched: false, verdict: "error", note: "Short adjectives take -er instead of “meer”.", reference: "Deze jas is warmer dan die." }),
  },
};

const meta = {
  title: "Tutor/Answer components",
  args: { kind: "fill_in", state: "open", skippable: true, disabled: false },
  argTypes: {
    kind: { control: "select", options: Object.keys(cases) },
    state: { control: "inline-radio", options: ["open", "correct", "wrong", "awaitingGrade"] },
    skippable: { name: "skippable (tutor chat)", control: "boolean" },
  },
  render: ({ kind, state, skippable, disabled }) => {
    const entry = cases[kind];
    const answered = state !== "open";
    // The wrong case answers with what its grade says was given.
    const answer = state === "wrong" ? wrongAnswer(kind, entry) : entry.answer;
    return <div style={{ maxWidth: "40rem" }}>
      <AnswerComponent key={`${kind}-${state}`} view={entry.view} answer={answered ? answer : null}
        grade={state === "correct" ? entry.correct : state === "wrong" ? entry.wrong : null}
        disabled={disabled} clip={clip(`component-${kind}`)} language="Dutch"
        onSkip={skippable ? async () => undefined : undefined} onAnswer={async () => undefined} />
    </div>;
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

function wrongAnswer(kind: TutorComponentKind, entry: Case): TutorComponentAnswer {
  switch (kind) {
    case "fill_in": return { kind, blanks: ["thee"] };
    case "translate": return { kind, text: "Deze jas is warm dan die." };
    case "word_order": return { kind, chunks: ["Deze jas", "warmer", "is", "dan die"] };
    case "article": return { kind, articles: ["de", "de", "de"] };
    case "choice": return { kind, choice: 2 };
    case "say_it": return { kind, scores: scores(42) };
    case "dictation": return { kind, text: "Deze jars is warmer" };
    case "fix_mistake": return { kind, text: "Deze jas is meer warmer dan die." };
    default: return entry.answer;
  }
}

export const FillIn: Story = { args: { kind: "fill_in" } };
export const FillInWrong: Story = { args: { kind: "fill_in", state: "wrong" } };
export const Translate: Story = { args: { kind: "translate" } };
export const TranslateAcceptedWithNote: Story = { args: { kind: "translate", state: "correct" } };
export const WordOrder: Story = { args: { kind: "word_order" } };
export const Article: Story = { args: { kind: "article" } };
export const ArticleWrong: Story = { args: { kind: "article", state: "wrong" } };
export const Choice: Story = { args: { kind: "choice" } };
export const QuickReview: Story = { args: { kind: "quick_review" } };
export const SayIt: Story = { args: { kind: "say_it" } };
export const SayItLowScore: Story = { args: { kind: "say_it", state: "wrong" } };
export const Dictation: Story = { args: { kind: "dictation" } };
export const FixMistake: Story = { args: { kind: "fix_mistake" } };
export const FixMistakeWrong: Story = { args: { kind: "fix_mistake", state: "wrong" } };
export const AwaitingGrade: Story = { args: { kind: "translate", state: "awaitingGrade" } };
export const ReadOnly: Story = { args: { kind: "fill_in", disabled: true, skippable: false } };
