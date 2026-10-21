import { createFileRoute } from "@tanstack/react-router";
import { requireLibrary } from "../libraryRoute";
import { AdminAiPage } from "../pages/AdminAiPage";

// Superuser AI providers and models (docs/settings-and-administration.md#ai-providers). The page shows a not-available state to
// other accounts and makes no request for them; the API refuses them anyway.
export const Route = createFileRoute("/admin/ai")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: AdminAiRoute,
});

function AdminAiRoute() {
  const { groupId } = Route.useRouteContext();
  return <AdminAiPage groupId={groupId} />;
}
