import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveRecognizer, matchesTerm, RECOGNIZER_STORAGE_KEY, setRecognizer, useRecognizerPreference } from "./speechRecognition";

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
