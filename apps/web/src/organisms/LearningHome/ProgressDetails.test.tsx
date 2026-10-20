import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { localDayOf, type LearningActivityRange } from "@wordinator/contracts/learning";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { activity, response } from "./activityFixture";
import { ProgressDetails } from "./ProgressDetails";

// The Progress page (docs/learning-time.md#progress-page), with the activity read stubbed.
const groupId = "20000000-0000-4000-8000-000000000001";

let activityBody: ReturnType<typeof activity>;
let activityRequests: string[];

function Harness() {
  const [range, setRange] = useState<LearningActivityRange>("week");
  return <ProgressDetails groupId={groupId} range={range} onRange={setRange} />;
}
function renderProgress() {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: Harness });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/progress"] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

beforeEach(() => {
  activityBody = activity("week", { today: { lesson: 600, practice: 300 }, goal: 30, streak: 3, previousTotal: 450 });
  activityRequests = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.startsWith(`/api/groups/${groupId}/learning-activity`)) {
      activityRequests.push(path);
      const range = new URL(path, "http://wordinator.test").searchParams.get("range");
      return response(range === "month" ? activity("month", { today: { lesson: 1200 }, goal: 30, streak: 3 }) : activityBody);
    }
    return response({ ok: true });
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Progress page", () => {
  it("shows the period's total and change, its active days, and its daily average, with a way back home", async () => {
    renderProgress();
    expect(await screen.findByRole("heading", { level: 1, name: "Progress" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/courses");
    expect(await screen.findByText("Past 7 days · +100% on the previous period")).toBeInTheDocument();
    expect(screen.getByText("Days with study time").nextSibling).toHaveTextContent("1 of 7");
    expect(screen.getByText("Daily average").nextSibling).toHaveTextContent("2 min");
  });

  it("splits the period's time by category, with each category's share", async () => {
    renderProgress();
    const categories = await screen.findByRole("list", { name: "By category" });
    const rows = within(categories).getAllByRole("listitem").map((row) => row.textContent);
    expect(rows).toEqual(["Lesson reading10 min · 67%", "Grammar0 min · 0%", "Practice5 min · 33%", "Vocabulary0 min · 0%", "AI practice0 min · 0%"]);
  });

  it("shows the goal, the days that met it, and the streak", async () => {
    renderProgress();
    expect((await screen.findByText("Daily goal")).nextSibling).toHaveTextContent("30 min");
    expect(screen.getByText("Days at the goal").nextSibling).toHaveTextContent("0 of 7");
    expect(screen.getByText("Streak").nextSibling).toHaveTextContent("3 days");
    expect(screen.queryByRole("link", { name: "Set a goal" })).toBeNull();
  });

  it("offers to set a goal when there is none", async () => {
    activityBody = activity("week", { today: { lesson: 600 }, goal: null });
    renderProgress();
    expect((await screen.findByText("Daily goal")).nextSibling).toHaveTextContent("No daily goal");
    expect(screen.queryByText("Days at the goal")).toBeNull();
    expect(screen.getByRole("link", { name: "Set a goal" })).toHaveAttribute("href", "/settings");
  });

  it("lists every day newest first, today first", async () => {
    renderProgress();
    const days = await screen.findByRole("list", { name: "Day by day" });
    const rows = within(days).getAllByRole("listitem");
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("Today15 min");
    expect(rows[0]).toHaveAttribute("data-today");
    expect(rows[1]).toHaveAttribute("data-empty");
  });

  it("switches to the month ending today", async () => {
    renderProgress();
    fireEvent.click(await screen.findByRole("radio", { name: "Month" }));
    const end = localDayOf(new Date());
    await waitFor(() => expect(activityRequests).toContain(`/api/groups/${groupId}/learning-activity?range=month&end=${end}`));
    expect(await screen.findByText(/^Past 30 days · /)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Day by day" })).getAllByRole("listitem")).toHaveLength(30);
  });

  it("says so when a period has no time, with no day list", async () => {
    activityBody = activity("week", { goal: 15 });
    renderProgress();
    expect(await screen.findByText("No study time in this period yet. Lessons, practice, drills, and tutor time show up here.")).toBeInTheDocument();
    expect(screen.getByText("Past 7 days · Keep up the hard work and we'll report progress soon!")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Day by day" })).toBeNull();
  });
});
