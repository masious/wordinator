import { describe, expect, it } from "vitest";
import { diffEdits, diffWords } from "./answerDiff";

describe("diffWords", () => {
  it("finds one wrong word and ignores capitals and punctuation", () => {
    const diff = diffWords("ik zie veel spullen in de markt", "Ik zie veel spullen op de markt.");
    expect(diff.filter((entry) => entry.type !== "same")).toEqual([{ type: "wrong", given: "in", expected: "op" }]);
    expect(diffEdits(diff)).toBe(1);
  });

  it("finds missing, extra, moved, and misspelled words", () => {
    expect(diffWords("ik koop bloemen", "Ik koop een bos bloemen.").filter((entry) => entry.type === "missing").map((entry) => entry.type === "missing" && entry.expected)).toEqual(["een bos"]);
    expect(diffWords("ik heb de het boek gelezen", "Ik heb het boek gelezen.").filter((entry) => entry.type !== "same")).toEqual([{ type: "extra", given: "de" }]);
    expect(diffWords("ik morgen ga naar de markt", "Ik ga morgen naar de markt.").filter((entry) => entry.type !== "same"))
      .toEqual([expect.objectContaining({ type: "moved", given: "ga", after: "ik", before: "morgen" })]);
    const two = diffWords("ik zie veel spulen in de markt", "Ik zie veel spullen op de markt.");
    expect(two.filter((entry) => entry.type !== "same").map((entry) => entry.type)).toEqual(["typo", "wrong"]);
    expect(diffEdits(two)).toBe(2);
    const typo = diffWords("ik zie veel spulen", "Ik zie veel spullen").find((entry) => entry.type === "typo");
    expect(typo).toMatchObject({ given: "spulen", expected: "spullen", chars: [{ text: "spul", kind: "same" }, { text: "l", kind: "missing" }, { text: "en", kind: "same" }] });
  });
});
