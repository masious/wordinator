import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { RecognizerPreferenceControl } from "./RecognizerPreferenceControl";
import { RECOGNIZER_STORAGE_KEY } from "./speechRecognition";

const renderControl = () => render(<MantineProvider><RecognizerPreferenceControl /></MantineProvider>);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("Speech recognition setting", () => {
  it("defaults to the browser and switches to Microsoft on this device", () => {
    vi.stubGlobal("webkitSpeechRecognition", class {});
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn() } });
    renderControl();
    expect(screen.getByRole("radio", { name: "Browser" })).toBeChecked();
    expect(screen.getByText("Your browser listens on this device.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Microsoft" }));
    expect(screen.getByRole("radio", { name: "Microsoft" })).toBeChecked();
    expect(screen.getByText("Microsoft Azure listens on this device.")).toBeInTheDocument();
    expect(localStorage.getItem(RECOGNIZER_STORAGE_KEY)).toBe("microsoft");
  });

  it("says Microsoft listens where the browser has no recognizer of its own", () => {
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn() } });
    renderControl();
    expect(screen.getByText(/This browser has no speech recognition of its own/)).toBeInTheDocument();
  });
});
