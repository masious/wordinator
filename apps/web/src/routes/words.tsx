import { createFileRoute } from "@tanstack/react-router";
import { requireLibrary } from "../libraryRoute";
import { WordsPage } from "../pages/WordsPage";

export const Route = createFileRoute("/words")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: WordsRoute,
});

function WordsRoute() {
  const { groupId } = Route.useRouteContext();
  return <WordsPage groupId={groupId} />;
}
