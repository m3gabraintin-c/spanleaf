import Konva from "konva";

/** The height of a text layer's words at its width, measured without drawing it. */
export const measureText = (t: {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  w: number;
  bold?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
}): number => {
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
