import { createTheme, MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { AvatarEditor } from "./AvatarEditor";

// jsdom has no layout, so Mantine would treat the dropdown as detached from its trigger and hide it.
const theme = createTheme({ components: { Menu: { defaultProps: { hideDetached: false, transitionProps: { duration: 0 } } } } });

function renderEditor(src: string | null) {
  const onChanged = vi.fn(async () => undefined);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<MantineProvider theme={theme}><QueryClientProvider client={queryClient}>
    <AvatarEditor name="Ada Lovelace" src={src} onChanged={onChanged} />
  </QueryClientProvider></MantineProvider>);
  return { onChanged };
}

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:photo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AvatarEditor", () => {
  it("opens the file picker straight from the edit button when there is no photo", () => {
    renderEditor(null);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Choose a profile photo" }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows the public-image notice in the cropper, not on the page", async () => {
    renderEditor(null);
    expect(screen.queryByText(/public to anyone/)).not.toBeInTheDocument();
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });
    const dialog = await screen.findByRole("dialog", { name: "Crop image" });
    expect(dialog).toHaveTextContent("Images are public to anyone who has their URL.");
  });

  it("offers replace and remove when a photo exists, and removes it", async () => {
    const { onChanged } = renderEditor("https://media.test/avatar.jpg");
    expect(screen.queryByRole("button", { name: "Choose a profile photo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change profile photo" }));
    expect(await screen.findByRole("menuitem", { name: "Upload new photo" })).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove photo" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/settings/avatar", expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
