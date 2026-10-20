import { describe, expect, it } from "vitest";
import { averageScore, blankExample, drillDuration, drillTier, gradeDrill, readLastDrill, startDrill, writeLastDrill } from "./drillSession";

const blanked = (example: string, term: string) => blankExample(example, term)?.map((segment) => segment.blank ? "___" : segment.text).join("") ?? null;

describe("drill queue", () => {
  it("puts a card back three to five cards later, or at the end, and keeps only its first grade", () => {
    let state = startDrill(8);
    state = gradeDrill(state, "again", () => 0);
    expect(state.queue).toEqual([1, 2, 3, 0, 4, 5, 6, 7]);
    state = gradeDrill(startDrill(8), "again", () => 0.99);
    expect(state.queue).toEqual([1, 2, 3, 4, 5, 0, 6, 7]);
    state = gradeDrill(startDrill(3), "again", () => 0);
    expect(state.queue).toEqual([1, 2, 0]);
    expect(state.first.get(0)).toBe("again");
    state = gradeDrill(gradeDrill(gradeDrill(state, "got"), "got"), "got");
    expect(state).toMatchObject({ queue: [], retired: 3 });
    expect(state.first.get(0)).toBe("again");
  });
});

describe("blanked example", () => {
  it("blanks the term by search key, keeping the example's own text around it", () => {
    expect(blanked("Ich fahre über die Brücke.", "uber")).toBe("Ich fahre ___ die Brücke.");
    expect(blanked("Die  Straße ist lang. Straße!", "die strasse")).toBe("___ ist lang. Straße!");
    expect(blanked("Ik koop een kaartje.", "het kaartje")).toBe("Ik koop een ___.");
    expect(blanked("Ik loop naar huis.", "lopen")).toBeNull();
  });
});

describe("drill results", () => {
  it("tiers the headline by first-try accuracy", () => {
    expect(drillTier(100)).toBe("perfect");
    expect(drillTier(70)).toBe("good");
    expect(drillTier(69)).toBe("keepGoing");
  });

  it("averages pronunciation scores and formats the session length", () => {
    expect(averageScore([])).toBeNull();
    expect(averageScore([80, 71])).toBe(76);
    expect(drillDuration(400)).toEqual({ unit: "seconds", count: 1 });
    expect(drillDuration(45_000)).toEqual({ unit: "seconds", count: 45 });
    expect(drillDuration(150_000)).toEqual({ unit: "minutes", count: 3 });
  });

  it("keeps the last session per account and ignores incompatible data", () => {
    const last = { version: 1 as const, accuracy: 80, pronunciation: 74, durationMs: 90_000, finishedAt: "2026-10-20T09:00:00.000Z" };
    writeLastDrill("a", last);
    expect(readLastDrill("a")).toEqual(last);
    expect(readLastDrill("b")).toBeNull();
    localStorage.setItem("wordinator:drill:last:v1:b", "{not json");
    expect(readLastDrill("b")).toBeNull();
    localStorage.clear();
  });
});
