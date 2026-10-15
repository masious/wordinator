import { describe, expect, it } from "vitest";
import { matchesTerm } from "./speechRecognition";

describe("matchesTerm", () => {
  it("compares by search key, ignoring case, diacritics, and punctuation", () => {
    expect(matchesTerm(["Kaartje."], "kaartje")).toBe(true);
    expect(matchesTerm(["uber"], "über")).toBe(true);
    expect(matchesTerm(["zullen we"], "Zullen we …?")).toBe(true);
    expect(matchesTerm(["kaart"], "kaartje")).toBe(false);
  });

  it("makes a leading article optional on either side", () => {
    expect(matchesTerm(["kaartje"], "het kaartje")).toBe(true);
    expect(matchesTerm(["het kaartje"], "kaartje")).toBe(true);
    expect(matchesTerm(["de kaartje"], "het kaartje")).toBe(true);
    expect(matchesTerm(["das Haus"], "Haus")).toBe(true);
  });

  it("accepts any of the recognizer's alternatives", () => {
    expect(matchesTerm(["bellum", "bellen"], "bellen")).toBe(true);
    expect(matchesTerm(["bellum", "ballen"], "bellen")).toBe(false);
  });

  it("never matches an empty term or transcript", () => {
    expect(matchesTerm([""], "")).toBe(false);
    expect(matchesTerm([""], "…")).toBe(false);
    expect(matchesTerm([], "bellen")).toBe(false);
  });
});
