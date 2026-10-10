import { createFileRoute } from "@tanstack/react-router";
import { requireLibrary } from "../libraryRoute";
import { AccountSettingsPage } from "../pages/SettingsPages";

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: SettingsRoute,
});

function SettingsRoute() {
  const { groupId } = Route.useRouteContext();
  return <AccountSettingsPage groupId={groupId} global />;
}
