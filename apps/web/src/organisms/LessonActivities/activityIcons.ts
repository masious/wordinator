import { Footprints, Mic, Puzzle, Shuffle, type LucideIcon } from "lucide-react";
import type { ActivityType } from "@wordinator/contracts/lesson-activities";

// One icon per activity type, so each suggested activity reads at a glance (the links in the lesson box's Do more with AI list).
const icons: Record<ActivityType, LucideIcon> = {
  guided_grammar: Footprints,
  tricky_grammar: Puzzle,
  mixed_practice: Shuffle,
  read_aloud: Mic,
};

export function activityIcon(type: ActivityType): LucideIcon {
  return icons[type];
}
