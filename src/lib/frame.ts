import { EDGE_MASKS } from "./themes";
import type { Mask } from "./look";

/** The four cuts someone picks for one photo, in plain words. */
export const FRAME_EDGES = ["square", "rounded", "torn", "oval"] as const;
export type FrameEdge = (typeof FRAME_EDGES)[number];

/** The cut for a choice. A torn edge needs a seed, which decides how it tears. */
export const maskFor = (edge: FrameEdge, seed: number): Mask => ({ ...EDGE_MASKS[edge], ...(edge === "torn" ? { seed } : {}) });

/** Which choice a photo's cut amounts to. No cut is square. */
export function edgeOf(mask: Mask | undefined): FrameEdge {
  const shape = mask?.shape ?? "rect";
  return shape === "rect" ? "square" : shape === "ellipse" ? "oval" : shape;
}
