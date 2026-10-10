import {
  ArrowDownUp, AudioLines, BookA, BookOpenText, Globe, Languages, Lightbulb, ListChecks, MessageSquareReply, MessagesSquare,
  NotebookPen, PencilLine, Puzzle, Repeat2, Sparkles, type LucideIcon,
} from "lucide-react";
import type { OverviewCategory } from "./overviewModel";

export type CategoryTone = "yellow" | "orange" | "red" | "pink" | "violet" | "blue" | "teal" | "green" | "slate";

// How each stop category looks on the trail. Tones group related work: orange for dialogue, violet for sentence structure,
// blue for rewording, teal for filling in and culture. Each category also has one of Noto's animated emoji, by character and
// animation codepoint (see `notoEmoji`); only emoji that Noto animates are chosen.
export const stopCategories = {
  intro: { icon: Sparkles, tone: "yellow", emoji: "👋", codepoint: "1f44b" },
  topic: { icon: Lightbulb, tone: "yellow", emoji: "💡", codepoint: "1f4a1" },
  grammar: { icon: Puzzle, tone: "violet", emoji: "⚙️", codepoint: "2699_fe0f" },
  vocabulary: { icon: BookA, tone: "green", emoji: "🧠", codepoint: "1f9e0" },
  pronunciation: { icon: AudioLines, tone: "pink", emoji: "🗣️", codepoint: "1f5e3_fe0f" },
  culture: { icon: Globe, tone: "teal", emoji: "🌍", codepoint: "1f30d" },
  story: { icon: MessagesSquare, tone: "orange", emoji: "🎭", codepoint: "1f3ad" },
  summary: { icon: ListChecks, tone: "slate", emoji: "✅", codepoint: "2705" },
  fillIn: { icon: PencilLine, tone: "teal", emoji: "✏️", codepoint: "270f_fe0f" },
  conversation: { icon: MessageSquareReply, tone: "orange", emoji: "💬", codepoint: "1f4ac" },
  translate: { icon: Languages, tone: "blue", emoji: "🤝", codepoint: "1f91d" },
  wordOrder: { icon: ArrowDownUp, tone: "violet", emoji: "🎲", codepoint: "1f3b2" },
  rewrite: { icon: Repeat2, tone: "blue", emoji: "🪄", codepoint: "1fa84" },
  reading: { icon: BookOpenText, tone: "red", emoji: "📚", codepoint: "1f4da" },
  writing: { icon: NotebookPen, tone: "pink", emoji: "✍️", codepoint: "270d_fe0f" },
} as const satisfies Record<OverviewCategory, { icon: LucideIcon; tone: CategoryTone; emoji: string; codepoint: string }>;

export const startEmoji = { emoji: "🚩", codepoint: "1f6a9" } as const;
export const finishEmoji = { emoji: "🏆", codepoint: "1f3c6" } as const;
