import { PICTURE_TYPES } from "./carouselModel";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 2400;

export type Picture = { src: string; width: number; height: number; name: string };

/**
 * Reads a photo from a file and shrinks it so a project stays small enough to save in the browser:
 * at most 2400 pixels on the longest side. Throws a message fit for the person using the app.
 */
export const preparePicture = async (file: File): Promise<Picture> => {
  if (!PICTURE_TYPES.includes(file.type)) throw new Error(`${file.name} isn't a JPEG, PNG or WebP picture.`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 25 MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} couldn't be opened. It may be damaged.`);
  }
  const k = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * k));
  const height = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare pictures.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const keepsTransparency = file.type !== "image/jpeg";
  return {
    src: keepsTransparency ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88),
    width,
    height,
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Photo",
  };
};
