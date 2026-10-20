import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { SpokenAnswer } from "../src/molecules/speechRecognition";
import { SpeechRecognitionScope } from "../src/molecules/speechRecognition";
import { WordDrillCard } from "../src/organisms/WordDrill/WordDrillCard";
import { lessonId, speechUrl } from "./fixtures";
import { wordId } from "./tutorFixtures";

// The drill card (docs/words.md#a-card). `heard` picks what a spoken answer left on the back: nothing, a good score, a
// mispronounced word, or silence (every score zero, so the meters stay out). Show answer and the grades work, reaching no API.
type Heard = "none" | "good" | "mispronounced" | "nothingHeard";
type Args = { direction: "understand" | "produce"; revealed: boolean; heard: Heard; word: WordName };
type Fields = { term: string; meaning: string; forms: string | null; example: string | null; note: string | null };

// Words from the production lesson index (2026-10-20): the usual card, then the longest term, meaning, forms, example, and note
// of the library, and two with a lot of everything, to see how the face scrolls and wraps.
const words = {
  vaak: { term: "vaak", meaning: "often", forms: "vaker, het vaakst", example: "Noor kookt vaak.", note: "Sits after the verb in a main clause: Ik ga vaak naar school." },
  longTerm: { term: "Er is geen slecht weer, alleen slechte kleding.", meaning: "There's no such thing as bad weather, only bad clothing.", forms: null, example: null, note: "A Dutch saying. de kleding = clothing (more in 18-a)." },
  longMeaning: { term: "de Elfstedentocht", meaning: "the Eleven Cities Tour: a famous (and rare) 200 km skating race on natural ice in Friesland", forms: null, example: null, note: "Culture. Last held in 1997." },
  longForms: { term: "boodschappen doen", meaning: "to do the shopping", forms: "doet boodschappen · deed boodschappen · boodschappen gedaan", example: "Ik doe straks boodschappen.", note: "Two parts, but not a separable verb." },
  longExample: { term: "het nummer", meaning: "number", forms: "de nummers", example: "Het nummer is nul zes, achtendertig, tweeëntwintig, negentien, vierenzeventig.", note: null },
  longNote: { term: "alsjeblieft", meaning: "please (informal); also “here you are” when you hand something over", forms: null, example: "Alsjeblieft, Tess!", note: "alstublieft is the formal form (01-b: “Een moment, alstublieft.”). alsjeblieft already appeared once, without a card, in 03-a (“Nederlands, alsjeblieft!”)." },
  everythingPrefix: { term: "donker- / licht-", meaning: "dark- / light-, pale- (colour prefix)", forms: null, example: "Henk heeft een donkerblauwe jas.", note: "Combine with a colour: donkerblauw, lichtgroen. licht already appeared in 13-2 meaning 'bright, full of light'; here it is a prefix for a pale shade." },
  everythingVerb: { term: "voorbereiden", meaning: "to prepare", forms: "bereidt voor · bereidde voor · voorbereid", example: "Karin moet de presentatie nog voorbereiden.", note: "Separable: Karin bereidt de presentatie voor. After a modal it stays whole: Karin moet de presentatie voorbereiden." },
} satisfies Record<string, Fields>;
type WordName = keyof typeof words;

// What the learner "said" for the shown word: the term itself, a near miss, or silence.
const answers = (term: string): Record<Heard, SpokenAnswer | null> => ({
  none: null,
  good: { heard: term, matches: true, assessment: { overall: 92, accuracy: 94, fluency: 88, completeness: 100, words: [{ word: term, accuracy: 94, error: "none" }] } },
  mispronounced: { heard: term.slice(0, -1), matches: false, assessment: { overall: 54, accuracy: 48, fluency: 70, completeness: 100, words: [{ word: term, accuracy: 48, error: "mispronunciation" }] } },
  nothingHeard: { heard: ".", matches: false, assessment: { overall: 0, accuracy: 0, fluency: 0, completeness: 0, words: [{ word: term, accuracy: null, error: "omission" }] } },
});

const card = (args: Args) => ({
  word: { id: wordId, lessonId, ...words[args.word], speech: { term: speechUrl, example: speechUrl } },
  direction: args.direction,
  course: { id: "50000000-0000-4000-8000-000000000001", slug: "dutch-foundations", title: "Part II: Everyday Life" },
  lesson: { id: lessonId, slug: "mijn-dag", title: "Mijn dag" },
});

function Preview(args: Args) {
  const [revealed, setRevealed] = useState(args.revealed);
  // Changed controls restart the card, so a flipped one follows the Revealed control.
  const key = `${args.direction}:${args.revealed}:${args.heard}:${args.word}`;
  return <div style={{ width: "min(100%, var(--width-conversation))", marginInline: "auto", containerType: "inline-size" }}>
    {/* The scope makes the practice controls on the back appear where the browser can recognize speech; nothing is sent. */}
    <SpeechRecognitionScope locale="nl-NL" token={{ get: () => Promise.reject(new Error("Storybook")), forget: () => undefined }}>
    <WordDrillCard key={key} card={card(args)} language="Dutch" autoFocus={false} revealed={revealed || args.revealed}
      heard={answers(words[args.word].term)[args.heard]} onReveal={() => setRevealed(true)} onGrade={() => setRevealed(false)} />
    </SpeechRecognitionScope>
  </div>;
}

const meta = {
  title: "Words/Drill card",
  component: Preview,
  args: { direction: "produce", revealed: true, heard: "nothingHeard", word: "vaak" },
  argTypes: {
    direction: { control: "inline-radio", options: ["understand", "produce"] },
    word: { control: "select", options: Object.keys(words) },
    heard: { control: "inline-radio", options: ["none", "good", "mispronounced", "nothingHeard"] },
  },
} satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Front: Story = { args: { revealed: false, heard: "none" } };
export const BackPlain: Story = { args: { heard: "none" } };
export const BackGoodScore: Story = { args: { heard: "good" } };
export const BackMispronounced: Story = { args: { heard: "mispronounced" } };
export const BackNothingHeard: Story = {};
export const UnderstandBack: Story = { args: { direction: "understand", heard: "none", word: "longForms" } };
export const LongTerm: Story = { args: { word: "longTerm", heard: "good" } };
export const LongTermFront: Story = { args: { word: "longTerm", revealed: false, heard: "none" } };
export const LongTermUnderstandFront: Story = { args: { word: "longTerm", direction: "understand", revealed: false, heard: "none" } };
export const LongMeaning: Story = { args: { word: "longMeaning", heard: "good" } };
export const LongMeaningProduceFront: Story = { args: { word: "longMeaning", revealed: false, heard: "none" } };
export const LongForms: Story = { args: { word: "longForms", heard: "good" } };
export const LongExample: Story = { args: { word: "longExample", heard: "mispronounced" } };
export const LongExampleProduceFront: Story = { args: { word: "longExample", revealed: false, heard: "none" } };
export const LongNote: Story = { args: { word: "longNote", heard: "good" } };
export const LongNotePlain: Story = { args: { word: "longNote", heard: "none" } };
export const EverythingLongPrefix: Story = { args: { word: "everythingPrefix", heard: "mispronounced" } };
export const EverythingLongVerb: Story = { args: { word: "everythingVerb", heard: "good" } };
