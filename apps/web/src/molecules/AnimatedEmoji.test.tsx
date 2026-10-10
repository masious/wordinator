import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedEmoji } from "./AnimatedEmoji";

const item = { destroy: vi.fn(), addEventListener: vi.fn((event: string, listener: () => void) => { if (event === "DOMLoaded") queueMicrotask(listener); }) };
const loadAnimation = vi.fn((_options: unknown) => item);
vi.mock("lottie-web", () => ({ default: { loadAnimation: (options: unknown) => loadAnimation(options) } }));
const animation = vi.fn(() => Promise.resolve({ frames: 1 }));
const still = () => Promise.resolve("/globe.svg");

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

const renderEmoji = (playing = false) => render(<MantineProvider><AnimatedEmoji emoji="🌍" still={still} animation={animation} playing={playing} /></MantineProvider>);

describe("AnimatedEmoji", () => {
  it("rests on its still artwork and loads no animation until it plays", async () => {
    const { container } = renderEmoji();
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "/globe.svg"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(animation).not.toHaveBeenCalled();
    expect(loadAnimation).not.toHaveBeenCalled();
  });

  it("plays the animation over the still, and drops it when playing stops", async () => {
    const { container, rerender } = renderEmoji(true);
    await waitFor(() => expect(container.querySelector("[data-animating]")).not.toBeNull());
    expect(loadAnimation).toHaveBeenCalledWith(expect.objectContaining({ renderer: "svg", loop: true, autoplay: true, animationData: { frames: 1 } }));
    rerender(<MantineProvider><AnimatedEmoji emoji="🌍" still={still} animation={animation} /></MantineProvider>);
    expect(item.destroy).toHaveBeenCalled();
    expect(container.querySelector("[data-animating]")).toBeNull();
  });

  it("shows the plain character when the still cannot load or there is none", async () => {
    const { container, getByText } = renderEmoji();
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    fireEvent.error(container.querySelector("img")!);
    expect(getByText("🌍")).toBeInTheDocument();
    cleanup();
    expect(render(<MantineProvider><AnimatedEmoji emoji="🧩" playing /></MantineProvider>).getByText("🧩")).toBeInTheDocument();
  });
});
