import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { requireLibrary } from "../libraryRoute";
import { AdminImagesPage, validateImagesSearch, type AdminImagesSearch } from "../pages/AdminImagesPage";

// Superuser image library (docs/settings-and-administration.md#image-library). The page shows a not-available state to other
// accounts and makes no request for them; the API refuses them anyway.
export const Route = createFileRoute("/admin/images")({
  validateSearch: validateImagesSearch,
  beforeLoad: ({ context }) => requireLibrary(context.queryClient),
  component: AdminImagesRoute,
});

function AdminImagesRoute() {
  const { groupId } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const onSearch = useCallback((next: AdminImagesSearch) => { void navigate({ search: next, replace: true }); }, [navigate]);
  return <AdminImagesPage groupId={groupId} search={search} onSearch={onSearch} />;
}
