import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TutorPart, TutorComponentKind } from "@wordinator/contracts/tutor";
import { QuestionDock } from "../src/organisms/Tutor/QuestionDock";
import { clip, part, toolCallId, view } from "./tutorFixtures";

type Question = Extract<TutorPart, { type: "component" }>;
type Args = { count: number; disabled: boolean; allowSkipSet: boolean };

const question = (kind: TutorComponentKind, value: unknown): Question => {
  const parsed = part({ type: "component", toolCallId: toolCallId(), kind, view: view(value), answer: null, grade: null, answeredAt: null });
  if (parsed.type !== "component") throw new Error("Expected a tutor question component.");
  return parsed;
};

const questions = [
  question("fill_in", { kind: "fill_in", prompt: "Ik woon in een … huis.", blanks: 1, translation: "I live in a large house." }),
  question("choice", { kind: "choice", question: "Which is the comparative of ‘groot’?", options: ["groter", "grootste", "meer groot"] }),
  question("translate", { kind: "translate", source: "The garden is smaller than the house." }),
  question("word_order", { kind: "word_order", chunks: ["groter", "is", "de tuin", "dan het huis"], translation: "The garden is larger than the house." }),
] satisfies Question[];

const meta = {
  title: "Tutor/Question dock",
  args: { count: 4, disabled: false, allowSkipSet: true },
  argTypes: {
    count: { control: { type: "range", min: 1, max: questions.length, step: 1 } },
    disabled: { control: "boolean" },
    allowSkipSet: { name: "allow skipping the whole set", control: "boolean" },
  },
  render: ({ count, disabled, allowSkipSet }) => <div style={{ maxWidth: "48rem" }}>
    <QuestionDock key={count} components={questions.slice(0, count)} language="Dutch" disabled={disabled}
      onSubmit={async () => undefined} onSkipSet={allowSkipSet ? () => undefined : undefined}
      clip={(id) => clip(`question-${id}`)} />
  </div>,
  tags: ["a11y"],
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveQuestionSet: Story = {};
export const OneQuestion: Story = { args: { count: 1 } };
