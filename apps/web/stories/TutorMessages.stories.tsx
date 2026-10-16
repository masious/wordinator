import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TutorPart } from "@wordinator/contracts/tutor";
import { AssistantParts, UserMessage, type PartHandlers, type StreamPart } from "../src/organisms/Tutor/Messages";
import styles from "../src/organisms/Tutor/Tutor.module.css";
import { clip, course, grade, lesson, part, text, toolCallId, view } from "./tutorFixtures";

// Tutor messages as the chat renders them (docs/ai-tutor.md#messages-and-formatting): the learner's bubble, then the assistant's
// parts in order. Each scenario is one exchange; `Conversation` strings the healthy ones together. Answers and confirmations
// reach no API.
type Message = { role: "user"; text: string } | { role: "assistant"; parts: (TutorPart | StreamPart)[]; streaming?: boolean };
type Scenario = keyof typeof scenarios;
type Args = { scenario: Scenario; speech: boolean };

const steps = (name: string, detail: Record<string, unknown>, ok = true, error: string | null = null) => {
  const id = toolCallId();
  return [part({ type: "tool_call", toolCallId: id, name, arguments: {} }), part({ type: "tool_result", toolCallId: id, name, ok, error, detail })];
};
const ask = (kind: string, viewValue: unknown, fields: Record<string, unknown> = {}) => {
  const id = toolCallId();
  return [
    part({ type: "tool_call", toolCallId: id, name: `ask_${kind}`, arguments: {} }),
    part({ type: "component", toolCallId: id, kind, view: view(viewValue), answer: null, grade: null, answeredAt: null, ...fields }),
  ];
};
const confirm = (summary: unknown, fields: Record<string, unknown> = {}) =>
  part({ type: "confirmation", toolCallId: toolCallId(), summary, answer: null, outcome: null, answeredAt: null, ...fields });

const fillIn = { kind: "fill_in", prompt: "Ik hou meer van … dan van koffie.", blanks: 1, translation: "I like hot chocolate more than coffee." };

const scenarios = {
  // What the screenshot's turn should have been: short Markdown sections, spoken spans, and a real `ask_fill_in` call.
  explainAndAsk: [
    { role: "user", text: "test" },
    { role: "assistant", parts: [
      ...steps("get_weak_words", { count: 4 }),
      ...steps("get_lesson", { lessonId: lesson.id, lessonTitle: lesson.title, courseTitle: course.title }),
      text([
        "### Comparatives",
        "You're on **Deze jas is warmer**. To compare two things, add *-er* to the adjective and use `dan` for “than”:",
        "- warm → [[warmer]]",
        "- groot → [[groter]]",
        "- graag → [[liever]] (irregular)",
        "",
        "Example: [[Deze jas is warmer dan die jas.]]",
        "",
        "Let's practise one.",
      ].join("\n")),
      ...ask("fill_in", fillIn),
    ] },
  ],
  // The same turn when the model writes its tool call as text: the renderer shows it literally, as it must.
  toolCallAsText: [
    { role: "user", text: "test" },
    { role: "assistant", parts: [
      ...steps("get_weak_words", { count: 4 }),
      ...steps("get_lesson", { lessonId: lesson.id, lessonTitle: lesson.title, courseTitle: course.title }),
      text([
        "### Explanation",
        `The learner is currently studying the lesson "${lesson.title}" in the course "${course.title}".`,
        "",
        "The lesson is about comparing things using the comparative form of adjectives in Dutch.",
        "### Practice question",
        "Let's practice forming comparatives.",
        "### Fill in the blank",
        "**[[Ik hou meer van]] [[chocolademelk]] [[dan van koffie.]]**.",
        "",
        "Can you fill in the blanks?",
        "### Request",
        `[ask_fill_in(lessonId="${lesson.id}", prompt="Ik hou meer van ____ dan van koffie.", answers=["chocolademelk"])]`,
      ].join("\n")),
    ] },
  ],
  answered: [
    { role: "assistant", parts: [
      text("Fill in the comparative:"),
      ...ask("fill_in", fillIn, { answer: { kind: "fill_in", blanks: ["chocolademelk"] }, answeredAt: 1,
        grade: grade({ correct: true, matched: true, reference: "chocolademelk", items: [{ expected: "chocolademelk", given: "chocolademelk", ok: true }] }) }),
      ...steps("record_word_review", { term: "chocolademelk", result: "got" }),
      text("Right! Now say it out loud: [[Ik hou meer van chocolademelk dan van koffie.]]"),
      ...ask("say_it", { kind: "say_it", sentence: "Ik hou meer van chocolademelk dan van koffie.", translation: "I like hot chocolate more than coffee." }),
    ] },
  ],
  skipped: [
    { role: "assistant", parts: [
      ...ask("translate", { kind: "translate", source: "This coat is warmer." }, { skipped: true, answeredAt: 1 }),
      text("No problem, we'll come back to that one."),
    ] },
  ],
  toolSteps: [
    { role: "assistant", parts: [
      ...steps("search_words", { query: "warm", count: 3 }),
      ...steps("get_course_progress", { courseTitle: course.title, completedLessons: 6, publishedLessons: 12 }),
      ...steps("get_recent_mistakes", {}, false, "AI_TOOL_FAILED"),
      ...steps("update_tutor_notes", {}),
      text("Here's where you stand: **6 of 12** lessons done."),
    ] },
  ],
  running: [
    { role: "assistant", streaming: true, parts: [
      part({ type: "tool_call", toolCallId: toolCallId(), name: "get_lesson", arguments: {} }),
      { type: "raw_text", raw: "Comparatives add *-er*: [[warm → warmer]]. Next we'll" },
    ] },
  ],
  confirmations: [
    { role: "user", text: "I'm done with this lesson." },
    { role: "assistant", parts: [text("Great work. I'll mark it complete:"), confirm({ action: "complete_lesson", course, lesson })] },
    { role: "user", text: "Actually, start it over." },
    { role: "assistant", parts: [confirm({ action: "reset_lesson", course, lesson,
      deletes: { position: true, completion: true, practiceProgress: 3, attempts: 7, reviews: 12 } })] },
    { role: "assistant", parts: [confirm({ action: "save_ai_practice", view: view(fillIn),
      lessons: [{ course, lesson, afterBlockId: "50000000-0000-4000-8000-000000000001" }] })] },
  ],
  answeredConfirmations: [
    { role: "assistant", parts: [
      confirm({ action: "complete_lesson", course, lesson }, { answer: "confirmed", outcome: { ok: true, error: null }, answeredAt: 1 }),
      confirm({ action: "complete_lesson", course, lesson }, { answer: "cancelled", answeredAt: 1 }),
      confirm({ action: "complete_lesson", course, lesson }, { answer: "confirmed", outcome: { ok: false, error: "LESSON_UNAVAILABLE" }, answeredAt: 1 }),
    ] },
  ],
  error: [
    { role: "user", text: "Can you explain het and de?" },
    { role: "assistant", parts: [part({ type: "error", code: "AI_REQUEST_FAILED", message: "The tutor could not answer. Try again." })] },
  ],
  learnerText: [
    { role: "user", text: "Line one\nLine two with a link https://example.com and <b>no HTML</b>" },
    { role: "assistant", parts: [text("Markdown subset: **bold**, *italic*, `code`, a [link](https://example.com), and these stay literal: <b>html</b>, ![img](https://example.com/a.png), | a | b |.\n\n1. One\n2. Two")] },
  ],
} satisfies Record<string, Message[]>;

