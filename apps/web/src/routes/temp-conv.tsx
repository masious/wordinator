import { createFileRoute, notFound } from "@tanstack/react-router";
import { loadDraftDocument } from "../organisms/LessonOverview/draftLessons";
import { TEMP_CONV_LESSON, TempConv } from "../pages/TempConv/TempConv";

// Temporary prototype, open in production too: a lesson's first dialogue staged over its location image. Delete with its page
// once the conversation component replaces the dialogue block or is dropped.
export const Route = createFileRoute("/temp-conv")({
  loader: async () => {
    const lesson = await loadDraftDocument(TEMP_CONV_LESSON);
    if (!lesson) throw notFound();
    return lesson;
  },
  component: TempConvRoute,
});

function TempConvRoute() {
  const lesson = Route.useLoaderData();
  return <TempConv title={lesson.title} document={lesson.document} />;
}
