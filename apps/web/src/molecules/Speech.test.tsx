import { MantineProvider } from "@mantine/core";
import { LESSON_DOCUMENT_SCHEMA_VERSION, type LessonBlockOf, type LessonDocument as LessonDocumentData } from "@wordinator/contracts/lesson-document";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { DialogueBlock, LessonDocument } from "../organisms/LessonDocument/LessonDocument";
import { WordRecap } from "../organisms/WordRecap/WordRecap";
import { lessonSpeech, SpeechScope, stopSpeech } from "./Speech";

const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const text = (value: string) => ({ type: "text" as const, text: value, styles: {} });
const hund = { id: id(10), term: "der Hund", meaning: "the dog", example: "Der Hund bellt." };
const katze = { id: id(11), term: "die Katze", meaning: "the cat" };
const document = {
  schemaVersion: LESSON_DOCUMENT_SCHEMA_VERSION,
  blocks: [
    { id: id(20), type: "vocabulary", props: { data: JSON.stringify({ words: [hund, katze] }) }, children: [] },
    { id: id(21), type: "example", props: { translation: "The dog barks.", note: "" }, content: [text("Der Hund bellt.")], children: [] },
    { id: id(22), type: "dialogue", props: { turns: JSON.stringify([
      { speaker: "Anna", text: "Hallo!" }, { speaker: "Ben", text: "Hoi." }, { speaker: "Anna", text: "Tot ziens." },
    ]) }, children: [] },
  ],
} as LessonDocumentData;
const clip = (name: string) => `https://media.example/speech/${name}.mp3`;

// jsdom has no media playback: play() resolves (or rejects with `playError`) and reports playing, and `end()` finishes the clip.
let player: HTMLMediaElement | null = null;
let playError: DOMException | null = null;
const src = () => player?.getAttribute("src") ?? null;
const end = () => act(() => { player!.dispatchEvent(new Event("ended")); });

beforeEach(() => {
  playError = null;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    player = this;
    if (playError) return Promise.reject(playError);
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});
afterEach(() => { act(() => stopSpeech()); cleanup(); vi.restoreAllMocks(); });

function renderWith(speech: Record<string, string> | null, node: ReactNode = <LessonDocument document={document} />) {
  return render(<MantineProvider>{speech ? <SpeechScope resolve={(key) => speech[key] ?? null}>{node}</SpeechScope> : node}</MantineProvider>);
}

