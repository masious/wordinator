import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { AccountSettingsPage } from "./SettingsPages";

const groupId = "20000000-0000-4000-8000-000000000001";
const creatorId = "10000000-0000-4000-8000-000000000001";

let superuser = false;
const session = () => ({
  status: "signedIn",
  user: { id: creatorId, displayName: "Ada", avatarUrl: null, mustChangePassword: false, isSuperuser: superuser },
  groups: [], deletedGroups: [], requests: [],
});

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

function renderPage() {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "$", component: () => <AccountSettingsPage groupId={groupId} /> });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: ["/settings"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  superuser = false;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return json(session());
    if (path === "/api/settings" && init?.method === "PATCH") return json({ ok: true });
    if (path === "/api/settings") return json({ email: "ada@example.test", displayName: "Ada", bio: "Learning Dutch.", avatarUrl: null, quickReactions: ["👍", "❤️", "🌱"] });
    return json({ ok: true });
  }));
});

afterEach(() => { cleanup(); });

describe("Account settings", () => {
  it("saves account-wide fields with no group navigation", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByText("Your account")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument();
    // Identity sits in the card header: the email is read-only text, and the avatar is edited from its corner button.
    expect(screen.getByText("ada@example.test")).toBeVisible();
    expect(screen.queryByDisplayValue("ada@example.test")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a profile photo" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: "A new bio" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Saved.")).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method: "PATCH", body: expect.stringContaining("A new bio") })));
  });

  it("links to analytics only for the superuser", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Settings" });
    expect(screen.queryByRole("link", { name: "Open analytics" })).not.toBeInTheDocument();
    cleanup();
    superuser = true;
    renderPage();
    expect(await screen.findByRole("link", { name: "Open analytics" })).toHaveAttribute("href", "/admin/analytics");
  });

  it("links to notices", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Open notices" })).toHaveAttribute("href", "/notifications");
  });
});
