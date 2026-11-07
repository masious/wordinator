import { describe, expect, it } from "vitest";
import { speakerPortraits } from "./DialogueScene";

describe("speakerPortraits", () => {
  it("keys portrait slots by lowercase speaker, as the views look them up", () => {
    expect(speakerPortraits({ Sofia: "sofia.webp", "Daans moeder": "moeder.webp" })).toEqual({ sofia: "sofia.webp", "daans moeder": "moeder.webp" });
    expect(speakerPortraits(undefined)).toEqual({});
  });
});
