import { z } from "zod";

/** Pieces of a document's look that both the saved document and the themes are built from. */

export const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Strips control characters and collapses whitespace, so text from a model can't smuggle in line breaks or escapes. */
export const cleanText = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
export const text = (max: number) => z.string().transform(cleanText).pipe(z.string().max(max));

/** The outline a photo is cut to. Torn edges are generated from the seed, so a reload draws the same edge. */
export const MaskSchema = z.object({
  shape: z.enum(["rect", "rounded", "ellipse", "torn"]),
  /** Corner radius for "rounded", as a fraction of the shorter side (0 to 0.5). Default 0.12. */
  radius: z.number().min(0).max(0.5).optional(),
  seed: z.number().int().min(0).max(1_000_000).optional(),
});

/** A solid border that follows the mask. Canvas pixels. */
export const OutlineSchema = z.object({ color: hex, width: z.number().min(0).max(80) });

export const ShadowSchema = z.object({
  color: hex,
  blur: z.number().min(0).max(100),
  x: z.number().min(-200).max(200),
  y: z.number().min(-200).max(200),
  opacity: z.number().min(0).max(1),
});

export const PATTERN_KINDS = ["grid", "dots", "lines"] as const;

/** A repeating pattern drawn over the background colour, under every element. */
export const PatternSchema = z.object({
  kind: z.enum(PATTERN_KINDS),
  color: hex,
  /** Distance between lines or dots, in canvas pixels. */
  size: z.number().min(8).max(400),
  thickness: z.number().min(0.5).max(8),
});

export type Mask = z.infer<typeof MaskSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
