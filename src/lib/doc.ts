import { z } from "zod";

/**
 * The saved project document. Same shape as architecture.md.
 * Coordinates are canvas pixels at 1080 wide per slide. x and y are the top-left corner
 * before rotation, and rotation (degrees) turns the element about that corner.
 * Array order is z-order, bottom first. Slides are never stored. They are cut at export.
 */
export const TextSchema = z.object({
  value: z.string().max(2000),
  /** A font id from fonts.generated.ts, such as "inter". */
  font: z.string().min(1).max(60),
  size: z.number().min(6).max(1200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  align: z.enum(["left", "center", "right"]),
  bold: z.boolean(),
});

export const ElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "video", "text", "sticker", "frame", "drawing"]),
  x: z.number(),
  y: z.number(),
  /** For text, the width the lines wrap at. */
  w: z.number().positive(),
  /** For text, measured from the laid-out text, never typed in. */
  h: z.number().positive(),
  rotation: z.number().default(0),
  locked: z.boolean().default(false),
  name: z.string().max(200).optional(),
  mediaId: z.string().optional(),
  assetPath: z.string().optional(),
  text: TextSchema.optional(),
});

export const DocSchema = z.object({
  v: z.literal(1),
  background: z.object({ type: z.literal("color"), value: z.string() }),
  elements: z.array(ElementSchema).max(500),
});

export type Element = z.infer<typeof ElementSchema>;
export type TextProps = z.infer<typeof TextSchema>;
export type Doc = z.infer<typeof DocSchema>;

export const EMPTY_DOC: Doc = { v: 1, background: { type: "color", value: "#ffffff" }, elements: [] };

export function mediaIdsOf(doc: Doc): string[] {
  const ids = new Set<string>();
  for (const e of doc.elements) if (e.mediaId) ids.add(e.mediaId);
  return [...ids];
}

/** What a layer is called in the layers list. */
export function layerName(e: Element): string {
  if (e.type === "text") return (e.text?.value || "").replace(/\s+/g, " ").trim().slice(0, 40) || "Empty text";
  return e.name || { image: "Photo", video: "Video", sticker: "Sticker", frame: "Frame", drawing: "Drawing", text: "Text" }[e.type];
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // randomUUID needs a secure context. This keeps http://192.168.x.x dev sessions working.
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
