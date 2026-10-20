import { useQuery } from "@tanstack/react-query";
import type { LearningActivityRange } from "@wordinator/contracts/learning";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api";
import { GroupFrame } from "../organisms/GroupFrame/GroupFrame";
import { ProgressDetails } from "../organisms/LearningHome/ProgressDetails";
import { LoadingState } from "../ui";
import shellStyles from "./PhaseOnePages.module.css";

// The route's search: `range=month` opens the Month read; anything else is the Week.
export function validateProgressSearch(search: Record<string, unknown>): { range?: "month" } {
  return search.range === "month" ? { range: "month" } : {};
}

// The Progress page (docs/learning-time.md#progress-page), opened from the home Activity card.
export function ProgressPage({ groupId, range, onRange }: { groupId: string; range: LearningActivityRange; onRange: (range: LearningActivityRange) => void }) {
  const { t } = useTranslation();
  const session = useQuery(sessionQueryOptions());
  if (session.isPending) return <main className={shellStyles.center}><LoadingState label={t("progress.loading")} /></main>;
  if (session.data?.status !== "signedIn") return null;
  return <GroupFrame groupId={groupId} session={session.data}><ProgressDetails groupId={groupId} range={range} onRange={onRange} /></GroupFrame>;
}
