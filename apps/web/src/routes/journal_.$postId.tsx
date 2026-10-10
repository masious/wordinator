import { createFileRoute } from "@tanstack/react-router";
import { postQueryOptions } from "../api";
import { requireLibrary } from "../libraryRoute";
import { PostDetailPage } from "../pages/PhaseThreePages";

export const Route = createFileRoute("/journal_/$postId")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  // A missing or deleted post renders its unavailable state instead of failing the route.
  loader: ({ context, params }) => context.queryClient.prefetchQuery(postQueryOptions(context.groupId, params.postId)),
  component: PostRoute,
});

function PostRoute() {
  const { postId } = Route.useParams();
  const { groupId } = Route.useRouteContext();
  return <PostDetailPage groupId={groupId} postId={postId} />;
}
