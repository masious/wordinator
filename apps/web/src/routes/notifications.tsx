import { createFileRoute } from "@tanstack/react-router";
import { requireLibrary } from "../libraryRoute";
import { NotificationsPage } from "../pages/PhaseSixPages";

export const Route = createFileRoute("/notifications")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const { groupId } = Route.useRouteContext();
  return <NotificationsPage groupId={groupId} />;
}
