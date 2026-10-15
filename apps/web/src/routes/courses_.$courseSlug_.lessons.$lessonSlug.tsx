import { createFileRoute, redirect } from "@tanstack/react-router";
import { courseQueryOptions, courseRefQueryOptions, lessonQueryOptions } from "../api";
import { requireLibrary } from "../libraryRoute";
import { LessonPage } from "../pages/CoursePages";

// `resume` opens the lesson at the viewer's saved step; the course page's Continue actions link with it.
export type LessonSearch = { resume?: true };

export const Route = createFileRoute("/courses_/$courseSlug_/lessons/$lessonSlug")({
  validateSearch: (search: Record<string, unknown>): LessonSearch => search.resume === true || search.resume === "true" || search.resume === 1 ? { resume: true } : {},
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  loader: async ({ context, params }) => {
    const { groupId } = context;
    const ref = await context.queryClient.ensureQueryData(courseRefQueryOptions(groupId, params.courseSlug, params.lessonSlug)).catch(() => null);
    // A legacy ID link lands on the readable URL.
    if (ref?.lessonSlug && (ref.courseSlug !== params.courseSlug || ref.lessonSlug !== params.lessonSlug)) {
      throw redirect({ to: "/courses/$courseSlug/lessons/$lessonSlug", params: { courseSlug: ref.courseSlug, lessonSlug: ref.lessonSlug }, replace: true });
    }
    // A missing or hidden course or lesson renders its unavailable state instead of failing the route; an unresolved
    // lesson still needs the course, which resolves on its own.
    const courseId = ref?.courseId ?? (await context.queryClient.ensureQueryData(courseRefQueryOptions(groupId, params.courseSlug)).catch(() => null))?.courseId ?? params.courseSlug;
    const lessonId = ref?.lessonId ?? params.lessonSlug;
    await Promise.all([
      context.queryClient.prefetchQuery(courseQueryOptions(groupId, courseId)),
      context.queryClient.prefetchQuery(lessonQueryOptions(groupId, courseId, lessonId)),
    ]);
    return { courseId, lessonId };
  },
  component: LessonRoute,
});

function LessonRoute() {
  const { courseId, lessonId } = Route.useLoaderData();
  const { groupId } = Route.useRouteContext();
  const { resume } = Route.useSearch();
  return <LessonPage groupId={groupId} courseId={courseId} lessonId={lessonId} resume={resume === true} />;
}
