import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { loadDraftLesson } from "./draftLessons";
import { LessonOverview } from "./LessonOverview";
import { overviewTotals, stopStatus, type LessonOverview as LessonOverviewData } from "./overviewModel";

afterEach(cleanup);

const load = async () => {
  const overview = await loadDraftLesson("07-a-mijn-dag");
  if (!overview) throw new Error("07-a-mijn-dag is missing");
  return overview;
};

function Harness({ overview, initial }: { overview: LessonOverviewData; initial: number }) {
  const [reached, setReached] = useState(initial);
  return <MantineProvider><LessonOverview overview={overview} reached={reached} onReach={setReached} /></MantineProvider>;
}

describe("Lesson overview model", () => {
  it("splits an authored lesson into contiguous stops that cover every player step", async () => {
    const overview = await load();
    expect(overview.title).toBe("Mijn dag");
    expect(overview.stops[0]!.start).toBe(0);
    overview.stops.forEach((stop, index) => {
      expect(stop.end).toBeGreaterThan(stop.start);
      if (index > 0) expect(stop.start).toBe(overview.stops[index - 1]!.end);
    });
    expect(overview.stops.at(-1)!.end).toBe(overview.steps.length);
    const kinds = new Set(overview.stops.map((stop) => stop.kind));
    expect([...kinds].sort()).toEqual(["practice", "reading", "story", "topic"]);
    // Level-3 headings are stops inside their level-2 chapter.
    const verbs = overview.stops.find((stop) => stop.title === "Fill in the verb")!;
    expect(verbs).toMatchObject({ chapter: "Practice", kind: "practice" });
    expect(verbs.questions).toBeGreaterThan(0);
    expect(overview.stops.find((stop) => stop.title === "Story: Ontbijt in de keuken")!.speakers).toEqual(["Noor", "Sofia"]);
    expect(overview.words).toBe(62);
    expect(overview.questions).toBe(49);
  });

  it("gives every stop a specific category from its contents or its practice instruction", async () => {
    const overview = await load();
    expect(overview.stops.map((stop) => [stop.title, stop.category])).toEqual([
      ["Mijn dag", "intro"],
      ["Story: Ontbijt in de keuken", "story"],
      ["The present tense: singular and plural", "grammar"],
      ["We and ze", "topic"],
      ["Jullie", "vocabulary"],
      ["Spelling: just use the infinitive", "vocabulary"],
      ["Irregular verbs", "vocabulary"],
      ["How often?", "grammar"],
      ["In the morning, afternoon, evening", "pronunciation"],
      ["Story: Op kantoor", "story"],
      ["Ons, onze, jullie, hun", "grammar"],
      ["Fill in the verb", "fillIn"],
      ["At breakfast", "conversation"],
      ["Word order: how often?", "wordOrder"],
      ["From singular to plural", "rewrite"],
      ["Translate into Dutch", "translate"],
      ["Translate into English", "translate"],
      ["Reading: Een dag bij Noor en Sofia", "reading"],
      ["Your turn", "writing"],
      ["Summary", "summary"],
    ]);
  });

  it("marks stops done, current, or upcoming from the reached step", async () => {
    const overview = await load();
    const second = overview.stops[1]!;
    const statuses = overview.stops.map((stop) => stopStatus(stop, second.start + 1));
    expect(statuses[0]).toBe("done");
    expect(statuses[1]).toBe("current");
    expect(statuses.slice(2).every((status) => status === "upcoming")).toBe(true);
    expect(overviewTotals(overview, 0)).toMatchObject({ percent: 0, stops: 0, words: 0, questions: 0 });
    expect(overviewTotals(overview, overview.steps.length)).toMatchObject({ percent: 100, stops: overview.stops.length, words: 62, questions: 49 });
  });
});

describe("Lesson overview page", () => {
  it("shows the next stop and advances progress while its steps are played", async () => {
    const overview = await load();
    const first = overview.stops[0]!;
    render(<Harness overview={overview} initial={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Mijn dag" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Lesson progress" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("button", { name: `${first.title}, Up next` })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start section" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(`Step 1 of ${first.end - first.start}`)).toBeInTheDocument();
    for (let step = first.start; step < first.end; step += 1) {
      fireEvent.click(within(dialog).getByRole("button", { name: step === first.end - 1 ? "Finish section" : "Next" }));
    }
    expect(await within(dialog).findByText("Section complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${first.title}, Completed` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${overview.stops[1]!.title}, Up next` })).toBeInTheDocument();
  });

  it("reviewing a finished stop does not move progress", async () => {
    const overview = await load();
    const reached = overview.stops[3]!.start;
    render(<Harness overview={overview} initial={reached} />);
    fireEvent.click(screen.getByRole("button", { name: `${overview.stops[0]!.title}, Completed` }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^(Next|Finish section)$/ }));
    expect(screen.getByRole("slider")).toHaveValue(String(reached));
  });
});
