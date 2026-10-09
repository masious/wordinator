import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQueryOptions, wordBookmarkKeysQueryOptions, wordBookmarksQueryOptions } from "../api";
import { WordsPage } from "../pages/WordsPage";

export const Route = createFileRoute("/groups/$groupId_/words")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureInfiniteQueryData(wordBookmarksQueryOptions(params.groupId)),
    context.queryClient.ensureQueryData(wordBookmarkKeysQueryOptions(params.groupId)),
  ]),
  component: WordsRoute,
});
function WordsRoute() { const { groupId } = Route.useParams(); return <WordsPage groupId={groupId} />; }
