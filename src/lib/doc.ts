import { z } from "zod";
import { AdjustSchema, hex, MaskSchema, OutlineSchema, PatternSchema, ShadowSchema, StrokeSchema } from "./look";
import { ComposeMetaSchema } from "./plan";

/**
 * The saved project document. Same shape as architecture.md.
 * Coordinates are canvas pixels at 1080 wide per slide. x and y are the top-left corner
 * before rotation, and rotation (degrees) turns the element about that corner.
 * Array order is z-order, bottom first. Slides are never stored. They are cut at export.
 */
const TextSchema = z.object({
  value: z.string().max(2000),
  /** A font id from fonts.generated.ts, such as "inter". */
  font: z.string().min(1).max(60),
  size: z.number().min(6).max(1200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  align: z.enum(["left", "center", "right"]),
  bold: z.boolean(),
});

/**
 * The part of the photo that shows, as fractions of the original (0 to 1). Missing means the whole
 * photo, stretched to the element's w and h as before. Aspect ratio is the layout's job: pick a crop
 * whose shape matches w by h, or the photo is squashed. See coverCrop in geometry.ts.
 */
const CropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.01).max(1),
    h: z.number().min(0.01).max(1),
  })
  .refine((c) => c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001, "The crop runs past the edge of the photo.");

const ElementSchema = z.object({
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
  /** For a sticker: "builtin:<id>" from stickers.ts. */
  assetPath: z.string().max(200).optional(),
  /** A sticker's colour. */
  tint: hex.optional(),
  text: TextSchema.optional(),
  /** Photo styling. All optional, so documents saved before these existed load unchanged. */
  crop: CropSchema.optional(),
  mask: MaskSchema.optional(),
  outline: OutlineSchema.optional(),
  shadow: ShadowSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  adjust: AdjustSchema.optional(),
  /** For a drawing layer: the line that was drawn. */
  stroke: StrokeSchema.optional(),
});

/** The most layers a project can hold. */
export const MAX_ELEMENTS = 500;

export const DocSchema = z.object({
  v: z.literal(1),
  background: z.object({ type: z.literal("color"), value: z.string() }),
  pattern: PatternSchema.optional(),
  /** How a carousel made from photos was laid out, kept so it can be restyled. See restyle.ts. */
  compose: ComposeMetaSchema.optional(),
  elements: z.array(ElementSchema).max(MAX_ELEMENTS),
});

export type Crop = z.infer<typeof CropSchema>;
export type { Mask, Pattern } from "./look";
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
