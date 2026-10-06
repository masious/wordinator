export type CropArea = { x: number; y: number; width: number; height: number };
export type CropOutput = { width: number; height: number };

export const SQUARE_OUTPUT: CropOutput = { width: 512, height: 512 };
export const WIDE_OUTPUT: CropOutput = { width: 1200, height: 600 };
export const MAX_SOURCE_BYTES = 1_048_576;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.1;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 100) / 100));

// The largest area of the output's aspect ratio, centered in the source; used before the person adjusts anything.
export function centeredCropArea(sourceWidth: number, sourceHeight: number, output: CropOutput): CropArea {
  const scale = Math.min(sourceWidth / output.width, sourceHeight / output.height);
  const width = output.width * scale; const height = output.height * scale;
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
}

// Keeps a chosen area inside the source so the output never contains empty edges, even if the cropper reports rounding drift.
export function clampCropArea(area: CropArea, sourceWidth: number, sourceHeight: number): CropArea {
  const width = Math.min(Math.max(area.width, 1), sourceWidth);
  const height = Math.min(Math.max(area.height, 1), sourceHeight);
  return {
    x: Math.min(Math.max(area.x, 0), sourceWidth - width),
    y: Math.min(Math.max(area.y, 0), sourceHeight - height),
    width, height,
  };
}

// Renders the chosen area and re-encodes it so uploads never carry the original file's metadata.
export async function renderCroppedImage(file: File, area: CropArea | null, output: CropOutput): Promise<File> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("IMAGE_SIZE_INVALID");
  const bitmap = await createImageBitmap(file);
  const source = area ? clampCropArea(area, bitmap.width, bitmap.height) : centeredCropArea(bitmap.width, bitmap.height, output);
  const canvas = document.createElement("canvas"); canvas.width = output.width; canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("IMAGE_PROCESSING_FAILED"); }
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, output.width, output.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("IMAGE_PROCESSING_FAILED");
  return new File([blob], "cropped.jpg", { type: "image/jpeg" });
}
