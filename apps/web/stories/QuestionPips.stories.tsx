import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { QuestionPips, type QuestionPipItem } from "../src/molecules/QuestionPips";

const items: QuestionPipItem[] = [
  { id: "current", label: "Practice 1, current and open", state: "open" },
  { id: "open", label: "Practice 2, open", state: "open" },
  { id: "answered", label: "Practice 3, answered", state: "answered" },
  { id: "skipped", label: "Practice 4, skipped", state: "skipped" },
  { id: "done", label: "Practice 5, done", state: "done" },
];

function Preview() {
  const [current, setCurrent] = useState(0);
  return <QuestionPips label="Practice sequence status" items={items} current={current} onSelect={setCurrent} />;
}

const meta = { title: "Tutor/Question pips", render: () => <Preview />, tags: ["a11y"] } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Statuses: Story = {};
