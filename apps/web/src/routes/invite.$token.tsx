import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired group namespace: the product has one global library, so legacy links land on the global equivalent.
export const Route = createFileRoute("/invite/$token")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
});
