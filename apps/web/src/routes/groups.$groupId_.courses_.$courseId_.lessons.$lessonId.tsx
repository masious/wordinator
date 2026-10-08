import { createFileRoute, redirect } from "@tanstack/react-router";
import { courseQueryOptions, groupQueryOptions, lessonQueryOptions, sessionQueryOptions } from "../api";
import { LessonPage } from "../pages/CoursePages";

export const Route = createFileRoute("/groups/$groupId_/courses_/$courseId_/lessons/$lessonId")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(groupQueryOptions(params.groupId));
    // A missing or hidden course or lesson renders its unavailable state instead of failing the route.
    await Promise.all([
      context.queryClient.prefetchQuery(courseQueryOptions(params.groupId, params.courseId)),
      context.queryClient.prefetchQuery(lessonQueryOptions(params.groupId, params.courseId, params.lessonId)),
    ]);
  },
  component: LessonRoute,
});
function LessonRoute() { const { groupId, courseId, lessonId } = Route.useParams(); return <LessonPage groupId={groupId} courseId={courseId} lessonId={lessonId} />; }
