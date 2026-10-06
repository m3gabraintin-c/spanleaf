import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_EDGE, MAX_UPLOAD_BYTES, THUMB_EDGE } from "./formats";
import { DataError } from "@/data/types";

interface PreparedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  mimeType: string;
}

function scaleToEdge(w: number, h: number, edge: number) {
  const longest = Math.max(w, h);
  if (longest <= edge) return { w, h };
  const k = edge / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new DataError("DECODE_FAILED", "Couldn't encode the image."))), mime, quality),
  );
}

async function render(bitmap: ImageBitmap, w: number, h: number, mime: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new DataError("DECODE_FAILED", "Couldn't prepare the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await toBlob(canvas, mime, mime === "image/jpeg" ? 0.92 : undefined);
  // Release the pixel buffer now. Phones run out of memory on big photos.
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

/**
 * Checks the file, decodes it (respecting EXIF orientation), shrinks it to a 4096 px long edge
 * and makes a 512 px thumbnail. Runs in the browser before upload.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new DataError("UNSUPPORTED_FILE", "That file type isn't supported. Use a JPEG, PNG or WebP image.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new DataError("FILE_TOO_LARGE", "That image is over 25 MB. Try a smaller one.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new DataError("DECODE_FAILED", "That image couldn't be opened. It may be damaged.");
  }

  try {
    // JPEG stays JPEG. PNG and WebP become PNG so transparency survives.
    const mime = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const full = scaleToEdge(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);
    const thumb = scaleToEdge(bitmap.width, bitmap.height, THUMB_EDGE);
    const fullBlob = await render(bitmap, full.w, full.h, mime);
    const thumbBlob = await render(bitmap, thumb.w, thumb.h, mime);
    return { full: fullBlob, thumb: thumbBlob, width: full.w, height: full.h, mimeType: mime };
  } finally {
    bitmap.close();
  }
}
