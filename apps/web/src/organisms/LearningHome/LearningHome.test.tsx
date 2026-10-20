import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { localDayOf } from "@wordinator/contracts/learning";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { activity, response } from "./activityFixture";
import { LearningHome } from "./LearningHome";

// The signed-in home dashboard (docs/learning-time.md#home-dashboard), with the activity and course dashboard reads stubbed.
const groupId = "20000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const resume = {
  course: { id: courseId, slug: "deutsch-fur-anfanger", title: "Deutsch für Anfänger", summary: "Erste Schritte", level: "A1", coverUrl: null, lessonCount: 4, coursePercent: 25 },
  lesson: { id: lessonId, slug: "hallo", title: "Hallo", number: 1, total: 4, imageUrl: null, storylinePercent: 50 },
};

let activityBody: ReturnType<typeof activity>;
let dashboardBody: { resume: typeof resume | null; recentLessons: []; notStarted: [] };
let activityRequests: string[];

function renderHome(name = "Ada") {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <LearningHome groupId={groupId} displayName={name} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  activityBody = activity("week", { today: { lesson: 600, practice: 300 }, goal: 30, streak: 3, previousTotal: 450 });
  dashboardBody = { resume, recentLessons: [], notStarted: [] };
  activityRequests = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.startsWith(`/api/groups/${groupId}/learning-activity`)) {
      activityRequests.push(path);
      const range = new URL(path, "http://wordinator.test").searchParams.get("range");
      return response(range === "month" ? activity("month", { today: { lesson: 600, practice: 300 }, goal: activityBody.dailyGoalMinutes, streak: 3 }) : activityBody);
    }
    if (path === `/api/groups/${groupId}/course-dashboard`) return response(dashboardBody);
    return response({ ok: true });
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Home dashboard", () => {
  it("greets the learner by name under the date, with a Practice with AI link to the tutor", async () => {
    renderHome("Ada");
    expect(await screen.findByRole("heading", { level: 1, name: /, Ada$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Practice with AI" })).toHaveAttribute("href", "/ai");
  });

  it("shows the streak, the goal line, and a ring of today's share of the goal beside Continue lesson", async () => {
    renderHome();
    expect(await screen.findByText("3 day streak")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Today: 15 min of a 30 goal" })).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("15 min to go for today's goal")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Continue lesson/ })).toHaveAttribute("href", "/courses/deutsch-fur-anfanger/lessons/hallo?resume=true");
  });

  it("shows today's minutes and a link to set a goal when there is no goal", async () => {
    activityBody = activity("week", { today: { lesson: 600, practice: 300 }, goal: null });
    renderHome();
    expect(await screen.findByRole("img", { name: "Today: 15 min" })).toBeInTheDocument();
    expect(screen.getByText("Set a study goal to see how close each day gets.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set a goal" })).toHaveAttribute("href", "/settings");
  });

  it("says the goal is met once today reaches it", async () => {
    activityBody = activity("week", { today: { lesson: 1800 }, goal: 30 });
    renderHome();
    expect(await screen.findByText("Today's goal is met")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Today: 30 min of a 30 goal" })).toBeInTheDocument();
  });

  it("switches the activity range, asking for the month ending today", async () => {
    renderHome();
    const week = await screen.findByRole("radio", { name: "Week" });
    expect(week).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Month" }));
    const end = localDayOf(new Date());
    await waitFor(() => expect(activityRequests).toContain(`/api/groups/${groupId}/learning-activity?range=month&end=${end}`));
    expect(screen.getByRole("radio", { name: "Month" })).toBeChecked();
    expect(activityRequests[0]).toBe(`/api/groups/${groupId}/learning-activity?range=week&end=${end}`);
    expect(screen.getByRole("radio", { name: "Week" })).not.toBeChecked();
  });

  it("shows the period total, its change, one single-colour bar per day, and a link to the Progress page", async () => {
    renderHome();
    expect((await screen.findAllByText("15 min")).length).toBeGreaterThan(0);
    expect(screen.getByText("Past 7 days · +100% on the previous period")).toBeInTheDocument();
    const bars = screen.getByRole("list", { name: "Study time by day" });
    expect(within(bars).getAllByRole("group")).toHaveLength(7);
    const today = screen.getByRole("group", { name: "Today: 15 min" });
    expect(today).toHaveAttribute("tabindex", "0");
    // One bar for the day, whatever its categories; the tip is the day's time only.
    expect(today.querySelectorAll("[data-category]")).toHaveLength(0);
    expect(today.textContent).toBe("15 min");
    expect(screen.queryByRole("list", { name: "Categories" })).toBeNull();
    expect(screen.getByRole("link", { name: "See progress details" })).toHaveAttribute("href", "/progress");
  });

  it("links to the Progress page's month when the card shows the month", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("radio", { name: "Month" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "See progress details" })).toHaveAttribute("href", "/progress?range=month"));
  });

  it("explains a learner with no time yet, with no bars", async () => {
    activityBody = activity("week", { goal: 15 });
    renderHome();
    expect(await screen.findByText("No study time in this period yet. Lessons, practice, drills, and tutor time show up here.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Study time by day" })).toBeNull();
    expect(screen.getByText("Past 7 days · Keep up the hard work and we'll report progress soon!")).toBeInTheDocument();
  });

  it("offers a next lesson without a saved step when the course read has no in-progress lesson", async () => {
    dashboardBody = { resume: null, recentLessons: [], notStarted: [] };
    renderHome();
    expect(await screen.findByRole("heading", { name: "Your next lesson appears here" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /lesson/i })).not.toBeInTheDocument();
  });
});
