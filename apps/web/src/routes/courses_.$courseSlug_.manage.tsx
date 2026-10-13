import { createFileRoute, redirect } from "@tanstack/react-router";
import { courseQueryOptions, courseRefQueryOptions } from "../api";
import { requireLibrary } from "../libraryRoute";
import { ManageCoursePage } from "../pages/CoursePages";

export const Route = createFileRoute("/courses_/$courseSlug_/manage")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  loader: async ({ context, params }) => {
    const ref = await context.queryClient.ensureQueryData(courseRefQueryOptions(context.groupId, params.courseSlug)).catch(() => null);
    // A legacy ID link lands on the readable URL.
    if (ref && ref.courseSlug !== params.courseSlug) throw redirect({ to: "/courses/$courseSlug/manage", params: { courseSlug: ref.courseSlug }, replace: true });
    const courseId = ref?.courseId ?? params.courseSlug;
    await context.queryClient.prefetchQuery(courseQueryOptions(context.groupId, courseId));
    return { courseId };
  },
  component: ManageCourseRoute,
});

function ManageCourseRoute() {
  const { courseId } = Route.useLoaderData();
  const { groupId } = Route.useRouteContext();
  return <ManageCoursePage groupId={groupId} courseId={courseId} />;
}
