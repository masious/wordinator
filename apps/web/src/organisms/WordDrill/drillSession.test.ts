import { describe, expect, it } from "vitest";
import { blankExample, gradeDrill, startDrill } from "./drillSession";

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
