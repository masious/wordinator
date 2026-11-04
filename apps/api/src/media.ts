// Public R2 images: type and size sniffing shared by every upload route, and key-to-URL expansion. Keys are stored;
// readers receive URLs, so a media base URL change never breaks stored records.
export const IMAGE_MAX_BYTES = 1_048_576;
export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export const mediaUrlFromBase = (base: string, key: string | null) => key
  ? `${base.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`
  : null;

export function imageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      const chunk = new TextDecoder("latin1").decode(bytes.slice(offset + 4, offset + 8));
      if (chunk === "acTL") return null;
      if (length > bytes.length - offset - 12) break;
      offset += length + 12;
    }
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 21 && new TextDecoder("latin1").decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder("latin1").decode(bytes.slice(8, 12)) === "WEBP") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = new TextDecoder("latin1").decode(bytes.slice(offset, offset + 4));
      const length = view.getUint32(offset + 4, true);
      if (chunk === "ANIM" || chunk === "ANMF" || (chunk === "VP8X" && offset + 8 < bytes.length && Boolean(bytes[offset + 8]! & 0x02))) return null;
      if (length > bytes.length - offset - 8) break;
      offset += 8 + length + (length % 2);
    }
    return "image/webp";
  }
  return null;
}

// Reads the pixel size from the image header; null when the header is truncated.
export function imageSize(bytes: Uint8Array, type: ImageType): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = (width: number, height: number) => width > 0 && height > 0 ? { width, height } : null;
  if (type === "image/png") return bytes.length >= 24 ? size(view.getUint32(16), view.getUint32(20)) : null;
  if (type === "image/jpeg") {
    for (let offset = 2; offset + 9 <= bytes.length;) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1]!;
      if (marker === 0xff) { offset += 1; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return size(view.getUint16(offset + 7), view.getUint16(offset + 5));
      offset += 2 + view.getUint16(offset + 2);
    }
    return null;
  }
  const chunk = new TextDecoder("latin1").decode(bytes.slice(12, 16));
  if (chunk === "VP8 " && bytes.length >= 30) return size(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  if (chunk === "VP8L" && bytes.length >= 25) {
    const [b0, b1, b2, b3] = [bytes[21]!, bytes[22]!, bytes[23]!, bytes[24]!];
    return size(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
  }
  if (chunk === "VP8X" && bytes.length >= 30) {
    const read24 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
    return size(1 + read24(24), 1 + read24(27));
  }
  return null;
}

// Checks an uploaded form value and stores it under `{prefix}/{uuid}.{ext}`. Objects are immutable: a replacement always
// gets a new key. Unknown sizes fall back to 1×1.
export type StoredImage = { key: string; width: number; height: number };
export type ImageRefusal = { error: "IMAGE_REQUIRED" | "IMAGE_SIZE_INVALID" | "IMAGE_TYPE_INVALID"; message: string };
export async function storeImage(media: R2Bucket, prefix: string, value: unknown): Promise<StoredImage | ImageRefusal> {
  if (!(value instanceof File)) return { error: "IMAGE_REQUIRED", message: "Choose an image to upload." };
  if (value.size < 1 || value.size > IMAGE_MAX_BYTES) return { error: "IMAGE_SIZE_INVALID", message: "Images must be no larger than 1 MB." };
  const buffer = await value.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const type = imageType(bytes);
  if (!type) return { error: "IMAGE_TYPE_INVALID", message: "Choose a static PNG, JPEG, or WebP image." };
  const extension = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
  const key = `${prefix}/${crypto.randomUUID()}.${extension}`;
  await media.put(key, buffer, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  const measured = imageSize(bytes, type);
  return { key, width: measured?.width ?? 1, height: measured?.height ?? 1 };
}
