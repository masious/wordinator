import { MantineProvider } from "@mantine/core";
import type { LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { SpeechScope, stopSpeech } from "../../molecules/Speech";
import { DialogueWalkthrough } from "./DialogueWalkthrough";
import { HovercardDemoContext } from "./WordHovercard";
import { findWords } from "./wordMatch";

const id = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const komen = { id: id(1), term: "komen", meaning: "to come", forms: "komt" };
const uit = { id: id(2), term: "uit", meaning: "from" };
const turns = [{ speaker: "Daan", text: "Waar kom je vandaan?" }, { speaker: "Sofia", text: "Ik kom uit Spanje." }, { speaker: "Daan", text: "Leuk!" }];
const block = { id: id(10), type: "dialogue", props: { turns: JSON.stringify(turns) }, children: [] } as unknown as LessonBlockOf<"dialogue">;
const spans = turns.map((turn) => findWords(turn.text, [komen, uit], "nl"));
const clip = (name: string) => `https://media.example/speech/${name}.mp3`;
const speech: Record<string, string> = {
  [`turn:${id(10)}:0`]: clip("t0"), [`turn:${id(10)}:1`]: clip("t1"), [`turn:${id(10)}:2`]: clip("t2"),
  [`word:${komen.id}`]: clip("komen"), [`word:${uit.id}`]: clip("uit"),
};

// jsdom has no media playback: play() reports playing, and `end()` finishes the clip (as in Speech.test.tsx).
let player: HTMLMediaElement | null = null;
const src = () => player?.getAttribute("src") ?? null;
const end = () => act(() => { player!.dispatchEvent(new Event("ended")); });
const count = () => screen.getByText(/\d+ \/ 3/).textContent;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    player = this; this.dispatchEvent(new Event("playing")); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => { act(() => stopSpeech()); cleanup(); vi.restoreAllMocks(); });

function renderWalkthrough(sayWords = false) {
  const words = new Map([komen, uit].map((word) => [word.id, word]));
  return render(<MantineProvider>
    <HovercardDemoContext.Provider value={{ toneStyle: {}, sayWords, words }}>
      <SpeechScope resolve={(key) => speech[key] ?? null}><DialogueWalkthrough block={block} spans={spans} /></SpeechScope>
    </HovercardDemoContext.Provider>
  </MantineProvider>);
}

describe("DialogueWalkthrough", () => {
  it("steps line by line, plays each line, and opens the cards of words a line shows first", () => {
    renderWalkthrough();
    fireEvent.click(screen.getByRole("button", { name: "Start dialogue" }));
    expect(count()).toBe("1 / 3");
    expect(src()).toBe(clip("t0"));
    expect(document.querySelectorAll("[data-card]")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Next line" }));
    // kom opened on line 1, so line 2 opens only uit.
    expect([...document.querySelectorAll("[data-card]")].map((card) => card.getAttribute("data-card"))).toEqual([uit.id]);
    expect(src()).toBe(clip("t1"));
    fireEvent.click(screen.getByRole("button", { name: "Next line" }));
    expect(screen.getByText("No new words in this line.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start again/ })).toBeInTheDocument();
  });

  it("says the opened words after the line when Say words is on", () => {
    renderWalkthrough(true);
    fireEvent.click(screen.getByRole("button", { name: "Start dialogue" }));
    fireEvent.click(screen.getByRole("button", { name: "Next line" }));
    expect(src()).toBe(clip("t1"));
    end();
    expect(src()).toBe(clip("uit"));
  });

  it("auto-reads the rest of the dialogue without the words, and pausing or stepping ends it", () => {
    renderWalkthrough(true);
    fireEvent.click(screen.getByRole("button", { name: "Auto-read" }));
    expect(count()).toBe("1 / 3");
    end();
    expect(count()).toBe("2 / 3");
    expect(src()).toBe(clip("t1"));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    end();
    expect(count()).toBe("3 / 3");
    end();
    expect(screen.getByRole("button", { name: "Auto-read" })).toHaveAttribute("aria-pressed", "false");
  });
});
