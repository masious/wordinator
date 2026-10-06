import { createFileRoute } from "@tanstack/react-router";
import { groupQueryOptions, settingsQueryOptions } from "../api";
import { AccountSettingsPage } from "../pages/SettingsPages";
import { requireSettingsSession } from "../settingsRoutes";

export const Route = createFileRoute("/groups/$groupId_/settings/account")({
  beforeLoad: ({ context }) => requireSettingsSession(context.queryClient),
  loader: async ({ context, params }) => {
    await Promise.all([context.queryClient.ensureQueryData(groupQueryOptions(params.groupId)), context.queryClient.ensureQueryData(settingsQueryOptions())]);
  },
  component: AccountSettingsRoute,
});

function AccountSettingsRoute() { const { groupId } = Route.useParams(); return <AccountSettingsPage groupId={groupId} />; }
