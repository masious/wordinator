import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { LessonImageDialog } from "./LessonImageDialog";

const path = "/api/groups/g/courses/c/lessons/l";
const drawImage = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const photo = new File(["image-bytes"], "IMG_2041.HEIC", { type: "image/heic" });

function renderDialog() {
  const onUploaded = vi.fn(); const onCancel = vi.fn();
  render(<MantineProvider><LessonImageDialog path={path} file={photo} onUploaded={onUploaded} onCancel={onCancel} /></MantineProvider>);
  return { onUploaded, onCancel };
}
const uploaded = () => (vi.mocked(fetch).mock.calls[0]?.[1]?.body as FormData).get("image") as File;

beforeEach(() => {
  drawImage.mockClear();
  // jsdom loads no images and has no canvas or bitmaps; stub just enough for the render path.
  vi.stubGlobal("Image", class { naturalWidth = 3000; naturalHeight = 2000; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_: string) { queueMicrotask(() => this.onload?.()); } });
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3000, height: 2000, close: vi.fn() })));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:photo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, fillRect: vi.fn(), fillStyle: "" } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback) { callback(new Blob(["jpeg"], { type: "image/jpeg" })); });
  vi.stubGlobal("fetch", vi.fn(async () => json({ key: "courses/c/lessons/l/abc.jpg", url: "https://media.test/courses/c/lessons/l/abc.jpg", width: 1600, height: 1067 }, 201)));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Lesson image dialog", () => {
  it("keeps the whole image by default, re-encodes it within the size limit, and uploads it to the lesson", async () => {
    const { onUploaded } = renderDialog();
    const insert = screen.getByRole("button", { name: "Insert image" });
    await waitFor(() => expect(insert).toBeEnabled());
    fireEvent.click(insert);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ url: "https://media.test/courses/c/lessons/l/abc.jpg" })));
    expect(fetch).toHaveBeenCalledWith(`${path}/images`, expect.objectContaining({ method: "POST" }));
    expect(uploaded()).toMatchObject({ name: "lesson-image.jpg", type: "image/jpeg" });
    // The whole 3000×2000 source is drawn into a canvas capped at 1600 px on the longest edge.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 3000, 2000, 0, 0, 1600, 1067);
  });

  it("offers crop shapes", () => {
    renderDialog();
    for (const label of ["Whole", "4:3", "16:9", "Square", "3:4"]) expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
  });

  it("stays open with the server's reason when the upload is refused", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: { code: "IMAGE_TYPE_INVALID", message: "No." } }, 400));
    const { onUploaded } = renderDialog();
    const insert = screen.getByRole("button", { name: "Insert image" });
    await waitFor(() => expect(insert).toBeEnabled());
    fireEvent.click(insert);
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a static PNG, JPEG, or WebP image.");
    expect(onUploaded).not.toHaveBeenCalled();
    expect(insert).toBeInTheDocument();
  });

  it("cancels without uploading", () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
