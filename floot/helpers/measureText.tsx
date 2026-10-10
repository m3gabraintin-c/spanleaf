import Konva from "konva";
import { arcFor } from "./curvedText";
import { hasMarkup, layoutRich } from "./richText";

let scratch: CanvasRenderingContext2D | null | undefined;

/**
 * Measures pieces of text for a text layer, bold where marked, with the layer's letter spacing. Null where there is
 * no canvas (tests).
 */
export const richMeasure = (t: { fontFamily?: string; fontSize?: number; bold?: boolean; letterSpacing?: number }) => {
  if (scratch === undefined) scratch = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  const ctx = scratch;
  if (!ctx) return null;
  return (text: string, accent: boolean) => {
    ctx.font = `${t.bold || accent ? "700" : "400"} ${t.fontSize || 64}px "${t.fontFamily || "Inter Tight"}"`;
    if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${t.letterSpacing ?? 0}px`;
    return ctx.measureText(text).width;
  };
};

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
  if (hasMarkup(t.text)) {
    const measure = richMeasure(t);
    if (measure) return Math.ceil(layoutRich(t.text ?? "", t.w, measure).length * (t.fontSize || 64) * (t.lineHeight ?? 1));
  }
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
