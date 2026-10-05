import type { Element, TextProps } from "./doc";
import { uid } from "./doc";
import { STICKERS, stickerAsset } from "./stickers";

/** Slide content colours are user content, not interface colours, so they are plain values here. */
export const DEFAULT_TEXT: TextProps = { value: "Your text", font: "inter", size: 96, color: "#111111", align: "center", bold: true };

export function newTextElement(centreX: number, centreY: number, slideWidth: number): Element {
  const w = Math.round(slideWidth * 0.7);
  return {
    id: uid(),
    type: "text",
    x: Math.round(centreX - w / 2),
    y: Math.round(centreY - 60),
    w,
    h: 120,
    rotation: 0,
    locked: false,
    text: { ...DEFAULT_TEXT },
  };
}

/** How wide a new sticker starts, as a share of a slide, by what kind it is. */
const STICKER_SHARE = { tape: 0.2, label: 0.5, doodle: 0.22 };

/** A built-in sticker centred on a point, in its own colour and shape. */
export function newStickerElement(id: string, centreX: number, centreY: number, slideWidth: number): Element {
  const def = STICKERS[id];
  const w = Math.round(slideWidth * STICKER_SHARE[def.kind]);
  const h = Math.round(w / def.aspect);
  return {
    id: uid(),
    type: "sticker",
    x: Math.round(centreX - w / 2),
    y: Math.round(centreY - h / 2),
    w,
    h,
    rotation: 0,
    locked: false,
    name: def.label,
    assetPath: stickerAsset(id),
    tint: def.defaultTint,
  };
}
