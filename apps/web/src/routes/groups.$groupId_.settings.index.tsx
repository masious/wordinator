import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/groups/$groupId_/settings/")({
  beforeLoad: ({ params }) => { throw redirect({ to: "/groups/$groupId/settings/account", params: { groupId: params.groupId }, replace: true }); },
});
