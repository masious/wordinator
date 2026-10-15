import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveRecognizer, matchesTerm, pcmResampler, readAssessment, RECOGNIZER_STORAGE_KEY, setRecognizer, useRecognizerPreference } from "./speechRecognition";

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

describe("choosing a recognizer", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
  const withMicrophone = () => vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn() } });

  it("uses the browser's recognizer by default and Microsoft when chosen", () => {
    vi.stubGlobal("webkitSpeechRecognition", class {}); withMicrophone();
    expect(effectiveRecognizer("browser")).toBe("browser");
    expect(effectiveRecognizer("microsoft")).toBe("microsoft");
  });

  it("falls back to Microsoft where the browser has no recognizer, and to nothing without a microphone", () => {
    vi.stubGlobal("webkitSpeechRecognition", undefined); vi.stubGlobal("SpeechRecognition", undefined);
    expect(effectiveRecognizer("browser")).toBeNull();
    withMicrophone();
    expect(effectiveRecognizer("browser")).toBe("microsoft");
  });

  it("keeps the choice on this device and tells listeners", () => {
    const { result } = renderHook(() => useRecognizerPreference());
    expect(result.current).toBe("browser");
    act(() => setRecognizer("microsoft"));
    expect(result.current).toBe("microsoft");
    expect(localStorage.getItem(RECOGNIZER_STORAGE_KEY)).toBe("microsoft");
    act(() => setRecognizer("browser"));
    expect(localStorage.getItem(RECOGNIZER_STORAGE_KEY)).toBeNull();
  });
});

describe("readAssessment", () => {
  it("reads whole-answer and per-word scores from Azure's detailed result", () => {
    const json = JSON.stringify({ NBest: [{
      Display: "Een feest geven.",
      PronunciationAssessment: { AccuracyScore: 88.4, FluencyScore: 97, CompletenessScore: 100, PronScore: 86.2 },
      Words: [
        { Word: "een", PronunciationAssessment: { AccuracyScore: 99, ErrorType: "None" } },
        { Word: "feest", PronunciationAssessment: { AccuracyScore: 91, ErrorType: "None" } },
        { Word: "geven", PronunciationAssessment: { AccuracyScore: 54, ErrorType: "Mispronunciation" } },
      ],
    }] });
    expect(readAssessment(json)).toEqual({
      overall: 86, accuracy: 88, fluency: 97, completeness: 100,
      words: [{ word: "een", accuracy: 99, error: "none" }, { word: "feest", accuracy: 91, error: "none" }, { word: "geven", accuracy: 54, error: "mispronunciation" }],
    });
  });

  it("accepts scores directly on the alternative, and names missed and extra words", () => {
    const json = JSON.stringify({ NBest: [{ AccuracyScore: 70, FluencyScore: 80, CompletenessScore: 50, PronScore: 65, Words: [
      { Word: "zin", AccuracyScore: 0, ErrorType: "Omission" }, { Word: "hebben", AccuracyScore: 80, ErrorType: "None" }, { Word: "uh", AccuracyScore: 40, ErrorType: "Insertion" },
    ] }] });
    expect(readAssessment(json)?.words).toEqual([
      { word: "zin", accuracy: null, error: "omission" }, { word: "hebben", accuracy: 80, error: "none" }, { word: "uh", accuracy: 40, error: "insertion" },
    ]);
  });

  it("gives nothing for a result without an assessment", () => {
    expect(readAssessment(JSON.stringify({ NBest: [{ Display: "zondag" }] }))).toBeNull();
    expect(readAssessment("not json")).toBeNull();
    expect(readAssessment(undefined)).toBeNull();
  });
});

describe("pcmResampler", () => {
  it("turns 48 kHz float samples into 16 kHz 16-bit PCM", () => {
    const resample = pcmResampler(48_000);
    const pcm = new Int16Array(resample(new Float32Array(48).fill(0.5)));
    expect(pcm).toHaveLength(16);
    expect([...pcm].every((sample) => sample === Math.trunc(0.5 * 0x7fff))).toBe(true);
    expect(new Int16Array(resample(new Float32Array(3).fill(-1)))).toEqual(new Int16Array([-0x8000]));
  });

  it("carries the remainder between chunks at uneven rates", () => {
    const resample = pcmResampler(44_100);
    let total = 0;
    for (let chunk = 0; chunk < 100; chunk++) total += resample(new Float32Array(441)).byteLength / 2;
    expect(Math.abs(total - 16_000)).toBeLessThanOrEqual(1);
  });
});
