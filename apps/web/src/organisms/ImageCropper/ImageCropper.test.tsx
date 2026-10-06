import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ImageUpload } from "../../pages/PhaseFivePages";

const drawImage = vi.fn();

function renderUpload(shape: "square" | "wide" = "square") {
  const onChanged = vi.fn(async () => undefined);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<MantineProvider><QueryClientProvider client={queryClient}>
    <ImageUpload currentUrl={null} name="Ada" uploadPath="/api/settings/avatar" removePath="/api/settings/avatar" onChanged={onChanged} shape={shape} />
  </QueryClientProvider></MantineProvider>);
  return { onChanged };
}

function chooseFile() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["image-bytes"], "photo.png", { type: "image/png" })] } });
}

function uploadedFile() {
  const call = vi.mocked(fetch).mock.calls.find(([path, init]) => path === "/api/settings/avatar" && init?.method === "POST");
  return (call?.[1]?.body as FormData | undefined)?.get("image") as File | undefined;
}

beforeEach(() => {
  drawImage.mockClear();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1600, height: 900, close: vi.fn() })));
  // jsdom has no object URLs, canvas, or bitmaps; stub just enough to exercise the render path.
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:photo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback) { callback(new Blob(["jpeg"], { type: "image/jpeg" })); });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ url: "https://media.test/avatar.jpg" }), { headers: { "content-type": "application/json" } })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("image cropper", () => {
  it("opens on file choice and uploads nothing when cancelled", async () => {
    renderUpload();
    chooseFile();
    const dialog = await screen.findByRole("dialog", { name: "Crop image" });
    expect(within(dialog).getByRole("slider", { name: "Zoom" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crop image" })).not.toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads one 512-pixel JPEG rendered from the original pixels", async () => {
    const { onChanged } = renderUpload();
    chooseFile();
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Crop image" })).getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(uploadedFile()?.type).toBe("image/jpeg");
    // No interaction yet, so the centered square of the 1600×900 source is drawn into the 512×512 output.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 350, 0, 900, 900, 0, 0, 512, 512);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crop image" })).not.toBeInTheDocument());
  });

  it("renders the wide frame at the cover output size", async () => {
    renderUpload("wide");
    chooseFile();
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Crop image" })).getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 50, 1600, 800, 0, 0, 1200, 600));
  });

  it("zooms with the keyboard and resets to the centered fit", async () => {
    renderUpload();
    chooseFile();
    const dialog = await screen.findByRole("dialog", { name: "Crop image" });
    const slider = within(dialog).getByRole("slider", { name: "Zoom" });
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    fireEvent.keyDown(slider.closest("[role=dialog]")!.querySelector("[class*=stage]")!, { key: "+" });
    await waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", "1.1"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", "1"));
  });

  it("keeps the dialog open with an error when the upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "IMAGE_TYPE_INVALID", message: "Bad image." } }), { status: 400, headers: { "content-type": "application/json" } })));
    renderUpload();
    chooseFile();
    const dialog = await screen.findByRole("dialog", { name: "Crop image" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save image" }));
    expect(await within(dialog).findByRole("alert")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Crop image" })).toBeInTheDocument();
  });
});
