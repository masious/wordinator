import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import type { AdminAnalyticsRange } from "@wordinator/contracts/admin";
import { requireLibrary } from "../libraryRoute";
import { AdminAnalyticsPage, validateAnalyticsSearch } from "../pages/AdminAnalyticsPage";

// Superuser analytics (C14e). The page shows a not-available state to other accounts; the API refuses them anyway.
export const Route = createFileRoute("/admin/analytics")({
  validateSearch: validateAnalyticsSearch,
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: AdminAnalyticsRoute,
});

function AdminAnalyticsRoute() {
  const { groupId } = Route.useRouteContext();
  const { days } = Route.useSearch();
  const navigate = Route.useNavigate();
  const onDays = useCallback((next: AdminAnalyticsRange) => { void navigate({ search: next === 7 ? {} : { days: next }, replace: true }); }, [navigate]);
  return <AdminAnalyticsPage groupId={groupId} days={days ?? 7} onDays={onDays} />;
}
