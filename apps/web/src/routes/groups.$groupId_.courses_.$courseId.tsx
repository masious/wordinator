import { createFileRoute, redirect } from "@tanstack/react-router";
import { courseQueryOptions, groupQueryOptions, sessionQueryOptions } from "../api";
import { CoursePage } from "../pages/CoursePages";

export const Route = createFileRoute("/groups/$groupId_/courses_/$courseId")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(groupQueryOptions(params.groupId));
    // A missing or hidden course renders its unavailable state instead of failing the route.
    await context.queryClient.prefetchQuery(courseQueryOptions(params.groupId, params.courseId));
  },
  component: CourseRoute,
});
function CourseRoute() { const { groupId, courseId } = Route.useParams(); return <CoursePage groupId={groupId} courseId={courseId} />; }
