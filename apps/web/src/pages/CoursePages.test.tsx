import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { CourseLibraryPage, CoursePage } from "./CoursePages";

const groupId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const session = { status: "signedIn", user: { id: ownerId, displayName: "Ada", avatarUrl: null, mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "de", role: "member", icon: "🇩🇪", iconUrl: null }], requests: [], deletedGroups: [] };
const course = (overrides: Record<string, unknown> = {}) => ({
  id: courseId, groupId, title: "Deutsch für Anfänger", summary: "Erste Schritte\nmit Freunden", level: "A1 → early A2", intendedLearner: null, coverUrl: null,
  status: "draft", owner: { id: ownerId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1,
  permissions: { edit: true, publish: true, archive: true }, ...overrides,
});
let current = course();

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function renderPage(page: "library" | "course") {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => page === "library" ? <CourseLibraryPage groupId={groupId} /> : <CoursePage groupId={groupId} courseId={courseId} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/groups/${groupId}/courses`] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  current = course();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return response(session);
    if (path === `/api/groups/${groupId}/courses` && init?.method === "POST") return response({ course: { ...current, ...JSON.parse(String(init.body)) } }, 201);
    if (path.startsWith(`/api/groups/${groupId}/courses?`) || path === `/api/groups/${groupId}/courses`) return response({ items: [current], nextCursor: null });
    if (path.endsWith("/visibility")) { current = course({ status: JSON.parse(String(init?.body)).status }); return response({ course: current }); }
    if (path.endsWith("/archive")) { current = course({ status: "archived", permissions: { edit: false, publish: false, archive: true } }); return response({ course: current }); }
    if (path === `/api/groups/${groupId}/courses/${courseId}`) return response({ course: current });
    return response({ ok: true });
  }));
});

afterEach(cleanup);

describe("Course shell pages", () => {
  it("lists visible courses with draft labels and validates the create form", async () => {
    renderPage("library");
    expect(await screen.findByRole("heading", { name: "Courses", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Deutsch für Anfänger/ })).toHaveAttribute("href", `/groups/${groupId}/courses/${courseId}`);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "New course" })[0]!);
    const submit = await screen.findByRole("button", { name: "Create draft" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Niederländisch" } });
    fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: "Kurz" } });
    fireEvent.click(submit);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses`, expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Niederländisch", summary: "Kurz", level: null, intendedLearner: null }) })));
  });

  it("lets the owner publish and requires confirmation before archiving", async () => {
    renderPage("course");
    expect(await screen.findByRole("heading", { name: "Deutsch für Anfänger", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Erste Schritte/)).toHaveTextContent("Erste Schritte mit Freunden");
    fireEvent.click(screen.getByRole("button", { name: "Publish course" }));
    expect(await screen.findByRole("button", { name: "Return to draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive course" }));
    const dialog = await screen.findByRole("dialog", { name: "Archive this course?" });
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/archive"), expect.anything());
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive course" }));
    expect(await screen.findByText("This course is archived")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore as draft" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
  });

  it("hides management controls from readers", async () => {
    current = course({ status: "published", owner: { id: "10000000-0000-4000-8000-000000000009", displayName: "Lin", avatarUrl: null }, permissions: { edit: false, publish: false, archive: false } });
    renderPage("course");
    expect(await screen.findByText("By Lin")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Manage course" })).not.toBeInTheDocument();
  });
});
