import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import type { ActivityDescriptor, ActivityType } from "@wordinator/contracts/lesson-activities";
import { LessonBoxActions, type LessonActivitySuggestion, type LessonBoxLesson } from "./LessonBox";

const lesson: LessonBoxLesson = { groupId: "20000000-0000-4000-8000-000000000001", courseId: "30000000-0000-4000-8000-000000000001", courseTitle: "Dutch Foundations", lessonId: "40000000-0000-4000-8000-000000000001", title: "Lesson title", number: 1 };
const fingerprint = "b".repeat(64);
const story: ActivityDescriptor = { sourceId: "section-story", sourceKind: "section", sourceLabel: "Story", returnBlockId: null, returnHeadingId: null, practiceBlockId: null, fingerprint, activityTypes: ["story_summary", "story_comprehension"] };
const grammar: ActivityDescriptor = { sourceId: "section-grammar", sourceKind: "section", sourceLabel: "Grammar", returnBlockId: null, returnHeadingId: null, practiceBlockId: null, fingerprint, activityTypes: ["grammar_explanation"] };

afterEach(() => cleanup());

// The rail's actions in a router, so the activity links resolve to the activity route.
function renderActions(suggestions: LessonActivitySuggestion[], options: { compact?: boolean; completedCount?: number } = {}) {
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
      { descriptor: grammar, type: "grammar_explanation" },
    ]);
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    const activityLinks = within(group).getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("/activities/"));
    expect(activityLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/courses/dutch-foundations/lessons/lesson-title/activities/section-story/story_summary",
      "/courses/dutch-foundations/lessons/lesson-title/activities/section-story/story_comprehension",
      "/courses/dutch-foundations/lessons/lesson-title/activities/section-grammar/grammar_explanation",
    ]);
    // The first suggestion sits beside Practise words; the rest keep their section in the accessible name (visually it is the group's one title).
    expect(within(group).getByText("Story", { selector: "p" })).toHaveAttribute("title", "Story");
    expect(within(group).getByRole("link", { name: "Grammar explanation · Grammar" })).toHaveTextContent(/^Grammar explanation/);
    expect(within(group).getByRole("link", { name: "Story summary" })).toBeInTheDocument();
    expect(within(group).getByRole("link", { name: "Story comprehension · Story" })).toBeInTheDocument();
    expect(within(group).getByRole("link", { name: "Grammar explanation · Grammar" })).toBeInTheDocument();
  });

  it("ends a done suggestion with a Done badge that its accessible name includes, and leaves the others unmarked", async () => {
    renderActions([
      { descriptor: story, type: "story_summary", done: true },
      { descriptor: story, type: "story_comprehension", done: false },
      { descriptor: grammar, type: "grammar_explanation" },
    ]);
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    const done = within(group).getByRole("link", { name: "Story summary Done" });
    expect(within(done).getByText("Done")).toBeInTheDocument();
    expect(done.querySelector(".lucide-check")).not.toBeNull();
    expect(within(group).getByRole("link", { name: "Story comprehension · Story" })).not.toHaveTextContent("Done");
    expect(within(group).getByRole("link", { name: "Grammar explanation · Grammar" })).not.toHaveTextContent("Done");
    expect(within(group).getAllByText("Done")).toHaveLength(1);
    // The full label stays discoverable through the title, since the visible label clamps to two lines.
    expect(done).toHaveAttribute("title", "Story summary · Story");
  });

  it("shows the section label once in the header, on one line with a title, and the links show only the type label", async () => {
    const long = { ...story, sourceLabel: "Story: Een tafel bij het raam" };
    const dialogue: ActivityDescriptor = { ...story, sourceId: "dialogue-1", sourceKind: "dialogue", sourceLabel: "Dialogue · Story: Een tafel bij het raam", activityTypes: ["roleplay"] };
    renderActions([{ descriptor: long, type: "story_summary" }, { descriptor: long, type: "story_comprehension" }, { descriptor: dialogue, type: "roleplay" }]);
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    const header = within(group).getAllByText("Story: Een tafel bij het raam", { selector: "p" });
    expect(header).toHaveLength(1);
    expect(header[0]).toHaveAttribute("title", "Story: Een tafel bij het raam");
    const link = within(group).getByRole("link", { name: "Story comprehension · Story: Een tafel bij het raam" });
    expect(link.querySelector("span")?.firstChild?.textContent).toBe("Story comprehension");
    expect(link).toHaveAttribute("data-focus", "reading");
  });

  it("keeps the Done word for assistive technology in compact mode, where only the check shows", async () => {
    renderActions([{ descriptor: grammar, type: "grammar_explanation", done: true }], { compact: true });
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    const done = within(group).getByRole("link", { name: "Grammar explanation Done" });
    expect(done.querySelector(".lucide-check")).not.toBeNull();
    expect(within(done).getByText("Done")).toBeInTheDocument();
    expect(done).toHaveAttribute("title", "Grammar explanation · Grammar");
  });

  it("gives each of the nine activity types its own icon, marked with data-icon", async () => {
    // The lucide class names come from the icon exports in activityIcons.ts; each type must render a different one.
    const expected: Record<ActivityType, string> = {
      story_summary: "lucide-book-open-text", story_comprehension: "lucide-list-checks", grammar_explanation: "lucide-notebook-pen",
      guided_grammar: "lucide-footprints", tricky_grammar: "lucide-puzzle", mixed_practice: "lucide-shuffle", roleplay: "lucide-drama",
      read_aloud: "lucide-mic", speak_from_english: "lucide-languages",
    };
    const types = Object.keys(expected) as ActivityType[];
    renderActions(types.map((type) => ({ descriptor: story, type })));
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    for (const type of types) {
      const icon = group.querySelector(`[data-icon="${type}"]`);
      expect(icon, type).toHaveClass(expected[type]);
    }
    expect(new Set(types.map((type) => group.querySelector(`[data-icon="${type}"]`)?.getAttribute("class"))).size).toBe(types.length);
  });

  it("counts the lesson's completed activities in the header badge, not only this section's", async () => {
    renderActions([
      { descriptor: story, type: "story_summary", done: true },
      { descriptor: grammar, type: "grammar_explanation" },
    ], { completedCount: 3 });
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    expect(within(group).getByLabelText("3 activities completed")).toHaveTextContent("3");
  });

  it("shows no completed badge when no suggestion is completed", async () => {
    renderActions([
      { descriptor: story, type: "story_summary", done: false },
      { descriptor: grammar, type: "grammar_explanation" },
    ], { completedCount: 0 });
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    expect(within(group).queryByLabelText(/completed$/)).toBeNull();
  });

  it("keeps Practise words and offers no activity links without suggestions", async () => {
    renderActions([]);
    const group = await screen.findByRole("group", { name: "Lesson actions" });
    expect(within(group).getByRole("link", { name: "Practise words" }).getAttribute("href")).toMatch(/^\/words\/drill\?/);
    expect(within(group).getAllByRole("link")).toHaveLength(1);
  });
});
