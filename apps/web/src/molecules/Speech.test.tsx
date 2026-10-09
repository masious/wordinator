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

  it("plays a dialogue's ready turns in order, marking the turn being spoken, and stops", () => {
    const turn = (index: number) => `turn:${id(22)}:${index}`;
    renderWith({ [turn(0)]: clip("t0"), [turn(2)]: clip("t2") });
    const lines = ["Hallo!", "Hoi.", "Tot ziens."].map((line) => screen.getByText(line).closest("li")!);
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    expect(src()).toBe(clip("t0"));
    expect(lines[0]).toHaveAttribute("aria-current", "true");
    end();
    // The second turn has no clip, so the third follows.
    expect(src()).toBe(clip("t2"));
    expect(lines[0]).not.toHaveAttribute("aria-current");
    expect(lines[2]).toHaveAttribute("aria-current", "true");
    end();
    expect(src()).toBeNull();
    expect(screen.getByRole("button", { name: "Play dialogue" })).toBeInTheDocument();
    // Pressing it again while it plays stops it.
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop dialogue" }));
    expect(src()).toBeNull();
    expect(lines[0]).not.toHaveAttribute("aria-current");
    // Another speaker button stops it too.
    fireEvent.click(screen.getByRole("button", { name: "Play dialogue" }));
    fireEvent.click(within(lines[2]!).getByRole("button", { name: "Play line 3, Anna" }));
    expect(src()).toBe(clip("t2"));
    expect(lines[2]).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Play dialogue" })).toBeInTheDocument();
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
