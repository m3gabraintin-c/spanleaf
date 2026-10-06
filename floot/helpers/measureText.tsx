import Konva from "konva";

/** The height of a text layer's words at its width, measured without drawing it. */
export const measureText = (t: {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  w: number;
  bold?: boolean;
}): number => {
  const node = new Konva.Text({
    text: t.text || " ",
    fontFamily: t.fontFamily || "Inter Tight",
    fontSize: t.fontSize || 64,
    fontStyle: t.bold ? "bold" : "normal",
    width: t.w,
  });
  const h = node.height();
  node.destroy();
  return Math.ceil(h);
};
