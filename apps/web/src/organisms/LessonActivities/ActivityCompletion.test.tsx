import { MantineProvider } from "@mantine/core";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import type { ActivityDescriptor } from "@wordinator/contracts/lesson-activities";
import { ActivityCompletion, type ActivityCompletionProps } from "./ActivityCompletion";

const fingerprint = "a".repeat(64);
const uuid = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = (id: string, label: string, activityTypes: ActivityDescriptor["activityTypes"], practiceBlockId: string | null = null): ActivityDescriptor => ({
  sourceId: id, sourceKind: "section", sourceLabel: label, returnBlockId: uuid(1), returnHeadingId: uuid(2), practiceBlockId, fingerprint, activityTypes,
});
const current = source("grammar", "Grammar", ["guided_grammar", "tricky_grammar"], uuid(9));
const following = source("reading", "Reading", ["story_comprehension", "guided_grammar"]);
const descriptors = [current, following];

async function renderCompletion(overrides: Partial<ActivityCompletionProps> = {}) {
  const props: ActivityCompletionProps = {
    courseSlug: "dutch", lessonSlug: "one", lessonLabel: "1", descriptors, descriptor: current, restarting: false, onRestart: vi.fn(), ...overrides,
  };
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <ActivityCompletion {...props} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  render(<MantineProvider><RouterProvider router={router} /></MantineProvider>);
  await screen.findByText("Activity complete");
}
afterEach(() => cleanup());

describe("ActivityCompletion", () => {
  it("shows bars only for metrics whose value changed", async () => {
    await renderCompletion({ metrics: [{ key: "lesson_reading", before: 0.2, after: 0.5 }, { key: "lesson_grammar", before: 0.3, after: 0.3 }] });
    expect(screen.getByRole("progressbar", { name: "+30% of this lesson's reading" })).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("renders no metrics block when nothing changed or there are no metrics", async () => {
    await renderCompletion({ metrics: [{ key: "lesson_reading", before: 0.5, after: 0.5 }] });
    expect(screen.queryByTestId("completion-metrics")).toBeNull();
    cleanup();
    await renderCompletion();
    expect(screen.queryByTestId("completion-metrics")).toBeNull();
  });

  it("links Up next to the next section's activities, guided grammar first, and the follow-ups before them", async () => {
    await renderCompletion({ followUps: ["tricky_grammar"] });
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links.slice(0, 3)).toEqual([
      "/courses/dutch/lessons/one/activities/grammar/tricky_grammar",
      "/courses/dutch/lessons/one/activities/reading/guided_grammar",
      "/courses/dutch/lessons/one/activities/reading/story_comprehension",
    ]);
  });

  it("Back to practices targets practiceBlockId, and the return link when it is null", async () => {
    await renderCompletion({ followUps: [] });
    expect(screen.getByRole("link", { name: "Back to the lesson's practices" })).toHaveAttribute("href", `/courses/dutch/lessons/one#${uuid(9)}`);
    cleanup();
    await renderCompletion({ followUps: [], descriptor: { ...current, practiceBlockId: null }, descriptors: [{ ...current, practiceBlockId: null }] });
    expect(screen.getByRole("link", { name: "Back to the lesson's practices" })).toHaveAttribute("href", `/courses/dutch/lessons/one#${uuid(2)}`);
  });

  it("has no Back to practices outside guided grammar", async () => {
    await renderCompletion();
    expect(screen.queryByRole("link", { name: "Back to the lesson's practices" })).toBeNull();
  });
});
