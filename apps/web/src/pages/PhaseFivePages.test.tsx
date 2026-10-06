import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { MembersPage } from "./PhaseFivePages";

const groupId = "20000000-0000-4000-8000-000000000001";
const creatorId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const session = { status: "signedIn", user: { id: creatorId, displayName: "Ada", avatarUrl: null, mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "nl", role: "creator", icon: "🇳🇱", iconUrl: null }], requests: [], deletedGroups: [] };
const shell = { group: session.groups[0], invitationToken: "x".repeat(40), pendingRequestCount: 0 };
const directory = {
  active: [{ id: creatorId, displayName: "Ada", bio: null, avatarUrl: null, membership: "active", isCreator: true, joinedAt: 1 }, { id: memberId, displayName: "Lin", bio: "Learner", avatarUrl: null, membership: "active", isCreator: false, joinedAt: 2 }],
  former: [{ id: "10000000-0000-4000-8000-000000000003", displayName: "Mo", bio: null, avatarUrl: null, membership: "former", isCreator: false, joinedAt: 3 }],
  permissions: { leave: false },
};

function response(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }
function renderPage() {
  const root = createRootRoute(); const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <MembersPage groupId={groupId} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/groups/${groupId}/members`] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === "/api/session") return response(session);
    if (path === `/api/groups/${groupId}`) return response(shell);
    if (path === `/api/groups/${groupId}/members`) return response(directory);
    return response({ ok: true });
  }));
});

describe("Phase 5 member directory", () => {
  it("shows active/former attribution as a social view and links the creator to member management", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByText("Former member")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage members" })).toHaveAttribute("href", `/groups/${groupId}/settings/members`);
    expect(screen.queryByRole("button", { name: "New temporary password" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave group" })).not.toBeInTheDocument();
  });
});
