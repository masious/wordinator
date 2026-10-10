import { createFileRoute, redirect } from "@tanstack/react-router";
import { courseQueryOptions, courseRefQueryOptions } from "../api";
import { requireLibrary } from "../libraryRoute";
import { CoursePage } from "../pages/CoursePages";

export const Route = createFileRoute("/courses_/$courseSlug")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  loader: async ({ context, params }) => {
    const ref = await context.queryClient.ensureQueryData(courseRefQueryOptions(context.groupId, params.courseSlug)).catch(() => null);
    // A legacy ID link lands on the readable URL.
    if (ref && ref.courseSlug !== params.courseSlug) throw redirect({ to: "/courses/$courseSlug", params: { courseSlug: ref.courseSlug }, replace: true });
    // A missing or hidden course renders its unavailable state instead of failing the route.
    const courseId = ref?.courseId ?? params.courseSlug;
    await context.queryClient.prefetchQuery(courseQueryOptions(context.groupId, courseId));
    return { courseId };
  },
  component: CourseRoute,
});

function CourseRoute() {
  const { courseId } = Route.useLoaderData();
  const { groupId } = Route.useRouteContext();
  return <CoursePage groupId={groupId} courseId={courseId} />;
}
