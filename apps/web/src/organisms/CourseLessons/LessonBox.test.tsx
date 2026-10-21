import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import type { ActivityDescriptor } from "@wordinator/contracts/lesson-activities";
import { LessonBoxActions, type LessonActivitySuggestion, type LessonBoxLesson } from "./LessonBox";

const lesson: LessonBoxLesson = { groupId: "20000000-0000-4000-8000-000000000001", courseId: "30000000-0000-4000-8000-000000000001", courseTitle: "Dutch Foundations", lessonId: "40000000-0000-4000-8000-000000000001", title: "Lesson title", number: 1 };
const fingerprint = "b".repeat(64);
const story: ActivityDescriptor = { sourceId: "section-story", sourceKind: "section", sourceLabel: "Story", returnBlockId: null, returnHeadingId: null, fingerprint, activityTypes: ["story_summary", "story_comprehension"] };
const grammar: ActivityDescriptor = { sourceId: "section-grammar", sourceKind: "section", sourceLabel: "Grammar", returnBlockId: null, returnHeadingId: null, fingerprint, activityTypes: ["quick_grammar"] };

afterEach(() => cleanup());

// The rail's actions in a router, so the activity links resolve to the activity route.
function renderActions(suggestions: LessonActivitySuggestion[], options: { compact?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => <LessonBoxActions lesson={lesson} courseSlug="dutch-foundations" lessonSlug="lesson-title" suggestions={suggestions} {...options} /> });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

describe("Lesson box actions", () => {
  it("links each suggested activity to its own route, one link per descriptor and type", async () => {
    renderActions([
      { descriptor: story, type: "story_summary" },
      { descriptor: story, type: "story_comprehension" },
      { descriptor: grammar, type: "quick_grammar" },
    ]);
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    const activityLinks = within(group).getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("/activities/"));
    expect(activityLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/courses/dutch-foundations/lessons/lesson-title/activities/section-story/story_summary",
      "/courses/dutch-foundations/lessons/lesson-title/activities/section-story/story_comprehension",
      "/courses/dutch-foundations/lessons/lesson-title/activities/section-grammar/quick_grammar",
    ]);
    // The first suggestion sits beside Practise words; the rest name their section.
    expect(within(group).getByRole("link", { name: "Story summary" })).toBeInTheDocument();
    expect(within(group).getByRole("link", { name: "Story comprehension · Story" })).toBeInTheDocument();
    expect(within(group).getByRole("link", { name: "Quick grammar question · Grammar" })).toBeInTheDocument();
  });

  it("ends a done suggestion with a Done badge that its accessible name includes, and leaves the others unmarked", async () => {
    renderActions([
      { descriptor: story, type: "story_summary", done: true },
      { descriptor: story, type: "story_comprehension", done: false },
      { descriptor: grammar, type: "quick_grammar" },
    ]);
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    const done = within(group).getByRole("link", { name: "Story summary Done" });
    expect(within(done).getByText("Done")).toBeInTheDocument();
    expect(done.querySelector(".lucide-check")).not.toBeNull();
    expect(within(group).getByRole("link", { name: "Story comprehension · Story" })).not.toHaveTextContent("Done");
    expect(within(group).getByRole("link", { name: "Quick grammar question · Grammar" })).not.toHaveTextContent("Done");
    expect(within(group).getAllByText("Done")).toHaveLength(1);
    // The full label stays discoverable through the title, since the visible label clamps to two lines.
    expect(done).toHaveAttribute("title", "Story summary · Story");
  });

  it("keeps the Done word for assistive technology in compact mode, where only the check shows", async () => {
    renderActions([{ descriptor: grammar, type: "quick_grammar", done: true }], { compact: true });
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    const done = within(group).getByRole("link", { name: "Quick grammar question Done" });
    expect(done.querySelector(".lucide-check")).not.toBeNull();
    expect(within(done).getByText("Done")).toBeInTheDocument();
    expect(done).toHaveAttribute("title", "Quick grammar question · Grammar");
  });

  it("keeps Practise words and offers no activity links without suggestions", async () => {
    renderActions([]);
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    expect(within(group).getByRole("link", { name: "Practise words" }).getAttribute("href")).toMatch(/^\/words\/drill\?/);
    expect(within(group).getAllByRole("link")).toHaveLength(1);
  });
});
