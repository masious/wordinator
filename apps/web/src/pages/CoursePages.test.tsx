import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { CourseLibraryPage, CoursePage, ManageCoursePage } from "./CoursePages";

const groupId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const session = { status: "signedIn", user: { id: ownerId, displayName: "Ada", avatarUrl: null, mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "de", role: "member", icon: "🇩🇪", iconUrl: null }], requests: [], deletedGroups: [] };
const helper = { id: "10000000-0000-4000-8000-000000000002", displayName: "Bo", avatarUrl: null };
const ownerPermissions = { edit: true, publish: true, archive: true, removeContent: true, contribute: true, requestContribution: false, leaveContribution: false, manageContributors: true };
const readerPermissions = { edit: false, publish: false, archive: false, removeContent: false, contribute: false, requestContribution: true, leaveContribution: false, manageContributors: false };
const course = (overrides: Record<string, unknown> = {}) => ({
  id: courseId, slug: "deutsch-fur-anfanger", groupId, title: "Deutsch für Anfänger", summary: "Erste Schritte\nmit Freunden", level: "A1 → early A2", intendedLearner: null, coverUrl: null,
  status: "draft", owner: { id: ownerId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, speechCast: {}, contribution: null,
  permissions: ownerPermissions, ...overrides,
});
let current = course();
let contributors = { active: [] as unknown[], pending: [] as unknown[] };
const sample = (voice: string) => `https://media.test/speech/${voice}.mp3`;
let speechCast: () => Response;
const dashboard = () => ({
  resume: { course: { id: courseId, slug: "deutsch-fur-anfanger", title: "Deutsch für Anfänger", summary: "Erste Schritte", level: "A1", coverUrl: null, lessonCount: 4, coursePercent: 25 }, lesson: { id: lessonId, slug: "hallo", title: "Hallo", number: 1, total: 4, imageUrl: null, storylinePercent: 50 } },
  recentLessons: [{ course: { id: courseId, slug: "deutsch-fur-anfanger", title: "Deutsch für Anfänger", coursePercent: 25 }, lesson: { id: lessonId, slug: "hallo", title: "Hallo", number: 1, total: 4, imageUrl: null, storylinePercent: 50 }, activityAt: Date.now() - 86_400_000, metrics: { wordRecency: { lastReviewedAt: null, recent: 0, total: 3 }, memory: { strong: 1, fading: 1, new: 1, total: 3 }, pronunciation: { attempts: 0, fluency: null } } }],
  notStarted: [{ id: "30000000-0000-4000-8000-000000000002", slug: "next-course", title: "Next course", level: "A2", coverUrl: null, lessonCount: 3 }],
});

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function renderPage(page: "library" | "course" | "manage", at = "/courses") {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => page === "library" ? <CourseLibraryPage groupId={groupId} />
    : page === "course" ? <CoursePage groupId={groupId} courseId={courseId} /> : <ManageCoursePage groupId={groupId} courseId={courseId} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [at] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  current = course(); contributors = { active: [], pending: [] };
  speechCast = () => response({ speakers: ["Anna", "Ben"], voices: [
    { voice: "de-DE-KatjaNeural", sample: sample("katja") }, { voice: "de-DE-AmalaNeural", sample: null },
    { voice: "de-DE-ConradNeural", sample: sample("conrad") }, { voice: "de-DE-KillianNeural", sample: sample("killian") },
  ] });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/session") return response(session);
    if (path === `/api/groups/${groupId}/course-dashboard`) return response(dashboard());
    if (path === `/api/groups/${groupId}/courses` && init?.method === "POST") return response({ course: { ...current, ...JSON.parse(String(init.body)) } }, 201);
    if (path.startsWith(`/api/groups/${groupId}/courses?`) || path === `/api/groups/${groupId}/courses`) return response({ items: [current], nextCursor: null });
    if (path.endsWith("/visibility")) { current = course({ status: JSON.parse(String(init?.body)).status }); return response({ course: current }); }
    if (path.endsWith("/archive")) { current = course({ status: "archived", permissions: { ...readerPermissions, archive: true, requestContribution: false } }); return response({ course: current }); }
    if (path.endsWith("/contributors") && init?.method === "POST") {
      current = course({ ...current, contribution: "pending", permissions: { ...readerPermissions, requestContribution: false, leaveContribution: true } });
      return response({ course: current }, 201);
    }
    if (path.endsWith("/contributors")) return response(contributors);
    if (path.endsWith("/speech-cast")) return speechCast();
    if (path === `/api/groups/${groupId}/courses/${courseId}` && init?.method === "PATCH") { current = course({ ...JSON.parse(String(init.body)) }); return response({ course: current }); }
    if (path === `/api/groups/${groupId}/courses/${courseId}`) return response({ course: current, outline: [], lessons: [] });
    return response({ ok: true });
  }));
});

