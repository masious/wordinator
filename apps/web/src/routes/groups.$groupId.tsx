import { createFileRoute, redirect } from "@tanstack/react-router";
import { groupQueryOptions, sessionQueryOptions } from "../api";
import { GroupPage } from "../pages/PhaseOnePages";

export const Route = createFileRoute("/groups/$groupId")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(groupQueryOptions(params.groupId)),
  component: GroupRoute,
});
function GroupRoute() { const { groupId } = Route.useParams(); return <GroupPage groupId={groupId} />; }
