import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { SpeechScope, stopSpeech } from "../../molecules/Speech";
import type { RecapWord } from "../WordRecap/WordRecap";
import { isPair, shuffled, successRate, WordMatch } from "./WordMatch";

const word = (id: string, term: string, meaning: string): RecapWord => ({ id, term, meaning, forms: null, example: null, note: null });
const words = [word("1", "de hond", "the dog"), word("2", "de kat", "the cat"), word("3", "het huis", "the house")];

afterEach(() => { cleanup(); stopSpeech(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("word match helpers", () => {
  it("shuffles a copy, never repeating the order it must avoid", () => {
    const items = [1, 2, 3];
    // Randoms of 0.99 leave every item in place, repeating the order to avoid, so it shuffles again.
    const randoms = [0.99, 0.99, 0, 0];
    const result = shuffled(items, () => randoms.shift() ?? 0, items);
    expect(result).not.toEqual(items);
    expect([...result].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3]);
  });

  it("pairs the same word, a repeated term, or a repeated translation", () => {
    expect(isPair(words[0]!, words[0]!)).toBe(true);
    expect(isPair(words[0]!, words[1]!)).toBe(false);
    expect(isPair(word("4", "de bank", "the bench"), word("5", "de bank", "the bank"))).toBe(true);
    expect(isPair(word("6", "groot", "big"), word("7", "dik", "big"))).toBe(true);
  });

  it("rates matches over tries, with no rate before a try", () => {
    expect(successRate(0, 0)).toBeNull();
    expect(successRate(3, 4)).toBe(0.75);
  });
});

describe("word match game", () => {
  const renderGame = (onDone = vi.fn()) => {
    render(<MantineProvider><WordMatch words={words} doneLabel="Back to the lesson" onDone={onDone} finish={<button type="button">Drill batch 1</button>} /></MantineProvider>);
    return onDone;
  };
  const column = (name: string) => screen.getByRole("list", { name });
  const rate = () => screen.getByText("Success rate").nextElementSibling?.textContent;
  const pick = (list: string, name: string) => fireEvent.click(within(column(list)).getByRole("button", { name }));

  it("shows the words and their translations in two columns", () => {
    renderGame();
    expect(within(column("Words")).getAllByRole("button").map((button) => button.textContent).sort()).toEqual(["de hond", "de kat", "het huis"]);
    expect(within(column("Translations")).getAllByRole("button").map((button) => button.textContent).sort()).toEqual(["the cat", "the dog", "the house"]);
    expect(rate()).toBe("–");
  });

  it("sets a matched pair aside, clears a miss, and keeps the success rate", () => {
    vi.useFakeTimers();
    renderGame();
    pick("Words", "de hond");
    expect(within(column("Words")).getByRole("button", { name: "de hond" })).toHaveAttribute("aria-pressed", "true");
    pick("Translations", "the cat");
    expect(within(column("Words")).getByRole("button", { name: "de hond" })).toHaveAttribute("data-state", "missed");
    expect(screen.getByRole("status")).toHaveTextContent("Not a pair: de hond and the cat");
    expect(rate()).toBe("0%");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(within(column("Words")).getByRole("button", { name: "de hond" })).not.toHaveAttribute("data-state");
    // Either side can come first.
    pick("Translations", "the dog");
    pick("Words", "de hond");
    expect(within(column("Words")).getByRole("button", { name: "de hond" })).toBeDisabled();
    expect(within(column("Translations")).getByRole("button", { name: "the dog" })).toHaveAttribute("data-state", "matched");
    expect(rate()).toBe("50%");
    expect(screen.getByRole("progressbar", { name: "1 of 3 matched" })).toBeInTheDocument();
  });

  it("ends with the success rate, Play again, the batch's actions, and the done action", () => {
    const onDone = renderGame();
    pick("Words", "de kat"); pick("Translations", "the house");
    for (const [term, meaning] of [["de hond", "the dog"], ["de kat", "the cat"], ["het huis", "the house"]] as const) { pick("Words", term); pick("Translations", meaning); }
    const result = screen.getByRole("region", { name: "Your result" });
    expect(within(result).getByText("75%")).toBeInTheDocument();
    expect(within(result).getByText("3 pairs matched, 1 missed")).toBeInTheDocument();
    expect(within(result).getByRole("button", { name: "Drill batch 1" })).toBeInTheDocument();
    fireEvent.click(within(result).getByRole("button", { name: "Back to the lesson" }));
    expect(onDone).toHaveBeenCalledOnce();
    fireEvent.click(within(result).getByRole("button", { name: "Play again" }));
    expect(screen.queryByRole("region", { name: "Your result" })).toBeNull();
    expect(within(column("Words")).getAllByRole("button").every((button) => !button.hasAttribute("disabled"))).toBe(true);
  });

  it("lists the words of a miss with the promise to practise them more, and reports them once per round", () => {
    const onFinish = vi.fn();
    render(<MantineProvider><WordMatch words={words} doneLabel="Done" onDone={() => {}} onFinish={onFinish} progress={<p>Lesson progress</p>} /></MantineProvider>);
    pick("Words", "de hond"); pick("Translations", "the cat");
    for (const [term, meaning] of [["de hond", "the dog"], ["de kat", "the cat"], ["het huis", "the house"]] as const) { pick("Words", term); pick("Translations", meaning); }
    const result = screen.getByRole("region", { name: "Your result" });
    expect(within(result).getByText("Lesson progress")).toBeInTheDocument();
    expect(within(result).getByText("2 words to review")).toBeInTheDocument();
    expect(within(result).getByText("de hond")).toBeInTheDocument();
    expect(within(result).queryByText("het huis")).toBeNull();
    expect(within(result).getByText("We'll practise these words more often.")).toBeInTheDocument();
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0]![0]).toMatchObject({ matches: 3, tries: 4 });
    expect([...onFinish.mock.calls[0]![0].missed].sort()).toEqual(["1", "2"]);
  });

  it("speaks a Dutch card's term when it is picked, from the word's clip or the lesson's speech", () => {
    const sources: string[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { sources.push(this.src); return Promise.resolve(); });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const spoken = [{ ...words[0]!, speech: { term: "https://media.test/hond.mp3", example: null } }, words[1]!, words[2]!];
    const resolve = (key: string) => key === "word:2" ? "https://media.test/kat.mp3" : null;
    render(<MantineProvider><SpeechScope resolve={resolve}><WordMatch words={spoken} doneLabel="Done" onDone={() => {}} /></SpeechScope></MantineProvider>);
    pick("Words", "de hond");
    pick("Words", "de kat");
    // A word without a clip stays silent, and so do translations.
    pick("Words", "het huis");
    pick("Translations", "the house");
    expect(sources).toEqual(["https://media.test/hond.mp3", "https://media.test/kat.mp3"]);
  });

  it("shows only the columns as a preview", () => {
    render(<MantineProvider><WordMatch words={words} doneLabel="Done" onDone={() => {}} preview /></MantineProvider>);
    expect(column("Words")).toBeInTheDocument();
    expect(screen.queryByText("Success rate")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
