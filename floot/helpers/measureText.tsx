import Konva from "konva";
import { arcFor } from "./curvedText";

/** The height of a text layer's words at its width, measured without drawing it. */
export const measureText = (t: {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  w: number;
  bold?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  curve?: number;
}): number => {
  if (t.curve) return arcFor(t.w, t.fontSize || 64, t.curve).height;
  const node = new Konva.Text({
    text: t.text || " ",
    fontFamily: t.fontFamily || "Inter Tight",
    fontSize: t.fontSize || 64,
    fontStyle: t.bold ? "bold" : "normal",
    letterSpacing: t.letterSpacing ?? 0,
    lineHeight: t.lineHeight ?? 1,
    width: t.w,
  });
  const h = node.height();
  node.destroy();
  return Math.ceil(h);
};
