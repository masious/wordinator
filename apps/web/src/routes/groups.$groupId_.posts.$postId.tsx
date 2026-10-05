import { createFileRoute, redirect } from "@tanstack/react-router";
import { groupQueryOptions, postQueryOptions, sessionQueryOptions } from "../api";
import { PostDetailPage } from "../pages/PhaseThreePages";

export const Route = createFileRoute("/groups/$groupId_/posts/$postId")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(groupQueryOptions(params.groupId));
    return context.queryClient.ensureQueryData(postQueryOptions(params.groupId, params.postId));
  },
  component: PostRoute,
});
function PostRoute() { const { groupId, postId } = Route.useParams(); return <PostDetailPage groupId={groupId} postId={postId} />; }
