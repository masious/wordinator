import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { CourseProgress } from "./CourseProgress";

const groupId = "20000000-0000-4000-8000-000000000001";
const courseId = "30000000-0000-4000-8000-000000000001";
const ada = { id: "10000000-0000-4000-8000-000000000001", displayName: "Ada", avatarUrl: null };
const bo = { id: "10000000-0000-4000-8000-000000000002", displayName: "Bo", avatarUrl: null };

function renderProgress(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><CourseProgress groupId={groupId} courseId={courseId} accountId={ada.id} /></QueryClientProvider></MantineProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Course progress", () => {
  it("shows every participant's percentage and marks the viewer", async () => {
    renderProgress({
      publishedLessons: 4, completedLessonIds: [], positions: [],
      participants: [{ user: bo, completedLessons: 3, percent: 75 }, { user: ada, completedLessons: 0, percent: 0 }],
    });
    expect(await screen.findByRole("heading", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Course progress for Bo" })).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByText("3 of 4 lessons")).toBeInTheDocument();
    expect(screen.getByText("Ada (you)")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Course progress for Ada" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("stays hidden while the course has no published lessons", async () => {
    renderProgress({ publishedLessons: 0, completedLessonIds: [], positions: [], participants: [{ user: ada, completedLessons: 0, percent: 0 }] });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("heading", { name: "Progress" })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
