import { createFileRoute, redirect } from "@tanstack/react-router";
import { groupQueryOptions, membersQueryOptions, sessionQueryOptions } from "../api";
import { MembersPage } from "../pages/PhaseFivePages";

export const Route = createFileRoute("/groups/$groupId_/members")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: async ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(groupQueryOptions(params.groupId)),
    context.queryClient.ensureQueryData(membersQueryOptions(params.groupId)),
  ]),
  component: MembersRoute,
});
function MembersRoute() { const { groupId } = Route.useParams(); return <MembersPage groupId={groupId} />; }
