import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { SpeechScope, stopSpeech } from "../../molecules/Speech";
import { HovercardDemoContext } from "../TempHovercard/WordHovercard";
import { Conversation } from "./Conversation";

const blockId = "92000000-0000-4000-8000-000000000001";
const text = (value: string) => [{ type: "text" as const, text: value, styles: {} }];
const turns = [
  { speaker: "Sofia", text: "Mag ik vrij nemen?", translation: "May I take time off?" },
  { speaker: "Karin", text: "Dat mag.", translation: "That is allowed." },
  { speaker: "Sofia", text: "Dank je.", translation: null },
];
const clip = (line: number) => `https://media.example/speech/t${line}.mp3`;

// jsdom has no media playback: play() records the clip (as in Speech.test.tsx).
let played: string[] = [];
beforeEach(() => {
  played = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    (globalThis as { __player?: HTMLMediaElement }).__player = this;
    played.push(this.getAttribute("src") ?? ""); this.dispatchEvent(new Event("playing")); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => { act(() => stopSpeech()); cleanup(); vi.restoreAllMocks(); });

// "vrij" in the first line and "mag" in the second are new words.
const vrij = { id: "93000000-0000-4000-8000-000000000001", term: "vrij", meaning: "free, off" };
const mag = { id: "93000000-0000-4000-8000-000000000002", term: "mogen", meaning: "to be allowed to" };
const spans = [[{ start: 7, end: 11, wordId: vrij.id }], [{ start: 4, end: 7, wordId: mag.id }], []];
const words = new Map([[vrij.id, vrij], [mag.id, mag]]);

function renderConversation(masks?: Record<string, string>, location?: string) {
  return render(<MantineProvider>
    <HovercardDemoContext.Provider value={{ toneStyle: {}, sayWords: false, words, subtle: true, clickOnly: true }}>
      <SpeechScope resolve={(key) => { const match = /^turn:.+:(\d+)$/.exec(key); return match ? clip(Number(match[1])) : null; }}>
        <Conversation blockId={blockId} title="Mag ik vrij nemen?" scene="Story: asking Karin" intro={[text("It is Monday."), text("Sofia asks Karin.")]}
          turns={turns} background="office.jpg" portraits={{ sofia: "sofia.jpg" }} masks={masks} location={location} spans={spans} />
      </SpeechScope>
    </HovercardDemoContext.Provider>
  </MantineProvider>);
}
// Finishes the clip playing now, as the audio element would.
const end = () => act(() => { (globalThis as { __player?: HTMLMediaElement }).__player?.dispatchEvent(new Event("ended")); });
const space = () => fireEvent.keyDown(window, { key: " " });

describe("Conversation prototype", () => {
  it("brings the intro boxes, then the lines, one step at a time", () => {
    renderConversation();
    expect(screen.getByText(/press Space to begin/)).toBeTruthy();
    space();
    expect(screen.getByText("It is Monday.")).toBeTruthy();
    expect(screen.getByText("Intro 1 / 2")).toBeTruthy();
    space();
    expect(screen.getByText("Sofia asks Karin.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start conversation/ })).toBeTruthy();
    space();
    expect(screen.queryByText("It is Monday.")).toBeNull();
    expect(screen.getByText("Story: asking Karin")).toBeTruthy();
    expect(document.querySelector("li p")?.textContent).toBe("Mag ik vrij nemen?");
    expect(screen.getByText("Line 1 / 3")).toBeTruthy();
    expect(played).toEqual([clip(0)]);
  });

  it("puts speakers on alternate sides and keeps earlier lines", () => {
    const { container } = renderConversation();
    for (let step = 0; step < 4; step++) space();
    const lines = container.querySelectorAll("li");
    expect([...lines].map((line) => line.getAttribute("data-side"))).toEqual(["start", "end"]);
    expect(lines[1]!.hasAttribute("data-current")).toBe(true);
    // Sofia stands in the scene; Karin has no portrait and keeps an initial beside her line.
    const cast = [...container.querySelectorAll<HTMLImageElement>("img[data-side]")];
    expect(cast.map((image) => [image.getAttribute("src"), image.getAttribute("data-side")])).toEqual([["sofia.jpg", "start"]]);
    expect(cast[0]!.hasAttribute("data-speaking")).toBe(false);
    expect(lines[0]!.querySelector("img")).toBeNull();
    expect(lines[1]!.firstElementChild?.textContent).toBe("K");
  });

  it("shows the empty location during the intro, then dims everyone but the speaker with their mask", () => {
    const { container } = renderConversation({ sofia: "mask-sofia.jpg", karin: "mask-karin.jpg" }, "empty-office.jpg");
    const active = () => container.querySelector("img[data-active]")?.getAttribute("data-speaker") ?? null;
    const empty = () => container.querySelector("img[src='empty-office.jpg']")!.parentElement!.hasAttribute("data-active");
    // The empty location shows through the title and the intro, and gives way to the scene with the speakers.
    expect(empty()).toBe(true);
    space();
    expect(empty()).toBe(true);
    expect(active()).toBeNull();
    for (let step = 0; step < 3; step++) space();
    expect(empty()).toBe(false);
    expect(active()).toBe("karin");
    // The speakers stay in the scene, so the portraits go back into the bubbles.
    expect(container.querySelector("img[data-side]")).toBeNull();
    expect(container.querySelectorAll("li")[0]!.querySelector("img")?.getAttribute("src")).toBe("sofia.jpg");
    for (let step = 0; step < 2; step++) space();
    expect(screen.getByText("The end")).toBeTruthy();
    expect(active()).toBeNull();
  });

  it("goes back with the left arrow and moves on with a click on the stage", () => {
    const { container } = renderConversation();
    for (let step = 0; step < 4; step++) space();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Line 1 / 3")).toBeTruthy();
    fireEvent.click(container.querySelector("[data-phase]")!);
    expect(screen.getByText("Line 2 / 3")).toBeTruthy();
  });

  it("reveals a line's translation on request, or all of them with the toggle", () => {
    renderConversation();
    for (let step = 0; step < 4; step++) space();
    expect(screen.queryByText("May I take time off?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Translate line 1" }));
    expect(screen.getByText("May I take time off?")).toBeTruthy();
    expect(screen.getByText("Line 2 / 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show translations" }));
    expect(screen.getByText("That is allowed.")).toBeTruthy();
  });

  it("does not read lines aloud when that is off, and starts again from the end", () => {
    renderConversation();
    fireEvent.click(screen.getByRole("button", { name: "Read lines aloud" }));
    for (let step = 0; step < 6; step++) space();
    expect(played).toEqual([]);
    expect(screen.getByText("The end")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Start again/ }));
    expect(screen.getByText(/press Space to begin/)).toBeTruthy();
  });

  it("tints each bubble's new words and opens a word's card on a click, without moving on", async () => {
    renderConversation();
    for (let step = 0; step < 4; step++) space();
    const word = screen.getByRole("button", { name: "vrij" });
    expect(word.hasAttribute("data-subtle")).toBe(true);
    expect(screen.getByRole("button", { name: "mag" })).toBeTruthy();
    fireEvent.mouseEnter(word);
    await act(() => new Promise((done) => setTimeout(done, 250)));
    expect(screen.queryByText("free, off")).toBeNull();
    fireEvent.click(word);
    expect(await screen.findByText("free, off")).toBeTruthy();
    expect(screen.getByText("Line 2 / 3")).toBeTruthy();
    fireEvent.click(screen.getByText("free, off"));
    expect(screen.getByText("Line 2 / 3")).toBeTruthy();
  });

  it("autoplays the dialogue line by line to the end, and stops when stepped", () => {
    renderConversation();
    fireEvent.click(screen.getByRole("button", { name: /Autoplay/ }));
    expect(screen.getByText("Line 1 / 3")).toBeTruthy();
    expect(played).toEqual([clip(0)]);
    expect(screen.getByRole("button", { name: /Stop autoplay/ }).getAttribute("aria-pressed")).toBe("true");
    end();
    expect(screen.getByText("Line 2 / 3")).toBeTruthy();
    end();
    end();
    expect(screen.getByText("The end")).toBeTruthy();
    expect(played).toEqual([clip(0), clip(1), clip(2)]);
    expect(screen.getByRole("button", { name: /Autoplay/ }).getAttribute("aria-pressed")).toBe("false");

    // From the end it starts again at the first line; stepping takes over and stops it where it is.
    fireEvent.click(screen.getByRole("button", { name: /Autoplay/ }));
    expect(screen.getByText("Line 1 / 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Line 2 / 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Autoplay/ }).getAttribute("aria-pressed")).toBe("false");
    end();
    expect(screen.getByText("Line 2 / 3")).toBeTruthy();
  });
});
