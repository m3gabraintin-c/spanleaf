import type { Element, TextProps } from "./doc";
import { uid } from "./doc";

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
