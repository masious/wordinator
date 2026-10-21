import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lessonActivityTypeSchema } from "@wordinator/contracts/lesson-activities";
import { useTranslation } from "react-i18next";
import { lessonQueryOptions, courseQueryOptions, courseRefQueryOptions, sessionQueryOptions } from "../api";
import { requireLibrary } from "../libraryRoute";
import { LessonActivityPage } from "../organisms/LessonActivities/LessonActivityPage";
import { LoadingState } from "../ui";

export const Route = createFileRoute("/courses_/$courseSlug_/lessons/$lessonSlug_/activities/$sourceId/$activityType")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  loader: async ({ context, params }) => {
    const { groupId } = context;
    const ref = await context.queryClient.ensureQueryData(courseRefQueryOptions(groupId, params.courseSlug, params.lessonSlug)).catch(() => null);
    if (ref?.lessonSlug && (ref.courseSlug !== params.courseSlug || ref.lessonSlug !== params.lessonSlug)) {
      throw redirect({ to: "/courses/$courseSlug/lessons/$lessonSlug/activities/$sourceId/$activityType", params: { courseSlug: ref.courseSlug, lessonSlug: ref.lessonSlug, sourceId: params.sourceId, activityType: params.activityType }, replace: true });
    }
    const courseId = ref?.courseId ?? params.courseSlug; const lessonId = ref?.lessonId ?? params.lessonSlug;
    await Promise.all([context.queryClient.prefetchQuery(courseQueryOptions(groupId, courseId)), context.queryClient.prefetchQuery(lessonQueryOptions(groupId, courseId, lessonId))]);
    return { courseId, lessonId };
  },
  component: LessonActivityRoute,
});

function LessonActivityRoute() {
  const { t } = useTranslation();
  const { courseId, lessonId } = Route.useLoaderData(); const { groupId } = Route.useRouteContext(); const { courseSlug, lessonSlug, sourceId, activityType } = Route.useParams();
  // An unknown type is not a fallback activity: the page renders its unavailable state with the return link.
  const type = lessonActivityTypeSchema.safeParse(activityType);
  const session = useQuery(sessionQueryOptions()); const course = useQuery(courseQueryOptions(groupId, courseId)); const lesson = useQuery(lessonQueryOptions(groupId, courseId, lessonId));
  if (session.isPending || course.isPending || lesson.isPending) return <LoadingState label={t("lessonActivities.opening")} />;
  const language = session.data?.status === "signedIn" ? session.data.groups.find((group) => group.id === groupId)?.language : undefined;
  if (session.data?.status !== "signedIn" || course.isError || lesson.isError) return null;
  // Keyed by source and type, so a different activity never inherits the open page's run or drafts.
  return <LessonActivityPage key={`${sourceId}/${activityType}`} groupId={groupId} courseId={courseId} courseSlug={courseSlug} lessonId={lessonId} lessonSlug={lessonSlug}
    lessonTitle={lesson.data.lesson.title} language={language} accountId={session.data.user.id} type={type.success ? type.data : null} sourceId={sourceId} archived={course.data.course.status === "archived"} />;
}
