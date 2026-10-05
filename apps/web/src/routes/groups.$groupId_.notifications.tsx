import { createFileRoute, redirect } from "@tanstack/react-router";
import { notificationsQueryOptions, sessionQueryOptions } from "../api";
import { NotificationsPage } from "../pages/PhaseSixPages";

export const Route = createFileRoute("/groups/$groupId_/notifications")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(notificationsQueryOptions(params.groupId)),
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const { groupId } = Route.useParams();
  return <NotificationsPage groupId={groupId} />;
}
