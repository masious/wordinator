import type { Meta, StoryObj } from "@storybook/react-vite";
import { lessonShareKey } from "@wordinator/contracts";
import { readPracticeBlock } from "@wordinator/contracts/lesson-document";
import { expect, userEvent, within } from "storybook/test";
import { LessonShareScope, ShareButton, type SharePiece } from "../src/organisms/LessonShare/LessonShare";
import { courseId, groupId, shareBlocks, shareLesson } from "./fixtures";

// The share action and its confirmation dialog. Submitting reaches no API in Storybook and shows its error.
type Args = { piece: "example" | "dialogue" | "question" | "readingQuestion"; shared: boolean };

const { detail } = shareLesson();
const practice = (blockId: string) => {
  const block = detail.lessons[0]!.document!.blocks.find((entry) => entry.id === blockId);
  if (block?.type !== "practice") throw new Error("Missing practice fixture");
  return readPracticeBlock(block);
};
const question = (blockId: string): SharePiece => {
  const { instruction, passage, items } = practice(blockId); const item = items[0]!;
  return { kind: "question", blockId, itemIndex: 0, instruction, prompt: item.prompt, authorsVersion: item.authorsVersion, passage: Boolean(passage) };
};
const pieces: Record<Args["piece"], SharePiece> = {
  example: { kind: "example", block: shareBlocks.example },
  dialogue: { kind: "dialogue", block: shareBlocks.dialogue },
  question: question(shareBlocks.practice),
  readingQuestion: question(shareBlocks.reading),
};
const keyOf = (piece: SharePiece) => lessonShareKey({ blockId: piece.kind === "question" ? piece.blockId : piece.block.id, prompt: piece.kind === "question" ? piece.prompt : null });

const meta = {
  title: "Journal/Lesson share action",
  args: { piece: "example", shared: false },
  argTypes: { piece: { control: "select", options: Object.keys(pieces) }, shared: { name: "already shared", control: "boolean" } },
  render: ({ piece, shared }) => {
    const value = pieces[piece];
    const { lesson, detail: course } = shareLesson(shared ? { [keyOf(value)]: "60000000-0000-4000-8000-000000000001" } : {});
    return <LessonShareScope scope={{ groupId, courseId, lesson, detail: course }}><ShareButton piece={value} /></LessonShareScope>;
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

const openDialog: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "Share" }));
};

// The example's own note prefills the sharer's note.
export const ExampleDialogPrefilledNote: Story = {
  args: { piece: "example" },
  play: async (context) => {
    await openDialog(context);
    await expect(await within(document.body).findByRole("dialog", { name: "Share an example" })).toBeInTheDocument();
  },
};
export const DialogueDialog: Story = { args: { piece: "dialogue" }, play: openDialog };
// A practice item's note is editor-only, so a question starts with an empty note.
export const QuestionDialogEmptyNote: Story = { args: { piece: "question" }, play: openDialog };
export const ShareButtonIdle: Story = { args: { piece: "example" } };
export const AlreadyShared: Story = { args: { piece: "example", shared: true } };
export const ReadingQuestionNotShareable: Story = { args: { piece: "readingQuestion" } };
