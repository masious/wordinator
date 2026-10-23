import { createFileRoute, notFound } from "@tanstack/react-router";
import { loadDraftDocument } from "../organisms/LessonOverview/draftLessons";
import { TempHovercard } from "../pages/TempHovercard/TempHovercard";

// Temporary, development only: new-word hovercards on an authored lesson file, e.g. /temp-hovercard/02-a-waar-kom-je-vandaan.
// Delete with its page once the hovercard reaches the lesson page.
export const Route = createFileRoute("/temp-hovercard/$lessonSlug")({
  beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); },
  loader: async ({ params }) => {
    const lesson = await loadDraftDocument(params.lessonSlug);
    if (!lesson) throw notFound();
    return lesson;
  },
  component: TempHovercardRoute,
});

function TempHovercardRoute() {
  const lesson = Route.useLoaderData();
  return <TempHovercard title={lesson.title} document={lesson.document} />;
}
