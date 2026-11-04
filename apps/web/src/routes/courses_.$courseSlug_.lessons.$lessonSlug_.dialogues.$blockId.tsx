import { createFileRoute, redirect } from "@tanstack/react-router";
import { courseRefQueryOptions, lessonQueryOptions } from "../api";
import { requireLibrary } from "../libraryRoute";
import { DialogueScenePage } from "../pages/DialogueScene/DialogueScene";

export const Route = createFileRoute("/courses_/$courseSlug_/lessons/$lessonSlug_/dialogues/$blockId")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  loader: async ({ context, params }) => {
    const { groupId } = context;
    const ref = await context.queryClient.ensureQueryData(courseRefQueryOptions(groupId, params.courseSlug, params.lessonSlug)).catch(() => null);
    if (ref?.lessonSlug && (ref.courseSlug !== params.courseSlug || ref.lessonSlug !== params.lessonSlug)) {
      throw redirect({ to: "/courses/$courseSlug/lessons/$lessonSlug/dialogues/$blockId", params: { courseSlug: ref.courseSlug, lessonSlug: ref.lessonSlug, blockId: params.blockId }, replace: true });
    }
    const courseId = ref?.courseId ?? (await context.queryClient.ensureQueryData(courseRefQueryOptions(groupId, params.courseSlug)).catch(() => null))?.courseId ?? params.courseSlug;
    const lessonId = ref?.lessonId ?? params.lessonSlug;
    await context.queryClient.prefetchQuery(lessonQueryOptions(groupId, courseId, lessonId));
    return { courseId, lessonId };
  },
  component: SceneRoute,
});

function SceneRoute() {
  const { courseId, lessonId } = Route.useLoaderData();
  const { groupId } = Route.useRouteContext();
  const { courseSlug, lessonSlug, blockId } = Route.useParams();
  return <DialogueScenePage groupId={groupId} courseId={courseId} lessonId={lessonId} courseSlug={courseSlug} lessonSlug={lessonSlug} blockId={blockId} />;
}
