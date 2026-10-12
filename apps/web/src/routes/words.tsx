import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import type { WordDrillSettings } from "../api";
import { requireLibrary } from "../libraryRoute";
import { validateWordsSearch, WordsPage } from "../pages/WordsPage";

export const Route = createFileRoute("/words")({
  validateSearch: validateWordsSearch,
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: WordsRoute,
});

function WordsRoute() {
  const { groupId } = Route.useRouteContext();
  const { lesson } = Route.useSearch();
  const navigate = Route.useNavigate();
  // Choosing a lesson adds a history entry; falling back from a lesson that is not available replaces it.
  const onLesson = useCallback((next: string | null, replace = false) => {
    void navigate({ search: next ? { lesson: next } : {}, replace });
  }, [navigate]);
  const onDrill = useCallback((settings: WordDrillSettings) => { void navigate({ to: "/words/drill", search: settings }); }, [navigate]);
  return <WordsPage groupId={groupId} lessonId={lesson ?? null} onLesson={onLesson} onDrill={onDrill} />;
}
