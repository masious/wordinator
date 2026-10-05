import { createFileRoute, redirect } from "@tanstack/react-router";
import { groupQueryOptions, profileQueryOptions, sessionQueryOptions } from "../api";
import { ProfilePage } from "../pages/PhaseTwoPages";

export const Route = createFileRoute("/groups/$groupId_/members_/$userId")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(groupQueryOptions(params.groupId));
    return context.queryClient.ensureQueryData(profileQueryOptions(params.groupId, params.userId));
  },
  component: ProfileRoute,
});

function ProfileRoute() { const { groupId, userId } = Route.useParams(); return <ProfilePage groupId={groupId} userId={userId} />; }
