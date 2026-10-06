import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { MembersPage } from "./PhaseFivePages";

const groupId = "20000000-0000-4000-8000-000000000001";
const creatorId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const session = { status: "signedIn", user: { id: creatorId, displayName: "Ada", avatarUrl: null, mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "nl", role: "creator", icon: "🇳🇱", iconUrl: null }], requests: [], deletedGroups: [] };
const shell = { group: session.groups[0], invitationToken: "x".repeat(40), pendingMembers: [] };
const directory = {
  active: [{ id: creatorId, displayName: "Ada", bio: null, avatarUrl: null, membership: "active", isCreator: true, joinedAt: 1 }, { id: memberId, displayName: "Lin", bio: "Learner", avatarUrl: null, membership: "active", isCreator: false, joinedAt: 2 }],
  former: [{ id: "10000000-0000-4000-8000-000000000003", displayName: "Mo", bio: null, avatarUrl: null, membership: "former", isCreator: false, joinedAt: 3 }],
  permissions: { manageMembers: true, leave: false },
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
    if (path.endsWith(`/memberships/${memberId}/regenerate-password`)) return response({ password: "TemporaryPassword123!" });
    return response({ ok: true });
  }));
});

describe("Phase 5 member directory", () => {
  it("shows active/former attribution and reveals a regenerated password once", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByText("Former member")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New temporary password" }));
    await waitFor(() => expect(screen.getByText("TemporaryPassword123!")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Leave group" })).not.toBeInTheDocument();
  });

  it("requires the shared confirmation dialog before removing a member", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Members" });
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove member" });
    expect(dialog).toHaveTextContent("Remove Lin from this group?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining(`/memberships/${memberId}`), expect.objectContaining({ method: "DELETE" }));
  });
});
