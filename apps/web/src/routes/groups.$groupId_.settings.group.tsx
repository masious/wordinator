import { createFileRoute } from "@tanstack/react-router";
import { GroupSettingsPage } from "../pages/SettingsPages";
import { requireCreatorSettings } from "../settingsRoutes";

export const Route = createFileRoute("/groups/$groupId_/settings/group")({
  beforeLoad: ({ context, params }) => requireCreatorSettings(context.queryClient, params.groupId),
  component: GroupSettingsRoute,
});

function GroupSettingsRoute() { const { groupId } = Route.useParams(); return <GroupSettingsPage groupId={groupId} />; }
