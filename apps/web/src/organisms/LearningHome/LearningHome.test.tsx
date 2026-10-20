import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { localDayOf, type LearningActivityRange } from "@wordinator/contracts/learning";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LearningHome } from "./LearningHome";

// The signed-in home dashboard (docs/learning-time.md#home-dashboard), with the activity and course dashboard reads stubbed.
const groupId = "20000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const lessonId = "40000000-0000-4000-8000-000000000001";
const DAY = 86_400_000;

type Totals = { lesson: number; grammar: number; practice: number; vocabulary: number; aiPractice: number };
const emptyFocus = { grammar: 0, vocabulary: 0, reading: 0, listening: 0, writing: 0 };
const dayRow = (day: string, parts: Partial<Totals> = {}) => {
  const values = { lesson: 0, grammar: 0, practice: 0, vocabulary: 0, aiPractice: 0, ...parts };
  return { day, ...values, total: Object.values(values).reduce((sum, seconds) => sum + seconds, 0), aiPracticeFocus: emptyFocus };
};
// Today is the last day of the range; `today` carries the parts.
function activity(range: LearningActivityRange, options: { today?: Partial<Totals>; previousTotal?: number; goal?: number | null; streak?: number } = {}) {
  const length = range === "week" ? 7 : 30;
  const now = Date.now();
  const days = Array.from({ length }, (_, index) => {
    const offset = length - 1 - index;
    const day = localDayOf(new Date(now - offset * DAY));
    return dayRow(day, offset === 0 ? options.today : undefined);
  });
  const totals = days.reduce((sum, row) => ({
    lesson: sum.lesson + row.lesson, grammar: sum.grammar + row.grammar, practice: sum.practice + row.practice,
    vocabulary: sum.vocabulary + row.vocabulary, aiPractice: sum.aiPractice + row.aiPractice, total: sum.total + row.total, aiPracticeFocus: emptyFocus,
  }), { lesson: 0, grammar: 0, practice: 0, vocabulary: 0, aiPractice: 0, total: 0, aiPracticeFocus: emptyFocus });
  return {
    range, from: days[0]!.day, to: days.at(-1)!.day, days, totals, previousTotal: options.previousTotal ?? 0,
    dailyGoalMinutes: options.goal === undefined ? null : options.goal, streak: options.streak ?? 0,
  };
}
const resume = {
  course: { id: courseId, slug: "deutsch-fur-anfanger", title: "Deutsch für Anfänger", summary: "Erste Schritte", level: "A1", coverUrl: null, lessonCount: 4, coursePercent: 25 },
  lesson: { id: lessonId, slug: "hallo", title: "Hallo", number: 1, total: 4, imageUrl: null, storylinePercent: 50 },
};

let activityBody: ReturnType<typeof activity>;
let dashboardBody: { resume: typeof resume | null; recentLessons: []; notStarted: [] };
let activityRequests: string[];

function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }
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

  it("shows the period total, its change, one bar per day, and the category legend", async () => {
    renderHome();
    expect((await screen.findAllByText("15 min")).length).toBeGreaterThan(0);
    expect(screen.getByText("Past 7 days · +100% on the previous period")).toBeInTheDocument();
    const bars = screen.getByRole("list", { name: "Study time by day" });
    expect(within(bars).getAllByRole("group")).toHaveLength(7);
    expect(screen.getByRole("group", { name: "Today: 15 min" })).toHaveAttribute("tabindex", "0");
    const legend = screen.getByRole("list", { name: "Categories" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Lesson reading", "Grammar", "Practice", "Vocabulary", "AI practice"]);
  });

  it("explains a learner with no time yet, with no bars", async () => {
    activityBody = activity("week", { goal: 15 });
    renderHome();
    expect(await screen.findByText("No study time in this period yet. Lessons, practice, drills, and tutor time show up here.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Study time by day" })).toBeNull();
    expect(screen.getByText(/Nothing to compare with yet$/)).toBeInTheDocument();
  });

  it("offers a next lesson without a saved step when the course read has no in-progress lesson", async () => {
    dashboardBody = { resume: null, recentLessons: [], notStarted: [] };
    renderHome();
    expect(await screen.findByRole("heading", { name: "Your next lesson appears here" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /lesson/i })).not.toBeInTheDocument();
  });
});
