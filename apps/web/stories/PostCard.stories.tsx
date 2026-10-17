import type { Meta, StoryObj } from "@storybook/react-vite";
import PostCard from "../src/organisms/PostCard/PostCard";
import { groupId, postVariants, type PostVariant } from "./fixtures";

// Every journal post variant, as a feed card and as the post page shows it. `note` adds the post's notes, which the post page
// conceals until Show notes; feed cards never show them.
type Args = { variant: PostVariant; compact: boolean; note: boolean };

const meta = {
  title: "Journal/Posts",
  tags: ["a11y"],
  args: { variant: "sharedSentence", compact: true, note: false },
  argTypes: {
    variant: { control: "select", options: Object.keys(postVariants) },
    compact: { name: "feed card", control: "boolean" },
    note: { control: "boolean" },
  },
  render: ({ variant, compact, note }) => <div style={{ maxWidth: 760 }}>
    <PostCard key={`${variant}-${compact}-${note}`} post={postVariants[variant](note)} groupId={groupId} compact={compact} />
  </div>,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

const card = (variant: PostVariant, note = false): Story => ({ args: { variant, compact: true, note } });
const page = (variant: PostVariant, note = false): Story => ({ args: { variant, compact: false, note } });

export const SharedSentenceCard = card("sharedSentence");
export const SharedSentencePage = page("sharedSentence", true);
export const QuestionCard = card("question");
export const QuestionPage = page("question", true);
export const ReadingCard = card("reading");
export const ReadingPage = page("reading", true);
export const FillInCard = card("fillIn");
export const FillInPage = page("fillIn", true);
export const CourseCard = card("course");
export const CoursePage = page("course");
export const CourseUnavailableCard = card("courseUnavailable");
export const CourseUnavailablePage = page("courseUnavailable");

export const ExampleShareCard = card("exampleShare");
export const ExampleShareCardWithNote = card("exampleShare", true);
export const ExampleSharePage = page("exampleShare");
export const ExampleSharePageWithNote = page("exampleShare", true);
export const ExampleShareUnlinkedCard = card("exampleShareUnlinked");
export const ExampleShareUnlinkedPage = page("exampleShareUnlinked", true);
export const DialogueShareCard = card("dialogueShare");
export const DialogueSharePage = page("dialogueShare");
export const DialogueSharePageWithNote = page("dialogueShare", true);
export const DialogueShareUnavailableCard = card("dialogueShareUnavailable");
export const DialogueShareUnavailablePage = page("dialogueShareUnavailable", true);
export const QuestionShareCard = card("questionShare");
export const QuestionSharePage = page("questionShare");
export const QuestionSharePageWithNote = page("questionShare", true);
export const FillInQuestionShareCard = card("fillInQuestionShare");
export const FillInQuestionSharePage = page("fillInQuestionShare");