describe("Lesson speech playback", () => {
  it("shows a speaker button only for items whose clip is ready", () => {
    renderWith({ [`word:${hund.id}`]: clip("hund"), [`example:${id(21)}`]: clip("example"), [`turn:${id(22)}:1`]: clip("turn1") });
    expect(screen.getByRole("button", { name: "Play pronunciation of der Hund" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play pronunciation of die Katze" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play the example sentence" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play line 1, Anna" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play line 2, Ben" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play dialogue" })).toBeInTheDocument();
    // The word's example has no clip, so its opened row has no button.
    fireEvent.click(screen.getByRole("button", { name: "Show more about der Hund" }));
    expect(screen.queryByRole("button", { name: "Play the example for der Hund" })).not.toBeInTheDocument();
  });

  it("shows no speaker buttons outside a scope or before any clip is ready", () => {
    renderWith(null);
    expect(screen.queryByRole("button", { name: /^Play/ })).not.toBeInTheDocument();
    cleanup();
    renderWith({});
    expect(screen.queryByRole("button", { name: /^Play/ })).not.toBeInTheDocument();
  });

  it("plays one clip at a time and stops on a second press", () => {
    renderWith({ [`word:${hund.id}`]: clip("hund"), [`word:${katze.id}`]: clip("katze"), [`wordExample:${hund.id}`]: clip("hund-example") });
    const dog = screen.getByRole("button", { name: "Play pronunciation of der Hund" });
    const cat = screen.getByRole("button", { name: "Play pronunciation of die Katze" });
    fireEvent.click(dog);
    expect(src()).toBe(clip("hund"));
    expect(dog).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(cat);
    expect(src()).toBe(clip("katze"));
    expect(dog).toHaveAttribute("aria-pressed", "false");
    expect(cat).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(cat);
    expect(src()).toBeNull();
    expect(cat).toHaveAttribute("aria-pressed", "false");
    // A finished clip releases its button, and never starts another.
    fireEvent.click(screen.getByRole("button", { name: "Show more about der Hund" }));
    const example = screen.getByRole("button", { name: "Play the example for der Hund" });
    fireEvent.click(example);
    expect(src()).toBe(clip("hund-example"));
    end();
    expect(example).toHaveAttribute("aria-pressed", "false");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3);
  });

  it("plays a dialogue's ready turns in order, marking the turn being spoken, and stops at the end", () => {
    const turn = (index: number) => `turn:${id(22)}:${index}`;
    renderWith({ [turn(0)]: clip("t0"), [turn(2)]: clip("t2") });
    const lines = ["Hallo!", "Hoi.", "Tot ziens."].map((line) => screen.getByText(line).closest("li")!);
    const progress = screen.getByRole("slider", { name: "Dialogue progress" });
    expect(progress).toHaveAttribute("aria-valuetext", "Not started");
    expect(screen.getByRole("button", { name: "Previous line" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop dialogue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    expect(src()).toBe(clip("t0"));
    expect(lines[0]).toHaveAttribute("aria-current", "true");
    expect(progress).toHaveAttribute("aria-valuetext", "Line 1 of 2, Anna");
    end();
    // The second turn has no clip, so the third follows.
    expect(src()).toBe(clip("t2"));
    expect(lines[0]).not.toHaveAttribute("aria-current");
    expect(lines[2]).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Next line" })).toBeDisabled();
    end();
    expect(src()).toBeNull();
    expect(screen.getByRole("button", { name: "Play dialogue" })).toBeInTheDocument();
    expect(progress).toHaveAttribute("aria-valuetext", "Not started");
    // Stop ends it at once, playing or paused, and the next play starts from the first line.
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    end();
    fireEvent.click(screen.getByRole("button", { name: "Stop dialogue" }));
    expect(src()).toBeNull();
    expect(lines[2]).not.toHaveAttribute("aria-current");
    expect(progress).toHaveAttribute("aria-valuetext", "Not started");
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause dialogue" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop dialogue" }));
    expect(src()).toBeNull();
    expect(screen.getByRole("button", { name: "Play dialogue" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    expect(src()).toBe(clip("t0"));
    act(() => stopSpeech());
    // Another speaker button stops it.
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    fireEvent.click(within(lines[2]!).getByRole("button", { name: "Play line 3, Anna" }));
    expect(src()).toBe(clip("t2"));
    expect(lines[2]).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Play dialogue" })).toBeInTheDocument();
  });

  it("pauses and resumes a dialogue where it was", () => {
    renderWith({ [`turn:${id(22)}:0`]: clip("t0"), [`turn:${id(22)}:1`]: clip("t1") });
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    end();
    expect(src()).toBe(clip("t1"));
    fireEvent.click(screen.getByRole("button", { name: "Pause dialogue" }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    // The paused line stays marked and its clip stays loaded.
    expect(screen.getByText("Hoi.").closest("li")).toHaveAttribute("aria-current", "true");
    expect(src()).toBe(clip("t1"));
    fireEvent.click(screen.getByRole("button", { name: "Resume dialogue" }));
    expect(src()).toBe(clip("t1"));
    expect(screen.getByRole("button", { name: "Pause dialogue" })).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3);
  });

  it("moves to the previous, next, or a chosen line and carries on from there", () => {
    const urls = { [`turn:${id(22)}:0`]: clip("t0"), [`turn:${id(22)}:1`]: clip("t1"), [`turn:${id(22)}:2`]: clip("t2") };
    renderWith(urls);
    const progress = screen.getByRole("slider", { name: "Dialogue progress" });
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    fireEvent.click(screen.getByRole("button", { name: "Next line" }));
    expect(src()).toBe(clip("t1"));
    fireEvent.click(screen.getByRole("button", { name: "Previous line" }));
    expect(src()).toBe(clip("t0"));
    // Previous on the first line starts it again.
    fireEvent.click(screen.getByRole("button", { name: "Previous line" }));
    expect(src()).toBe(clip("t0"));
    // A jump from a paused dialogue plays.
    fireEvent.click(screen.getByRole("button", { name: "Pause dialogue" }));
    fireEvent.keyDown(progress, { key: "End" });
    expect(src()).toBe(clip("t2"));
    expect(screen.getByRole("button", { name: "Pause dialogue" })).toBeInTheDocument();
    fireEvent.keyDown(progress, { key: "ArrowLeft" });
    expect(src()).toBe(clip("t1"));
    end();
    expect(src()).toBe(clip("t2"));
    // Pressing the bar starts at the line under the pointer, also before the dialogue has started.
    act(() => stopSpeech());
    vi.spyOn(progress, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300, top: 0, right: 300, bottom: 44, height: 44, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(progress, { clientX: 150 });
    expect(src()).toBe(clip("t1"));
    expect(progress).toHaveAttribute("aria-valuetext", "Line 2 of 3, Ben");
  });

  it("fills the progress bar through finished lines and the current clip", () => {
    renderWith({ [`turn:${id(22)}:0`]: clip("t0"), [`turn:${id(22)}:1`]: clip("t1") });
    const fills = () => [...screen.getByRole("slider").querySelectorAll<HTMLElement>("span > span")].map((fill) => fill.style.transform);
    expect(fills()).toEqual(["scaleX(0)", "scaleX(0)"]);
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    end();
    Object.defineProperty(player!, "duration", { configurable: true, value: 2 });
    Object.defineProperty(player!, "currentTime", { configurable: true, value: 1 });
    act(() => { player!.dispatchEvent(new Event("timeupdate")); });
    expect(fills()).toEqual(["scaleX(1)", "scaleX(0.5)"]);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("plays only the turns shown so far in the player", () => {
    const dialogue = document.blocks[2] as LessonBlockOf<"dialogue">;
    renderWith({ [`turn:${id(22)}:0`]: clip("t0"), [`turn:${id(22)}:2`]: clip("t2") }, <DialogueBlock block={dialogue} upTo={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    expect(src()).toBe(clip("t0"));
    end();
    expect(src()).toBeNull();
    cleanup();
    renderWith({ [`turn:${id(22)}:2`]: clip("t2") }, <DialogueBlock block={dialogue} upTo={1} />);
    expect(screen.queryByRole("button", { name: "Play dialogue" })).not.toBeInTheDocument();
  });

  it("says when a clip cannot play", async () => {
    playError = new DOMException("blocked", "NotSupportedError");
    renderWith({ [`word:${hund.id}`]: clip("hund") });
    const dog = screen.getByRole("button", { name: "Play pronunciation of der Hund" });
    await act(async () => { fireEvent.click(dog); });
    expect(await screen.findByRole("alert")).toHaveTextContent("The audio could not be played.");
    expect(dog).toHaveAttribute("aria-pressed", "false");
    // An interrupted play is not a failure.
    cleanup();
    playError = new DOMException("interrupted", "AbortError");
    renderWith({ [`word:${hund.id}`]: clip("hund") });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play pronunciation of der Hund" })); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reads indexed words' clips from the word and lesson words' from the scope", () => {
    const indexed = { ...hund, lessonId: id(3), forms: null, note: null, speech: { term: clip("indexed"), example: null } };
    renderWith({ [`word:${hund.id}`]: clip("scoped") }, <WordRecap words={[indexed]} />);
    fireEvent.click(screen.getByRole("button", { name: "Play pronunciation of der Hund" }));
    expect(src()).toBe(clip("indexed"));
    cleanup();
    const lessonWord = { id: hund.id, term: hund.term, meaning: hund.meaning, forms: null, example: hund.example, note: null };
    renderWith({ [`word:${hund.id}`]: clip("scoped"), [`wordExample:${hund.id}`]: clip("scoped-example") }, <WordRecap words={[lessonWord]} />);
    fireEvent.click(screen.getByRole("button", { name: "Play pronunciation of der Hund" }));
    expect(src()).toBe(clip("scoped"));
    // The back repeats the term and adds the example once revealed.
    fireEvent.click(screen.getByRole("button", { name: "Show meaning" }));
    expect(screen.getAllByRole("button", { name: "Play pronunciation of der Hund", hidden: true })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Play the example for der Hund" })).toBeInTheDocument();
  });

  it("takes a draft preview's ready clips from the draft", () => {
    const draftSpeech = { a: { status: "ready" as const, url: clip("a") }, b: { status: "pending" as const, url: null }, c: { status: "failed" as const, url: null } };
    expect(lessonSpeech({ document: null, speech: {}, draftSpeech })).toEqual({ a: clip("a") });
    expect(lessonSpeech({ document, speech: { x: clip("x") }, draftSpeech })).toEqual({ x: clip("x") });
    expect(lessonSpeech({ document: null, speech: {}, draftSpeech: null })).toEqual({});
  });
});
