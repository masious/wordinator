import { createFileRoute } from "@tanstack/react-router";
import type { LearningActivityRange } from "@wordinator/contracts/learning";
import { useCallback } from "react";
import { requireLibrary } from "../libraryRoute";
import { ProgressPage, validateProgressSearch } from "../pages/ProgressPage";

export const Route = createFileRoute("/progress")({
  validateSearch: validateProgressSearch,
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: ProgressRoute,
});

function ProgressRoute() {
  const { groupId } = Route.useRouteContext();
  const { range } = Route.useSearch();
  const navigate = Route.useNavigate();
  // The range replaces the history entry, like a tab, so Back leaves the page.
  const onRange = useCallback((next: LearningActivityRange) => { void navigate({ search: next === "month" ? { range: "month" } : {}, replace: true }); }, [navigate]);
  return <ProgressPage groupId={groupId} range={range ?? "week"} onRange={onRange} />;
}
