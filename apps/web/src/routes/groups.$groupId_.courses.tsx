import { createFileRoute, redirect } from "@tanstack/react-router";
import { coursesQueryOptions, groupQueryOptions, sessionQueryOptions } from "../api";
import { CourseLibraryPage } from "../pages/CoursePages";

export const Route = createFileRoute("/groups/$groupId_/courses")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: async ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(groupQueryOptions(params.groupId)),
    context.queryClient.ensureInfiniteQueryData(coursesQueryOptions(params.groupId)),
  ]),
  component: CourseLibraryRoute,
});
function CourseLibraryRoute() { const { groupId } = Route.useParams(); return <CourseLibraryPage groupId={groupId} />; }
