import { createFileRoute } from "@tanstack/react-router";
import { requireLibrary } from "../libraryRoute";
import { CourseLibraryPage } from "../pages/CoursePages";

export const Route = createFileRoute("/courses")({
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: CoursesRoute,
});

function CoursesRoute() {
  const { groupId } = Route.useRouteContext();
  return <CourseLibraryPage groupId={groupId} />;
}
