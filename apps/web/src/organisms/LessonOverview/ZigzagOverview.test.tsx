import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { loadDraftLesson } from "./draftLessons";
import type { LessonOverview } from "./overviewModel";
import { zigzag, ZigzagOverview } from "./ZigzagOverview";

afterEach(cleanup);

const load = async () => {
  const overview = await loadDraftLesson("07-a-mijn-dag");
  if (!overview) throw new Error("07-a-mijn-dag is missing");
  return overview;
};

function Harness({ overview, initial }: { overview: LessonOverview; initial: number }) {
  const [reached, setReached] = useState(initial);
  return <MantineProvider><ZigzagOverview overview={overview} reached={reached} onReach={setReached} /></MantineProvider>;
}

describe("Zigzag trail", () => {
  it("starts in the top-left corner and loops down the box in bands without leaving it", () => {
    const { points, samples } = zigzag(900, 900, 20);
    expect(points[0]).toEqual({ x: 36, y: 36 });
    for (const point of samples) {
      expect(point.x).toBeGreaterThanOrEqual(36 - 0.001);
      expect(point.x).toBeLessThanOrEqual(864 + 0.001);
      expect(point.y).toBeGreaterThanOrEqual(36 - 0.001);
      expect(point.y).toBeLessThanOrEqual(864 + 0.001);
    }
    expect(Math.max(...samples.map((point) => point.y))).toBeCloseTo(864);
    // The finish sits on the trail's last point, and no two waypoints overlap where the trail crosses itself.
    expect(points.at(-1)).toEqual(samples.at(-1));
    points.forEach((point, index) => points.slice(index + 1).forEach((other) => expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThan(44)));
    // The loops curl back: the trail moves against its band's direction at the bottom of each swing.
    const firstBand = samples.slice(1, 60);
    expect(firstBand.some((point, index) => index > 0 && point.x < firstBand[index - 1]!.x)).toBe(true);
  });

  it("keeps every waypoint finite in a box it has not measured yet", () => {
    const { points } = zigzag(0, 0, 5);
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });
});

describe("Zigzag overview page", () => {
  it("plays the current stop in the docked panel and moves to the next stop", async () => {
    const overview = await load();
    const first = overview.stops[0]!;
    render(<Harness overview={overview} initial={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Mijn dag" })).toBeInTheDocument();
    // Stops show their category's emoji, and the first one is the lesson's introduction.
    await waitFor(() => expect(screen.getByRole("button", { name: `${first.title}, Up next` }).querySelector("img")).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/)));
    const panel = screen.getByRole("region", { name: first.title });
    expect(within(panel).getByText(`Step 1 of ${first.end - first.start}`)).toBeInTheDocument();
    for (let step = first.start; step < first.end; step += 1) {
      fireEvent.click(within(panel).getByRole("button", { name: step === first.end - 1 ? "Finish section" : "Next" }));
    }
    expect(within(panel).getByText("Section complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${first.title}, Completed` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${overview.stops[1]!.title}, Up next` })).toBeInTheDocument();
  });

  it("opens a stop from the trail and collapses the panel", async () => {
    const overview = await load();
    const third = overview.stops[2]!;
    render(<Harness overview={overview} initial={0} />);
    fireEvent.click(screen.getByRole("button", { name: `${third.title}, Ahead` }));
    expect(screen.getByRole("region", { name: third.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close section" }));
    expect(screen.getByRole("button", { name: "Start section" })).toBeInTheDocument();
  });

  it("keeps new words out of the section panel and lists them behind the words button", async () => {
    const overview = await load();
    const stop = overview.stops.find((entry) => overview.steps.slice(entry.start, entry.end).some((step) => step.words.length && step.kind !== "words" && step.kind !== "columns"))!;
    const index = overview.steps.findIndex((step, position) => position >= stop.start && step.words.length && step.kind !== "words" && step.kind !== "columns");
    const step = overview.steps[index]!;
    render(<Harness overview={overview} initial={index} />);
    const panel = screen.getByRole("region", { name: stop.title });
    expect(within(panel).queryByText(step.words[0]!.term)).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: `New words, ${new Set(step.words.map((word) => word.id)).size} on this step` });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const drawer = screen.getByRole("region", { name: "New words" });
    expect(within(drawer).getAllByRole("listitem")).toHaveLength(overview.words);
    const highlighted = within(drawer).getAllByRole("listitem").filter((item) => item.getAttribute("aria-current"));
    expect(highlighted.map((item) => item.querySelector("span")!.textContent)).toEqual(expect.arrayContaining([step.words[0]!.term.trim()]));
    fireEvent.click(within(drawer).getByRole("button", { name: "Close new words" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
