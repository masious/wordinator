import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired group namespace: the product has one global library, so legacy links land on the global equivalent.
export const Route = createFileRoute("/groups/$groupId_/words")({
  beforeLoad: () => { throw redirect({ to: "/words", replace: true }); },
});
