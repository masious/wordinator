import { createFileRoute } from "@tanstack/react-router";
import { requireLibrary } from "../libraryRoute";
import { JournalPage } from "../pages/PhaseOnePages";

export const Route = createFileRoute("/journal")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: JournalRoute,
});

function JournalRoute() {
  const { groupId } = Route.useRouteContext();
  return <JournalPage groupId={groupId} />;
}
