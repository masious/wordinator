import { createFileRoute } from "@tanstack/react-router";
import { invitationQueryOptions } from "../api";
import { InvitationPage } from "../pages/PhaseOnePages";

export const Route = createFileRoute("/invite/$token")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(invitationQueryOptions(params.token)),
  component: InviteRoute,
});
function InviteRoute() { const { token } = Route.useParams(); return <InvitationPage token={token} />; }
