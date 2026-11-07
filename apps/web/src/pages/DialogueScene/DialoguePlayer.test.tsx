import { MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { SpeechScope, stopSpeech } from "../../molecules/Speech";
import { HovercardDemoContext } from "../TempHovercard/WordHovercard";
import { DialoguePlayer } from "./DialoguePlayer";

const blockId = "94000000-0000-4000-8000-000000000001";
const turns = [
  { speaker: "Ober", text: "Hebt u een reservering?", translation: "Do you have a reservation?" },
  { speaker: "Daan", text: "Ja, voor vier personen.", translation: "Yes, for four people." },
  { speaker: "Sofia", text: "Bij het raam, graag.", translation: null },
];
const clip = (line: number) => `https://media.example/speech/t${line}.mp3`;
const raam = { id: "95000000-0000-4000-8000-000000000001", term: "het raam", meaning: "window" };
const spans = [[], [], [{ start: 4, end: 12, wordId: raam.id }]];

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

function renderPlayer(props: { initialLine?: number; clips?: boolean; onLineChange?: (index: number) => void; onExit?: () => void; onContinue?: () => void } = {}) {
  const { clips = true, ...rest } = props;
  return render(<MantineProvider>
    <HovercardDemoContext.Provider value={{ toneStyle: {}, sayWords: false, words: new Map([[raam.id, raam]]), clickOnly: true }}>
      <SpeechScope resolve={(key) => { const match = /^turn:.+:(\d+)$/.exec(key); return clips && match ? clip(Number(match[1])) : null; }}>
        <DialoguePlayer blockId={blockId} title="De rekening" scene="Een tafel bij het raam" intro={[]} turns={turns} backdrop="location.jpg"
          background="scene.jpg" portraits={{ daan: "daan.jpg" }} spans={spans} words={[raam]} upNext="Words" {...rest} />
      </SpeechScope>
    </HovercardDemoContext.Provider>
  </MantineProvider>);
}
// Finishes the clip playing now, as the audio element would.
const end = () => act(() => { (globalThis as { __player?: HTMLMediaElement }).__player?.dispatchEvent(new Event("ended")); });
const current = () => screen.getByRole("button", { name: /^Line \d, / , current: true });

describe("DialoguePlayer", () => {
  it("plays the lines one after another, reporting each line it reaches, and suggests the next section at the end", () => {
    const onLineChange = vi.fn();
    const onContinue = vi.fn();
    renderPlayer({ onLineChange, onContinue });
    expect(screen.getByRole("region", { name: "Dialogue player" })).toBeInTheDocument();
    expect(onLineChange).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(played).toEqual([clip(0)]);
    end();
    expect(played).toEqual([clip(0), clip(1)]);
    expect(onLineChange).toHaveBeenLastCalledWith(1);
    expect(current()).toHaveAccessibleName("Line 2, Daan");
    end();
    end();
    expect(screen.getByText("Up next in the lesson")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continue lesson/ }));
    expect(onContinue).toHaveBeenCalled();
  });

  it("steps with the transport and the scrubber, and starts on a given line", () => {
    renderPlayer({ initialLine: 1 });
    expect(current()).toHaveAccessibleName("Line 2, Daan");
    fireEvent.click(screen.getByRole("button", { name: "Next line" }));
    expect(current()).toHaveAccessibleName("Line 3, Sofia");
    expect(screen.getByRole("button", { name: "Next line" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Line 1, Ober" }));
    expect(current()).toHaveAccessibleName("Line 1, Ober");
    expect(played).toEqual([]);
  });

  it("goes back to the lesson, and cannot play a dialogue without speech", () => {
    const onExit = vi.fn();
    renderPlayer({ clips: false, onExit });
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to lesson" }));
    expect(onExit).toHaveBeenCalled();
  });

  it("puts the cast over a cover without its own scene, the latest speaker on each side, the one speaking lit", () => {
    const { container } = renderPlayer({ initialLine: 1 });
    const members = () => [...container.querySelectorAll("[data-side]")].filter((element) => element.closest("[data-cast]"));
    expect(members().map((element) => [element.textContent, element.getAttribute("data-side"), element.hasAttribute("data-speaking")]))
      .toEqual([["OOber", "start", false], ["Daan", "end", true]]);
    expect(members()[1]!.querySelector("img")).toHaveAttribute("src", "daan.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Next line" }));
    expect(members().map((element) => [element.textContent, element.hasAttribute("data-speaking")])).toEqual([["SSofia", true], ["Daan", false]]);
  });

  it("lists the dialogue's new words and hides translations from the menu", () => {
    renderPlayer();
    expect(screen.getByRole("heading", { name: "New words in this dialogue" })).toBeInTheDocument();
    expect(screen.getAllByText("Do you have a reservation?").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide translations" }));
    expect(screen.queryByText("Do you have a reservation?")).toBeNull();
  });
});
