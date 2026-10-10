import { createTheme, MantineProvider } from "@mantine/core";
import type { Post } from "@wordinator/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import PostCard from "./PostCard";

const groupId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

// jsdom has no layout, so Mantine would treat the dropdown as detached from its trigger and hide it.
const theme = createTheme({ components: { Menu: { defaultProps: { hideDetached: false, transitionProps: { duration: 0 } } } } });

const post: Post = {
  id: "30000000-0000-4000-8000-000000000001", groupId, type: "shared_sentence", body: "Goedemorgen", notes: null,
  author: { id: userId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, edited: false,
  questions: [], expectedAnswers: [], course: null, commentCount: 2, reactionCount: 3, reactions: [], permissions: { edit: true, delete: true },
};

function renderCard(permissions: Post["permissions"]) {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <PostCard post={{ ...post, permissions }} groupId={groupId} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MantineProvider theme={theme}><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

async function openMenu() {
  fireEvent.click(await screen.findByRole("button", { name: "More Actions" }));
  return screen.findByRole("menu");
}

describe("PostCard actions menu", () => {
  beforeEach(() => {
    // Session and settings are not needed to render the menu; leave them unresolved.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("offers edit and delete when the viewer may change the post", async () => {
    renderCard({ edit: true, delete: true });
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("hides edit and delete without permission but keeps the post statistics", async () => {
    renderCard({ edit: false, delete: false });
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /2 responses/ })).toBeInTheDocument();
  });

  it("shows only the actions the viewer is allowed to take", async () => {
    renderCard({ edit: false, delete: true });
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not show a seen count", async () => {
    renderCard({ edit: true, delete: true });
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: /Seen/ })).not.toBeInTheDocument();
  });

  it("opens the delete confirmation from the menu", async () => {
    renderCard({ edit: true, delete: true });
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("dialog", { name: "Delete this post?" })).toBeInTheDocument();
  });
});

describe("PostCard feed card", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {}))); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("makes the byline and body one link to the post, with the menu outside it and no footer on wide screens", async () => {
    renderCard({ edit: true, delete: true });
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", `/journal/${post.id}`);
    expect(link).toHaveTextContent(/Ada shared a sentence .+\.Goedemorgen$/);
    expect(link).not.toContainElement(screen.getByRole("button", { name: "More Actions" }));
    expect(screen.queryByText("2 responses")).not.toBeInTheDocument();
  });

  it("moves the response count to a footer outside the link below 48em", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === "(max-width: 48em)", media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    try {
      renderCard({ edit: true, delete: true });
      const responses = await screen.findByText("2 responses");
      expect(responses.closest("footer")).not.toBeNull();
      expect(screen.getByRole("link")).not.toContainElement(responses);
    } finally {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null,
        addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
      }));
    }
  });

  it("names the post type in the byline sentence", async () => {
    const root = createRootRoute();
    const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <PostCard post={{ ...post, type: "question", body: "Waarom?", edited: true }} groupId={groupId} /> });
    const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
    render(<MantineProvider theme={theme}><QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
    expect(await screen.findByText(/asked a question/)).toHaveTextContent(/Ada asked a question .+\.Edited$/);
  });

  it("does not nest authored URLs inside the card link", async () => {
    const root = createRootRoute();
    const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <PostCard post={{ ...post, body: "Zie https://example.com" }} groupId={groupId} /> });
    const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
    render(<MantineProvider theme={theme}><QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
    expect(await screen.findByText(/https:\/\/example.com/)).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("PostCard course posts", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {}))); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const course = { id: "60000000-0000-4000-8000-000000000001", available: true, title: "Deutsch für Anfänger", summary: "Erste Schritte", level: "A1", coverUrl: null };

  function renderCourse(value: Post["course"], compact = false) {
    const root = createRootRoute();
    const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <PostCard post={{ ...post, type: "course", body: "", course: value, permissions: { edit: false, delete: false } }} groupId={groupId} compact={compact} /> });
    const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
    return render(<MantineProvider theme={theme}><QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
  }

  it("links the feed card to the post rather than nesting a course link", async () => {
    renderCourse(course, true);
    const link = await screen.findByRole("link", { name: /Deutsch für Anfänger/ });
    expect(link).toHaveAttribute("href", `/journal/${post.id}`);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("links to the course with its title, level, and summary on the post page", async () => {
    renderCourse(course);
    const link = await screen.findByRole("link", { name: /Deutsch für Anfänger/ });
    expect(link).toHaveAttribute("href", `/courses/${course.id}`);
    expect(screen.getByText("Published a new course")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("Erste Schritte")).toBeInTheDocument();
  });

  it("shows an unavailable course without a link", async () => {
    renderCourse({ ...course, available: false, title: null, summary: null, level: null });
    expect(await screen.findByText("This course is no longer available.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open course/ })).not.toBeInTheDocument();
  });
});
