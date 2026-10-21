import type { LessonActivityViewPayload } from "@wordinator/contracts/lesson-activities";
import { SpokenLineActivity, type SpokenLineActivityProps } from "./SpokenLineActivity";

// Read aloud (docs/lesson-activities.md): the Dutch line, a Listen control, hold-to-talk, and an explicit Send.
type ReadAloudLine = Extract<LessonActivityViewPayload, { type: "read_aloud" }>["lines"][number];
export type ReadAloudActivityProps = Omit<SpokenLineActivityProps, "lines"> & { lines: readonly ReadAloudLine[] };

export function ReadAloudActivity(props: ReadAloudActivityProps) {
  return <SpokenLineActivity {...props} mode="read" />;
}
