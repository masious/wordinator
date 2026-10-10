import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n";
import { queryClient as routerQueryClient } from "./query";
import { router } from "./router";

describe("Phase 1 application entry", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "signedOut" }), {
      headers: { "content-type": "application/json" },
    })));
  });

  it("offers immediate account creation with sign-in as the alternate path", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
    expect(await screen.findByRole("heading", { name: "Start learning." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create account" })).toBeVisible();
    expect(screen.getByRole("button", { name: "I already have an account" })).toBeVisible();
  });

  it("requires a username while keeping the avatar optional", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "signedIn",
      user: { id: crypto.randomUUID(), displayName: "New learner", username: null, avatarUrl: null, mustChangePassword: false, onboardingComplete: false },
      groups: [{ id: crypto.randomUUID(), name: "Library", language: "nl", role: "member", icon: "🇳🇱", iconUrl: null }],
      requests: [],
      deletedGroups: [],
    }), { headers: { "content-type": "application/json" } })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
    expect(await screen.findByRole("heading", { name: "Set up your account." })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /username/i })).toBeRequired();
    expect(screen.getByRole("button", { name: "Choose a profile photo" })).toBeVisible();
    expect(screen.getByText(/photo optional/i)).toBeVisible();
  });

  it("renders a course URL as that course rather than the library", async () => {
    const groupId = crypto.randomUUID();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/api/session")) return new Response(JSON.stringify({
        status: "signedIn",
        user: { id: crypto.randomUUID(), displayName: "learner", username: "learner", avatarUrl: null, mustChangePassword: false, onboardingComplete: true },
        groups: [{ id: groupId, name: "Library", language: "nl", role: "member", icon: "🇳🇱", iconUrl: null }],
        requests: [],
        deletedGroups: [],
      }), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ error: { code: "COURSE_NOT_FOUND", message: "Missing." } }), { status: 404, headers: { "content-type": "application/json" } });
    }));
    routerQueryClient.clear();
    await router.navigate({ to: "/courses/$courseSlug", params: { courseSlug: "missing-course" } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);

    expect(await screen.findByText("This course is not available.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Courses", level: 1 })).not.toBeInTheDocument();
    routerQueryClient.clear();
  });
});
