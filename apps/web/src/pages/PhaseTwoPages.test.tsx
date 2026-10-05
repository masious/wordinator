import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { ProfilePage, SettingsPage } from "./PhaseTwoPages";

const groupId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

const session = {
  status: "signedIn",
  user: { id: userId, displayName: "Ada", mustChangePassword: false },
  groups: [{ id: groupId, name: "Study room", language: "nl", role: "creator", icon: "🇳🇱", iconUrl: null }],
  deletedGroups: [],
  requests: [],
};
const shell = {
  group: session.groups[0], invitationToken: "x".repeat(40), pendingMembers: [],
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
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/session") return jsonResponse(session);
      if (path === `/api/groups/${groupId}`) return jsonResponse(shell);
      if (path === "/api/settings" && init?.method === "PATCH") return jsonResponse({ ok: true });
      if (path === "/api/settings") return jsonResponse({ email: "ada@example.test", displayName: "Ada", bio: "Learning Dutch.", avatarUrl: null, quickReactions: ["👍", "❤️", "🌱"] });
      if (path === `/api/groups/${groupId}/members/${userId}`) return jsonResponse({ profile: { id: userId, displayName: "Ada", bio: "Learning Dutch.", avatarUrl: null, membership: "active" }, posts: { items: [], nextCursor: null } });
      throw new Error(`Unexpected request: ${path}`);
    }));
  });

  it("shows editable account settings and validates the save flow through the API", async () => {
    renderRoute("/settings", () => <SettingsPage groupId={groupId} />);
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByDisplayValue("ada@example.test")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "A new bio" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Saved.")).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method: "PATCH", body: expect.stringContaining("A new bio") })));
  });

  it("uses the shared confirmation dialog for recoverable group deletion", async () => {
    renderRoute("/settings", () => <SettingsPage groupId={groupId} />);
    await screen.findByRole("heading", { name: "Settings" });
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete group" });
    expect(dialog).toHaveTextContent("You can restore it later");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("renders a directly addressable private profile and empty post shell", async () => {
    renderRoute("/profile", () => <ProfilePage groupId={groupId} userId={userId} />);
    expect(await screen.findByRole("heading", { name: "Ada" })).toBeVisible();
    expect(screen.getByText("Learning Dutch.", { selector: "p" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "No posts to show yet" })).toBeVisible();
  });
});
