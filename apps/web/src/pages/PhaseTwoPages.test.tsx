import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { ProfilePage } from "./PhaseTwoPages";

const groupId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

const session = {
  status: "signedIn",
  user: { id: userId, displayName: "Ada", avatarUrl: null, mustChangePassword: false },
  groups: [{ id: groupId, name: "Study room", language: "nl", role: "creator", icon: "🇳🇱", iconUrl: null }],
  deletedGroups: [],
  requests: [],
};
const shell = {
  group: session.groups[0], invitationToken: "x".repeat(40), pendingRequestCount: 0,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function renderRoute(path: string, component: () => React.ReactNode) {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [path] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

describe("Phase 2 pages", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/session") return jsonResponse(session);
      if (path === `/api/groups/${groupId}`) return jsonResponse(shell);
      if (path === `/api/groups/${groupId}/members/${userId}`) return jsonResponse({ profile: { id: userId, displayName: "Ada", bio: "Learning Dutch.", avatarUrl: null, membership: "active" }, posts: { items: [], nextCursor: null } });
      throw new Error(`Unexpected request: ${path}`);
    }));
  });

  it("renders a directly addressable private profile and empty post shell", async () => {
    renderRoute("/profile", () => <ProfilePage groupId={groupId} userId={userId} />);
    expect(await screen.findByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.getByText("Learning Dutch.", { selector: "p" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "No posts to show yet" })).toBeVisible();
  });
});