const healthy: Scenario[] = ["explainAndAsk", "answered", "toolSteps", "confirmations", "answeredConfirmations", "error"];

function Thread({ messages, speech }: { messages: readonly Message[]; speech: boolean }) {
  return <div className={styles.messages} style={{ maxWidth: "48rem" }}>
    {messages.map((message, index) => {
      if (message.role === "user") return <UserMessage key={index} text={message.text} />;
      const handlers: PartHandlers = {
        disabled: false, language: "Dutch", lang: "nl",
        speech: speech ? (span) => clip(`span-${index}-${span}`) : undefined,
        componentClip: (id) => clip(`component-${id}`),
        onAnswer: async () => undefined, onConfirm: async () => undefined, onSkip: async () => undefined, onRetry: () => undefined,
      };
      return <AssistantParts key={index} parts={message.parts} streaming={Boolean(message.streaming)} handlers={handlers} />;
    })}
  </div>;
}

const meta = {
  title: "Tutor/Messages",
  args: { scenario: "explainAndAsk", speech: true },
  argTypes: { scenario: { control: "select", options: Object.keys(scenarios) }, speech: { name: "speaker buttons", control: "boolean" } },
  render: ({ scenario, speech }) => <Thread messages={scenarios[scenario] as Message[]} speech={speech} />,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ExplainAndAsk: Story = { args: { scenario: "explainAndAsk" } };
// A replay of a misbehaving model: compare with ExplainAndAsk.
export const ToolCallWrittenAsText: Story = { args: { scenario: "toolCallAsText" } };
export const AnsweredAndGraded: Story = { args: { scenario: "answered" } };
export const SkippedQuestion: Story = { args: { scenario: "skipped" } };
export const ToolSteps: Story = { args: { scenario: "toolSteps" } };
export const Streaming: Story = { args: { scenario: "running" } };
export const Confirmations: Story = { args: { scenario: "confirmations" } };
export const AnsweredConfirmations: Story = { args: { scenario: "answeredConfirmations" } };
export const ErrorWithRetry: Story = { args: { scenario: "error" } };
export const FormattingAndPlainText: Story = { args: { scenario: "learnerText" } };
export const Conversation: Story = {
  args: { scenario: "explainAndAsk" },
  render: ({ speech }) => <Thread messages={healthy.flatMap((name) => scenarios[name] as Message[])} speech={speech} />,
};
