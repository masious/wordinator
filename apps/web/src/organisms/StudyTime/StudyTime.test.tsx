import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { localDayOf } from "@wordinator/contracts/learning";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { StudyTimeBox } from "./StudyTime";

// The rail's study time card (docs/learning-time.md#study-time), with the activity read stubbed.
const groupId = "20000000-0000-4000-8000-000000000001";
const zero = { lesson: 0, grammar: 0, practice: 0, vocabulary: 0, aiPractice: 0, total: 0, aiPracticeFocus: { grammar: 0, vocabulary: 0, reading: 0, listening: 0, writing: 0 } };
const week = (today: Partial<typeof zero>, earlier: Partial<typeof zero> = {}) => {
  const day = localDayOf(new Date());
  const first = { ...zero, ...earlier, day: "2026-01-01" };
  const last = { ...zero, ...today, day };
  return { range: "week", from: first.day, to: day, previousTotal: 0, dailyGoalMinutes: null, streak: 0, days: [first, last],
    totals: { ...zero, ...Object.fromEntries((["lesson", "grammar", "practice", "vocabulary", "aiPractice", "total"] as const).map((key) => [key, first[key] + last[key]])) } };
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const renderBox = () => render(<MantineProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <StudyTimeBox groupId={groupId} />
</QueryClientProvider></MantineProvider>);

beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("StudyTimeBox", () => {
  it("offers Today and This week only, reads the past seven days, and says when a period is empty", async () => {
    vi.mocked(fetch).mockResolvedValue(response(week({}, { grammar: 120, total: 120 })));
    renderBox();
    const box = screen.getByRole("region", { name: "Study time" });
    expect(within(box).queryByText("Lesson")).not.toBeInTheDocument();
    expect(await within(box).findByText("No study time yet today.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/groups/${groupId}/learning-activity?range=week&end=${localDayOf(new Date())}`, expect.anything());
    // Without a goal there is no goal meter.
    expect(within(box).queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(within(box).getByText("This week"));
    expect(within(box).getByText("Grammar").nextElementSibling).toHaveTextContent("2 min");
  });

  it("opens on a summary row of today, with the goal when there is one, over its figures", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...week({ lesson: 600, total: 600 }, { grammar: 120, total: 120 }), dailyGoalMinutes: 30 }));
    renderBox();
    const box = screen.getByRole("region", { name: "Study time" });
    expect(await within(box).findByRole("progressbar", { name: "Today · 10 min of 30 min" })).toBeInTheDocument();
    // The profile row's Study time button shows and hides the whole card, so it has no chevron of its own.
    expect(within(box).queryByRole("button", { name: /study figures/ })).not.toBeInTheDocument();
    // The summary row carries the goal, so the figures do not repeat it.
    expect(within(box).getAllByRole("progressbar")).toHaveLength(1);
    // The summary stays on today whichever tab is chosen.
    fireEvent.click(within(box).getByText("This week"));
    expect(within(box).getByText("Grammar").nextElementSibling).toHaveTextContent("2 min");
    expect(within(box).getByRole("progressbar", { name: "Today · 10 min of 30 min" })).toBeInTheDocument();
  });

  it("shows today's time alone without a goal", async () => {
    vi.mocked(fetch).mockResolvedValue(response(week({})));
    renderBox();
    const box = screen.getByRole("region", { name: "Study time" });
    expect(await within(box).findByText("Today · nothing yet")).toBeInTheDocument();
    expect(within(box).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("opens Today where the lesson box was left on Lesson, and reports a failed read", async () => {
    localStorage.setItem("wordinator:ui:v1:rail-study-period", "lesson");
    vi.mocked(fetch).mockResolvedValue(response({ error: { code: "INTERNAL_ERROR", message: "x" } }, 500));
    renderBox();
    const box = screen.getByRole("region", { name: "Study time" });
    expect(await within(box).findByText("Your study time could not be loaded.")).toBeInTheDocument();
    expect(within(box).getByRole("radio", { name: "Today" })).toBeChecked();
  });
});
