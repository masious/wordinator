import type { LessonActivityViewPayload } from "@wordinator/contracts/lesson-activities";
import { SpokenLineActivity, type SpokenLineActivityProps } from "./SpokenLineActivity";

// Speak from English (docs/lesson-activities.md): the English line; the Dutch reference is revealed only after Send.
type SpeakFromEnglishLine = Extract<LessonActivityViewPayload, { type: "speak_from_english" }>["lines"][number];
export type SpeakFromEnglishActivityProps = Omit<SpokenLineActivityProps, "lines"> & { lines: readonly SpeakFromEnglishLine[] };

export function SpeakFromEnglishActivity(props: SpeakFromEnglishActivityProps) {
  return <SpokenLineActivity {...props} mode="speak" />;
}
