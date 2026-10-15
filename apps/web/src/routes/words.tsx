import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import type { WordDrillSettings } from "../api";
import { requireLibrary } from "../libraryRoute";
import { validateWordsSearch, WordsPage, type WordsView } from "../pages/WordsPage";

export const Route = createFileRoute("/words")({
  validateSearch: validateWordsSearch,
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: WordsRoute,
});

function WordsRoute() {
  const { groupId } = Route.useRouteContext();
  const { lesson, view } = Route.useSearch();
  const navigate = Route.useNavigate();
  // The view adds a history entry; switching drops the lesson filter, which belongs to Bookmarks only.
  const onView = useCallback((next: WordsView) => { void navigate({ search: next === "weak" ? { view: "weak" } : {} }); }, [navigate]);
  // Choosing a lesson adds a history entry; falling back from a lesson that is not available replaces it.
  const onLesson = useCallback((next: string | null, replace = false) => {
    void navigate({ search: next ? { lesson: next } : {}, replace });
  }, [navigate]);
  const onDrill = useCallback((settings: WordDrillSettings) => { void navigate({ to: "/words/drill", search: settings }); }, [navigate]);
  return <WordsPage groupId={groupId} view={view ?? "bookmarks"} lessonId={lesson ?? null} onView={onView} onLesson={onLesson} onDrill={onDrill} />;
}
