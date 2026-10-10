import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired group namespace: the product has one global library, so legacy links land on the global equivalent.
export const Route = createFileRoute("/groups/$groupId_/notifications")({
  beforeLoad: () => { throw redirect({ to: "/notifications", replace: true }); },
});
