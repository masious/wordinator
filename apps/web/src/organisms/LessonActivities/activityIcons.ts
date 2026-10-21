import { BookOpenText, Drama, Footprints, Languages, ListChecks, Mic, NotebookPen, Puzzle, Shuffle, type LucideIcon } from "lucide-react";
import type { ActivityType } from "@wordinator/contracts/lesson-activities";

// One icon per activity type, so each suggested activity reads at a glance (the links in the lesson box's Do more with AI list).
const icons: Record<ActivityType, LucideIcon> = {
  story_summary: BookOpenText,
  story_comprehension: ListChecks,
  grammar_explanation: NotebookPen,
  guided_grammar: Footprints,
  tricky_grammar: Puzzle,
  mixed_practice: Shuffle,
  roleplay: Drama,
  read_aloud: Mic,
  speak_from_english: Languages,
};

export function activityIcon(type: ActivityType): LucideIcon {
  return icons[type];
}