afterEach(() => { cleanup(); window.localStorage.clear(); });

// Every Select keeps its options mounted; the open one is found through the listbox its combobox controls.
async function choose(combobox: HTMLElement, option: string) {
  fireEvent.click(combobox);
  await waitFor(() => expect(combobox).toHaveAttribute("aria-expanded", "true"));
  fireEvent.click(within(document.getElementById(combobox.getAttribute("aria-controls")!)!).getByRole("option", { name: option, hidden: true }));
}

describe("Course shell pages", () => {
  it("lists every course under Courses in the rail, collapsible and remembered per account", async () => {
    renderPage("library");
    const rail = await screen.findByRole("navigation", { name: "Main navigation" });
    expect(within(rail).getAllByRole("link").map((link) => link.textContent)).toEqual(expect.arrayContaining(["Words", "Journal", "Tutor"]));
    expect(within(rail).queryByRole("link", { name: "Notices" })).not.toBeInTheDocument();
    const courses = await within(rail).findByRole("list", { name: "Your courses" });
    expect(within(courses).getByRole("link", { name: "Deutsch für Anfänger" })).toHaveAttribute("href", "/courses/deutsch-fur-anfanger");
    fireEvent.click(within(rail).getByRole("button", { name: "Hide courses" }));
    expect(within(rail).queryByRole("list", { name: "Your courses" })).toBeNull();
    expect(within(rail).getByRole("button", { name: "Show courses" })).toHaveAttribute("aria-expanded", "false");
    cleanup();
    renderPage("library");
    expect(await within(await screen.findByRole("navigation", { name: "Main navigation" })).findByRole("button", { name: "Show courses" })).toBeInTheDocument();
  });

  it("starts the course list collapsed outside course pages, without remembering an expansion there", async () => {
    renderPage("library", "/journal");
    const rail = await screen.findByRole("navigation", { name: "Main navigation" });
    const show = await within(rail).findByRole("button", { name: "Show courses" });
    expect(within(rail).queryByRole("list", { name: "Your courses" })).toBeNull();
    fireEvent.click(show);
    expect(await within(rail).findByRole("list", { name: "Your courses" })).toBeInTheDocument();
    cleanup();
    renderPage("library", "/journal");
    expect(await within(await screen.findByRole("navigation", { name: "Main navigation" })).findByRole("button", { name: "Show courses" })).toBeInTheDocument();
    // Course pages keep the remembered choice, expanded by default.
    cleanup();
    renderPage("library");
    expect(await within(await screen.findByRole("navigation", { name: "Main navigation" })).findByRole("button", { name: "Hide courses" })).toBeInTheDocument();
  });

  it("resizes the rail from its edge by keyboard, remembers the width per account, and restores the default", async () => {
    renderPage("library");
    const handle = await screen.findByRole("separator", { name: "Resize navigation" });
    const shell = handle.closest("aside")!.parentElement!;
    expect(shell.style.getPropertyValue("--size-app-rail")).toBe("");
    fireEvent.keyDown(handle, { key: "End" });
    expect(shell.style.getPropertyValue("--size-app-rail")).toBe("400px");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(shell.style.getPropertyValue("--size-app-rail")).toBe("384px");
    expect(handle).toHaveAttribute("aria-valuenow", "384");
    cleanup();
    renderPage("library");
    const restored = await screen.findByRole("separator", { name: "Resize navigation" });
    expect(restored.closest("aside")!.parentElement!.style.getPropertyValue("--size-app-rail")).toBe("384px");
    fireEvent.keyDown(restored, { key: "Escape" });
    expect(restored.closest("aside")!.parentElement!.style.getPropertyValue("--size-app-rail")).toBe("");
  });


  it("renders the learning dashboard, remembers its view, expands metrics, and validates the create form", async () => {
    renderPage("library");
    expect(await screen.findByRole("heading", { name: "Course library", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Deutsch für Anfänger", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/courses/deutsch-fur-anfanger/lessons/hallo?resume=true");
    fireEvent.click(screen.getByRole("button", { name: "Show learning metrics" }));
    expect(screen.getByText("Strong 1 · Fading 1 · New 1")).toBeInTheDocument();
    await choose(screen.getByRole("combobox", { name: "Dashboard view" }), "Not started");
    expect(await screen.findByRole("heading", { name: "Next course" })).toBeInTheDocument();
    expect(localStorage.getItem(`wordinator:course-dashboard-view:${ownerId}`)).toBe("not-started");
    fireEvent.click(screen.getAllByRole("button", { name: "New course" })[0]!);
    const submit = await screen.findByRole("button", { name: "Create draft" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Niederländisch" } });
    fireEvent.change(screen.getByLabelText(/Summary/), { target: { value: "Kurz" } });
    fireEvent.click(submit);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses`, expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Niederländisch", summary: "Kurz", level: null, intendedLearner: null }) })));
  });

  it("keeps management off the owner's course page behind a Manage course button", async () => {
    renderPage("course");
    expect(await screen.findByRole("heading", { name: "Deutsch für Anfänger", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Erste Schritte/)).toHaveTextContent("Erste Schritte mit Freunden");
    expect(screen.getByRole("button", { name: "Manage course" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish course" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Contributors" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Progress" })).not.toBeInTheDocument();
  });

  it("lets the owner publish and requires confirmation before archiving", async () => {
    renderPage("manage");
    expect(await screen.findByRole("heading", { name: "Manage course", level: 1 })).toBeInTheDocument();
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
    current = course({ status: "published", owner: { id: "10000000-0000-4000-8000-000000000009", displayName: "Lin", avatarUrl: null }, permissions: readerPermissions });
    renderPage("course");
    expect(await screen.findByText("By Lin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage course" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Requests" })).not.toBeInTheDocument();
  });

  it("shows readers no management tools on the manage page", async () => {
    current = course({ status: "published", owner: { id: "10000000-0000-4000-8000-000000000009", displayName: "Lin", avatarUrl: null }, permissions: readerPermissions });
    renderPage("manage");
    expect(await screen.findByText("Only the course owner and its contributors can manage this course.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Requests" })).not.toBeInTheDocument();
  });

  it("lets a reader ask to contribute and then withdraw the pending request", async () => {
    current = course({ status: "published", owner: { id: "10000000-0000-4000-8000-000000000009", displayName: "Lin", avatarUrl: null }, permissions: readerPermissions });
    renderPage("course");
    fireEvent.click(await screen.findByRole("button", { name: "Ask to contribute" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/contributors`, expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Your request is waiting for the course owner.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/contributors/leave`, expect.objectContaining({ method: "POST" })));
  });

  it("shows the owner pending contributor requests to accept and current contributors to remove", async () => {
    contributors = { active: [{ user: helper, state: "active", requestedAt: 1, decidedAt: 2 }], pending: [{ user: { ...helper, id: "10000000-0000-4000-8000-000000000003", displayName: "Cy" }, state: "pending", requestedAt: 3, decidedAt: null }] };
    renderPage("manage");
    fireEvent.click(await screen.findByRole("button", { name: "Accept Cy as a contributor" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/contributors/10000000-0000-4000-8000-000000000003`, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ decision: "accept" }) })));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo as a contributor" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove this contributor?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}/contributors/${helper.id}`, expect.objectContaining({ method: "DELETE" })));
  });

  it("lets the owner give speakers voices in the course details, with a sample for each ready voice", async () => {
    current = course({ speechCast: { anna: "de-DE-ConradNeural" } });
    renderPage("manage");
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit course" });
    const voices = await within(dialog).findByRole("list", { name: "Voices" });
    expect(within(voices).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Katja (narrator)", "Amala", "Conrad", "Killian"]);
    // A voice whose sample is not ready yet has no sample button.
    expect(within(voices).getByRole("button", { name: "Play a sample of Katja" })).toBeInTheDocument();
    expect(within(voices).queryByRole("button", { name: "Play a sample of Amala" })).not.toBeInTheDocument();
    // The stored cast matches speakers case-insensitively.
    expect(within(dialog).getByRole("combobox", { name: "Voice for Anna" })).toHaveValue("Conrad");
    const ben = within(dialog).getByRole("combobox", { name: "Voice for Ben" });
    expect(ben).toHaveValue("Automatic");
    await choose(ben, "Killian");
    await choose(within(dialog).getByRole("combobox", { name: "Voice for Anna" }), "Automatic");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}`, expect.objectContaining({ method: "PATCH" })));
    const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(patch[1]!.body)).speechCast).toEqual({ Ben: "de-DE-KillianNeural" });
  });

  it("keeps the current cast when the cast editor cannot load, and says when no dialogue has speakers", async () => {
    speechCast = () => response({ error: { code: "COURSE_EDIT_FORBIDDEN", message: "No." } }, 403);
    renderPage("manage");
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit course" });
    expect(await within(dialog).findByText("The dialogue voices could not be loaded. Saving keeps the current voices.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/courses/${courseId}`, expect.objectContaining({ method: "PATCH" })));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PATCH")![1]!.body))).not.toHaveProperty("speechCast");
    cleanup();
    speechCast = () => response({ speakers: [], voices: [{ voice: "de-DE-KatjaNeural", sample: null }] });
    renderPage("manage");
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
    expect(await screen.findByText("No dialogue in this course has a speaker yet.")).toBeInTheDocument();
  });
});
