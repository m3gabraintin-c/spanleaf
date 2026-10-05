/**
 * Post formats. The recon couldn't confirm which formats the original offers, so these
 * four are our pick. Check Instagram's current specs before launch. To change a format,
 * edit this file and the check constraint in schema.sql.
 */
export const SLIDE_WIDTH = 1080;

export const FORMATS = {
  portrait_4_5: { label: "4:5", name: "Portrait 4:5", width: 1080, height: 1350 },
  portrait_3_4: { label: "3:4", name: "Portrait 3:4", width: 1080, height: 1440 },
  square: { label: "1:1", name: "Square", width: 1080, height: 1080 },
  story_9_16: { label: "9:16", name: "Story", width: 1080, height: 1920 },
} as const;

export type FormatKey = keyof typeof FORMATS;
export const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];

export const MAX_SLIDES_FREE = 10;
export const MAX_SLIDES_PREMIUM = 20;

/** Most photos one batch takes, whether added in the editor or used to start a carousel. */
export const MAX_BATCH_PHOTOS = 30;
/** Uploads running at once. Phones run out of memory resizing many large photos together. */
export const UPLOAD_CONCURRENCY = 3;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 4096;
export const THUMB_EDGE = 512;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function canvasSize(format: FormatKey, slideCount: number) {
  const f = FORMATS[format];
  return { width: f.width * slideCount, height: f.height };
}

/** Which slide (0 based) a canvas x coordinate falls in, clamped to the canvas. */
export function slideIndexAt(x: number, slideCount: number) {
  return Math.min(slideCount - 1, Math.max(0, Math.floor(x / SLIDE_WIDTH)));
}
