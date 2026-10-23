import { describe, expect, it } from "vitest";
import { closeForms, dutchInflections, findWords } from "./wordMatch";

const word = (id: string, term: string, forms?: string) => ({ id, term, forms });
const found = (text: string, words: ReturnType<typeof word>[], language: "nl" | "de" = "nl") =>
  findWords(text, words, language).map((span) => [text.slice(span.start, span.end), span.wordId]);

describe("findWords", () => {
  it("finds a term, a term without its article, and its forms", () => {
    expect(found("Spanje is een land. Er zijn veel landen.", [word("land", "het land", "de landen")]))
      .toEqual([["land", "land"], ["landen", "land"]]);
    expect(found("Ik heb de steden gezien.", [word("stad", "de stad", "de steden")])).toEqual([["de steden", "stad"]]);
  });

  it("matches close inflections of verbs and adjectives", () => {
    const words = [word("komen", "komen", "komt · kwam · gekomen"), word("wonen", "wonen"), word("groot", "groot"), word("huis", "het huis")];
    expect(found("Ik kom uit Spanje en woon in een groot huis.", words))
      .toEqual([["kom", "komen"], ["woon", "wonen"], ["groot", "groot"], ["huis", "huis"]]);
    expect(found("Jij woont in grote huizen.", words)).toEqual([["woont", "wonen"], ["grote", "groot"], ["huizen", "huis"]]);
    expect(found("Zij is gekomen.", words)).toEqual([["gekomen", "komen"]]);
  });

  it("prefers the longest phrase and ignores punctuation, case, and diacritics", () => {
    const words = [word("waar", "waar"), word("phrase", "Waar kom je vandaan?"), word("be", "België")]
    expect(found("Sofia, waar kom je vandaan? Uit Belgie! Waar?", words))
      .toEqual([["waar kom je vandaan", "phrase"], ["Belgie", "be"], ["Waar", "waar"]]);
  });

  it("does not match unrelated short words", () => {
    expect(found("Wat is dat?", [word("waar", "waar"), word("ik", "ik")])).toEqual([]);
  });

  it("keeps German to forms and shared starts", () => {
    expect(found("Ich wohne in Berlin.", [word("wohnen", "wohnen")], "de")).toEqual([["wohne", "wohnen"]]);
  });
});

describe("helpers", () => {
  it("builds regular Dutch inflections", () => {
    expect(dutchInflections("zitten")).toEqual(expect.arrayContaining(["zit", "zitte"]));
    expect(dutchInflections("leven")).toEqual(expect.arrayContaining(["leef", "leeft"]));
    expect(dutchInflections("wit")).toEqual(expect.arrayContaining(["witte"]));
  });

  it("tells close forms apart", () => {
    expect(closeForms("komen", "kom")).toBe(true);
    expect(closeForms("waar", "wat")).toBe(false);
  });
});
