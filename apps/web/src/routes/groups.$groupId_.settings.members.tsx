import { createFileRoute } from "@tanstack/react-router";
import { membershipsQueryOptions } from "../api";
import { MembershipSettingsPage } from "../pages/SettingsPages";
import { requireCreatorSettings } from "../settingsRoutes";

export const Route = createFileRoute("/groups/$groupId_/settings/members")({
  beforeLoad: ({ context, params }) => requireCreatorSettings(context.queryClient, params.groupId),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(membershipsQueryOptions(params.groupId)),
  component: MembershipSettingsRoute,
});

function MembershipSettingsRoute() { const { groupId } = Route.useParams(); return <MembershipSettingsPage groupId={groupId} />; }
