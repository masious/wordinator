import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { tutorConversationQueryOptions } from "../api";
import { requireLibrary } from "../libraryRoute";
import { TutorPage } from "../pages/TutorPage";

// The AI tutor (C14i, docs/ai-tutor.md#entry-point). The open conversation is a search parameter, so creating one on the first
// message keeps the page (and its streaming turn) mounted. The loader only warms the conversation read; a missing or foreign
// conversation shows the page's unavailable state.
function validateTutorSearch(search: Record<string, unknown>): { conversation?: string } {
  const value = search.conversation;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? { conversation: value } : {};
}

export const Route = createFileRoute("/ai")({
  validateSearch: validateTutorSearch,
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  loaderDeps: ({ search }) => ({ conversation: search.conversation }),
  loader: async ({ context, deps }) => {
    if (deps.conversation) await context.queryClient.ensureQueryData(tutorConversationQueryOptions(deps.conversation)).catch(() => undefined);
  },
  component: TutorRoute,
});

function TutorRoute() {
  const { groupId } = Route.useRouteContext();
  const { conversation } = Route.useSearch();
  const navigate = Route.useNavigate();
  const onOpen = useCallback((id: string | null) => { void navigate({ search: id ? { conversation: id } : {} }); }, [navigate]);
  return <TutorPage groupId={groupId} conversationId={conversation ?? null} onOpen={onOpen} />;
}
