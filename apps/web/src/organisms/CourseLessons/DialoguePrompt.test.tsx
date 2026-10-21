import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DialoguePrompt, dialogueTurns } from "./DialoguePrompt";

afterEach(() => cleanup());

describe("dialogueTurns", () => {
  it("splits a two-person exchange into turns", () => {
    expect(dialogueTurns("Noor: Wat … jullie drinken? / Sofia: Ik … graag een thee.")).toEqual([
      { speaker: "Noor", text: "Wat … jullie drinken?" }, { speaker: "Sofia", text: "Ik … graag een thee." },
    ]);
  });

  it("accepts a two-word role and three turns", () => {
    expect(dialogueTurns("Daans moeder: Hoe … jullie? / Noor: Met de tram. / Daan: Ja.")?.map((turn) => turn.speaker)).toEqual(["Daans moeder", "Noor", "Daan"]);
  });

  it("keeps plain prompts, single turns, word lists and slashed hints as text", () => {
    expect(dialogueTurns("Ik … graag een thee.")).toBeNull();
    expect(dialogueTurns("Sofia: Ik … graag een thee.")).toBeNull();
    expect(dialogueTurns("Arrange: Groetjes, Sofia / Hoi Noor, / Ik ben iets later.")).toBeNull();
    expect(dialogueTurns("Sofia: Wanneer is je …? / Noor: Op vrijdag 2 …. (exam / October)")).toBeNull();
  });
});

describe("DialoguePrompt", () => {
  it("renders one turn per line, each speaker on its own side", () => {
    render(<DialoguePrompt turns={dialogueTurns("Noor: Wat … jullie drinken? / Sofia: Ik … graag een thee. / Noor: Prima.")!} />);
    const turns = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(turns.map((turn) => turn.getAttribute("data-side"))).toEqual(["start", "end", "start"]);
    expect(turns[1]).toHaveTextContent("SofiaIk … graag een thee.");
  });
});
