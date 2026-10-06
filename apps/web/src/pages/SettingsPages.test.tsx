import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { AccountSettingsPage, GroupSettingsPage, MembershipSettingsPage } from "./SettingsPages";

const groupId = "20000000-0000-4000-8000-000000000001";
const creatorId = "10000000-0000-4000-8000-000000000001";
const ids = {
  active: "10000000-0000-4000-8000-000000000002",
  pending: "10000000-0000-4000-8000-000000000003",
  rejected: "10000000-0000-4000-8000-000000000004",
  left: "10000000-0000-4000-8000-000000000005",
};

let role: "creator" | "member" = "creator";
const session = () => ({
  status: "signedIn",
  user: { id: creatorId, displayName: "Ada", avatarUrl: null, mustChangePassword: false },
  groups: [{ id: groupId, name: "Study room", language: "nl", role, icon: "🇳🇱", iconUrl: null }],
  deletedGroups: [], requests: [],
});
const shell = () => ({ group: session().groups[0], invitationToken: "x".repeat(40), pendingRequestCount: role === "creator" ? 1 : 0 });
const row = (id: string, displayName: string, state: string, extra: Record<string, unknown> = {}) => ({ id, displayName, avatarUrl: null, state, isCreator: false, requestedAt: 1_700_000_000_000, decidedAt: 1_700_100_000_000, ...extra });
const memberships = {
  pending: [row(ids.pending, "Pia Pending", "pending", { decidedAt: null })],
  active: [row(creatorId, "Ada", "active", { isCreator: true }), row(ids.active, "Lin", "active")],
  rejected: [],
  former: [row(ids.left, "Mo snapshot", "left")],
};

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

function renderPage(component: () => React.ReactNode) {
  const root = createRootRoute();
  const account = createRoute({ getParentRoute: () => root, path: "/groups/$groupId/settings/account", component: () => <p>Account route</p> });
  const page = createRoute({ getParentRoute: () => root, path: "$", component });
  const router = createRouter({ routeTree: root.addChildren([account, page]), history: createMemoryHistory({ initialEntries: [`/groups/${groupId}/settings/page`] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  role = "creator";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return json(session());
    if (path === `/api/groups/${groupId}` && !init?.method) return json(shell());
    if (path === "/api/settings" && init?.method === "PATCH") return json({ ok: true });
    if (path === "/api/settings") return json({ email: "ada@example.test", displayName: "Ada", bio: "Learning Dutch.", avatarUrl: null, quickReactions: ["👍", "❤️", "🌱"] });
    if (path === `/api/groups/${groupId}/memberships`) return json(memberships);
    if (path.endsWith(`/memberships/${ids.active}/regenerate-password`)) return json({ password: "TemporaryPassword123!" });
    return json({ ok: true });
  }));
});

afterEach(() => { cleanup(); });

describe("Account settings", () => {
  it("saves account-wide fields and shows the creator's section navigation", async () => {
    renderPage(() => <AccountSettingsPage groupId={groupId} />);
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByText("Applies in every group")).toBeVisible();
    const sections = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(sections).getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
    expect(within(sections).getByRole("link", { name: "Members" })).toHaveAttribute("href", `/groups/${groupId}/settings/members`);
    expect(screen.getByDisplayValue("ada@example.test")).toBeDisabled();
    expect(screen.queryByLabelText("Group name")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "A new bio" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Saved.")).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method: "PATCH", body: expect.stringContaining("A new bio") })));
  });

  it("shows ordinary members no section navigation", async () => {
    role = "member";
    renderPage(() => <AccountSettingsPage groupId={groupId} />);
    await screen.findByRole("heading", { name: "Settings" });
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument();
  });
});

describe("Group settings", () => {
  it("shows the fixed language and confirms recoverable deletion", async () => {
    renderPage(() => <GroupSettingsPage groupId={groupId} />);
    expect(await screen.findByRole("textbox", { name: "Group name" })).toHaveValue("Study room");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Dutch")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete group" });
    expect(dialog).toHaveTextContent("You can restore it later");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("sends ordinary members back to account settings", async () => {
    role = "member";
    renderPage(() => <GroupSettingsPage groupId={groupId} />);
    expect(await screen.findByText("Account route")).toBeInTheDocument();
  });
});

describe("Member management", () => {
  it("lists each state with its empty state and accepts a pending request", async () => {
    renderPage(() => <MembershipSettingsPage groupId={groupId} />);
    expect(await screen.findByText("Pia Pending")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Rejected requests" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "No rejected requests" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Mo snapshot" })).toHaveAttribute("href", `/groups/${groupId}/members/${ids.left}`);
    expect(screen.queryByRole("link", { name: "Pia Pending" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove member" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/memberships/${ids.pending}`, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ decision: "accept" }) })));
  });

  it("reveals a regenerated password once and confirms before removal", async () => {
    renderPage(() => <MembershipSettingsPage groupId={groupId} />);
    await screen.findByText("Pia Pending");
    fireEvent.click(screen.getByRole("button", { name: "New temporary password" }));
    expect(await screen.findByText("TemporaryPassword123!")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove member" });
    expect(dialog).toHaveTextContent("Remove Lin from this group?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining(`/memberships/${ids.active}`), expect.objectContaining({ method: "DELETE" }));
  });

  it("sends ordinary members back without requesting membership data", async () => {
    role = "member";
    renderPage(() => <MembershipSettingsPage groupId={groupId} />);
    expect(await screen.findByText("Account route")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(`/api/groups/${groupId}/memberships`, expect.anything());
  });
});
