import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { requireLibrary } from "../libraryRoute";
import { validateWordDrillSearch, WordDrillPage } from "../pages/WordDrillPage";

// A drill session (C12e). The deck is not loaded here: each session fetches its own once, so Drill again can draw a fresh one.
export const Route = createFileRoute("/words_/drill")({
  validateSearch: validateWordDrillSearch,
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: WordDrillRoute,
});

function WordDrillRoute() {
  const { groupId } = Route.useRouteContext();
  const settings = Route.useSearch();
  const navigate = Route.useNavigate();
  const onBack = useCallback(() => { void navigate({ to: "/words" }); }, [navigate]);
  const onPractice = useCallback((conversation: string) => { void navigate({ to: "/ai", search: { conversation } }); }, [navigate]);
  return <WordDrillPage groupId={groupId} settings={settings} onBack={onBack} onPractice={onPractice} />;
}
