import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired group namespace: the product has one global library, so legacy links land on the global equivalent.
export const Route = createFileRoute("/groups/$groupId_/settings/")({
  beforeLoad: () => { throw redirect({ to: "/settings", replace: true }); },
});
