import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import type { ActivityDescriptor, ActivityType } from "@wordinator/contracts/lesson-activities";
import { LessonBoxActions, SectionActivities, type LessonActivitySuggestion, type LessonBoxLesson } from "./LessonBox";

const lesson: LessonBoxLesson = { groupId: "20000000-0000-4000-8000-000000000001", courseId: "30000000-0000-4000-8000-000000000001", courseTitle: "Dutch Foundations", lessonId: "40000000-0000-4000-8000-000000000001", title: "Lesson title", number: 1 };
const fingerprint = "b".repeat(64);
const story: ActivityDescriptor = { sourceId: "section-story", sourceKind: "section", sourceLabel: "Story", returnBlockId: null, returnHeadingId: null, practiceBlockId: null, fingerprint, activityTypes: ["read_aloud"] };
const grammar: ActivityDescriptor = { sourceId: "section-grammar", sourceKind: "section", sourceLabel: "Grammar", returnBlockId: null, returnHeadingId: null, practiceBlockId: null, fingerprint, activityTypes: ["guided_grammar"] };

afterEach(() => cleanup());

// In a router, so the links resolve to their routes.
function renderInRouter(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "$", component: () => node });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return render(<MantineProvider><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></MantineProvider>);
}

const renderSection = (suggestions: LessonActivitySuggestion[]) =>
  renderInRouter(<SectionActivities courseSlug="dutch-foundations" lessonSlug="lesson-title" suggestions={suggestions} />);

describe("Lesson box actions", () => {
  it("offers Practise words alone, with no AI activities or Do more with AI heading", async () => {
    renderInRouter(<LessonBoxActions lesson={lesson} />);
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    expect(within(group).getByRole("link", { name: "Practise words" }).getAttribute("href")).toMatch(/^\/words\/drill\?/);
    expect(within(group).getAllByRole("link")).toHaveLength(1);
    expect(within(group).queryByText(/Do more with AI/i)).toBeNull();
  });
});

describe("Section activities in the text", () => {
  it("links each activity to its own route, one link per descriptor and type, each naming its source", async () => {
    renderSection([
      { descriptor: story, type: "read_aloud" },
      { descriptor: grammar, type: "guided_grammar" },
    ]);
    const card = await screen.findByRole("complementary", { name: "Do more with AI" });
    expect(within(card).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/courses/dutch-foundations/lessons/lesson-title/activities/section-story/read_aloud",
      "/courses/dutch-foundations/lessons/lesson-title/activities/section-grammar/guided_grammar",
    ]);
    expect(within(card).getByRole("link", { name: "Read aloud · Story" })).toHaveAttribute("data-category", "story");
    expect(within(card).getByRole("link", { name: "Guided grammar · Grammar" })).toHaveAttribute("data-category", "grammar");
  });

  it("ends a done activity with a Done badge that its accessible name includes, and leaves the others unmarked", async () => {
    renderSection([
      { descriptor: story, type: "read_aloud", done: true },
      { descriptor: grammar, type: "guided_grammar" },
    ]);
    const card = await screen.findByRole("complementary", { name: "Do more with AI" });
    const done = within(card).getByRole("link", { name: "Read aloud · Story Done" });
    expect(done.querySelector(".lucide-check")).not.toBeNull();
    expect(within(card).getByRole("link", { name: "Guided grammar · Grammar" })).not.toHaveTextContent("Done");
    expect(within(card).getAllByText("Done")).toHaveLength(1);
    // The full label stays discoverable through the title, since the visible label clamps to two lines.
    expect(done).toHaveAttribute("title", "Read aloud · Story");
  });

  it("starts closed, counting its activities, and opens from its heading", async () => {
    renderSection([{ descriptor: story, type: "read_aloud" }, { descriptor: grammar, type: "guided_grammar" }]);
    const card = await screen.findByRole("complementary", { name: "Do more with AI" });
    const toggle = within(card).getByRole("button", { name: "Do more with AI (2)" });
    const links = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(links).toHaveAttribute("inert");
    expect(within(links).getAllByRole("link")).toHaveLength(2);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(links).not.toHaveAttribute("inert");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("gives each activity type its own icon, marked with data-icon", async () => {
    // The lucide class names come from the icon exports in activityIcons.ts; each type must render a different one.
    const expected: Record<ActivityType, string> = {
      guided_grammar: "lucide-footprints", tricky_grammar: "lucide-puzzle", mixed_practice: "lucide-shuffle",
      read_aloud: "lucide-mic",
    };
    const types = Object.keys(expected) as ActivityType[];
    renderSection(types.map((type) => ({ descriptor: story, type })));
    const card = await screen.findByRole("complementary", { name: "Do more with AI" });
    for (const type of types) expect(card.querySelector(`[data-icon="${type}"]`), type).toHaveClass(expected[type]);
    expect(new Set(types.map((type) => card.querySelector(`[data-icon="${type}"]`)?.getAttribute("class"))).size).toBe(types.length);
  });

  it("marks a grammar part's activities with the part's dot, and others with none", async () => {
    const part = { headingId: "50000000-0000-4000-8000-000000000009", label: "Asking permission", color: "violet" as const };
    const asking = { ...grammar, sourceId: "part-1", sourceLabel: "Asking permission", activityTypes: ["guided_grammar", "tricky_grammar"] as ActivityType[] };
    const end: ActivityDescriptor = { ...grammar, sourceId: "lesson_end", sourceKind: "lesson_end", sourceLabel: "Lesson title · End", activityTypes: ["mixed_practice"] };
    renderSection([{ descriptor: asking, type: "guided_grammar", part }, { descriptor: asking, type: "tricky_grammar", part }, { descriptor: end, type: "mixed_practice" }]);
    const card = await screen.findByRole("complementary", { name: "Do more with AI" });
    for (const name of ["Guided grammar · Asking permission", "Tricky grammar practice · Asking permission"]) {
      expect(within(card).getByRole("link", { name }).querySelector('[data-color="violet"]')).not.toBeNull();
    }
    expect(within(card).getByRole("link", { name: "Mixed lesson practice · Lesson title · End" }).querySelector("[data-color]")).toBeNull();
  });
});
