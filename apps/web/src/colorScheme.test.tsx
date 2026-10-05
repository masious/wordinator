import { localStorageColorSchemeManager, MantineProvider } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n";
import { COLOR_SCHEME_STORAGE_KEY, DARK_THEME_COLOR, ThemePreferenceControl, ThemeRuntimeSync } from "./colorScheme";

type SchemeListener = (event: MediaQueryListEvent) => void;

function renderTheme() {
  const manager = localStorageColorSchemeManager({ key: COLOR_SCHEME_STORAGE_KEY });
  return render(
    <MantineProvider colorSchemeManager={manager} defaultColorScheme="auto">
      <ThemeRuntimeSync />
      <ThemePreferenceControl />
    </MantineProvider>,
  );
}

describe("theme preference", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-mantine-color-scheme");
    document.documentElement.style.colorScheme = "";
    document.head.innerHTML = '<meta name="theme-color" content="#f5ede2">';
  });

  it("selects and persists an explicit accessible preference", async () => {
    renderTheme();
    expect(screen.getByRole("radiogroup", { name: "Theme preference" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("dark"));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute("content", DARK_THEME_COLOR);
  });

  it("tracks operating-system changes while System is active", async () => {
    let dark = false;
    const listeners = new Set<SchemeListener>();
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: dark,
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: SchemeListener) => listeners.add(listener),
      removeEventListener: (_event: string, listener: SchemeListener) => listeners.delete(listener),
      addListener: (listener: SchemeListener) => listeners.add(listener),
      removeListener: (listener: SchemeListener) => listeners.delete(listener),
      dispatchEvent: vi.fn(),
    })));

    renderTheme();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    dark = true;
    act(() => listeners.forEach((listener) => listener({ matches: true, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent)));

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "dark"));
    expect(screen.getByText("System preference · currently Dark")).toBeVisible();
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBeNull();
  });
});
