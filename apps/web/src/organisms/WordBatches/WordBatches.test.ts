import { describe, expect, it } from "vitest";
import { wordPageStarts } from "./WordBatches";

// Two rows of 100 with gaps of 10 and 20-wide controls: Back starts every page's top row after the first, and Next ends the bottom
// row while words remain.
describe("word pages", () => {
  it("fills two rows a page and keeps room for the controls", () => {
    expect(wordPageStarts([], 100, 10, 20)).toEqual([]);
    // Two 40s fit a row; four words fit one page with nothing after, so no room is kept for Next.
    expect(wordPageStarts([40, 40, 40, 40], 100, 10, 20)).toEqual([0]);
    // A fifth word: the bottom row gives up its second word to make room for Next (40 + 10 + 40 + 10 + 20 > 100).
    expect(wordPageStarts([40, 40, 40, 40, 40], 100, 10, 20)).toEqual([0, 3]);
    // A middle page has both: Back and one word on top, one word and Next below.
    expect(wordPageStarts([40, 40, 40, 40, 40, 40, 40], 100, 10, 20)).toEqual([0, 3, 5]);
    // Without a width yet, everything waits on one page.
    expect(wordPageStarts([40, 40, 40], 0, 10, 20)).toEqual([0]);
  });

  it("gives every page at least one word, even one wider than the row", () => {
    // Too wide for a row with Next, a word still takes its page.
    expect(wordPageStarts([300, 300, 300], 100, 10, 20)).toEqual([0, 1, 2]);
  });
});
