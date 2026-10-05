import { createFileRoute, redirect } from "@tanstack/react-router";
import { groupQueryOptions, sessionQueryOptions, settingsQueryOptions } from "../api";
import { SettingsPage } from "../pages/PhaseTwoPages";

export const Route = createFileRoute("/groups/$groupId_/settings")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: async ({ context, params }) => {
    await Promise.all([context.queryClient.ensureQueryData(groupQueryOptions(params.groupId)), context.queryClient.ensureQueryData(settingsQueryOptions())]);
  },
  component: SettingsRoute,
});

function SettingsRoute() { const { groupId } = Route.useParams(); return <SettingsPage groupId={groupId} />; }
