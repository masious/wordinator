import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { NotificationsPage } from "./PhaseSixPages";

const groupId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000002";
const session = { status: "signedIn", user: { id: userId, displayName: "Ada", avatarUrl: null, mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "nl", role: "member", icon: "🇳🇱", iconUrl: null }], requests: [], deletedGroups: [] };
const notices = { items: [
  { id: "60000000-0000-4000-8000-000000000001", groupId, groupName: "Study", actor: { id: actorId, displayName: "Lin" }, kind: "reply", postId: "30000000-0000-4000-8000-000000000001", commentId: "50000000-0000-4000-8000-000000000001", courseId: null, targetAvailable: true, createdAt: 1, readAt: null },
  { id: "60000000-0000-4000-8000-000000000002", groupId, groupName: "Study", actor: { id: actorId, displayName: "Lin" }, kind: "reaction", postId: "30000000-0000-4000-8000-000000000002", commentId: null, courseId: null, targetAvailable: false, createdAt: 2, readAt: 3 },
  { id: "60000000-0000-4000-8000-000000000003", groupId, groupName: "Study", actor: { id: actorId, displayName: "Lin" }, kind: "contributor_requested", postId: null, commentId: null, courseId: "70000000-0000-4000-8000-000000000001", targetAvailable: true, createdAt: 3, readAt: null },
] };

function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }
function renderPage() {
  const root = createRootRoute(); const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <NotificationsPage groupId={groupId} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/notifications"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return response(session);
    if (path === `/api/groups/${groupId}/notifications` && !init?.method) return response(notices);
    return response({ ok: true });
  }));
});

describe("Phase 6 notifications UI", () => {
  it("shows unread activity, a deleted destination, and marks all group notices read", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Lin replied to you.")).toBeVisible();
    expect(screen.getByText("Content no longer available.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Lin asked to contribute to your course/ })).toHaveAttribute("href", `/courses/70000000-0000-4000-8000-000000000001`);
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/notifications/read-all`, expect.objectContaining({ method: "POST" })));
  });
});
