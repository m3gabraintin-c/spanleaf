import type { Element, Pattern } from "@/lib/doc";
import { maskPolygon, sourceRect } from "@/lib/geometry";
import { localPoints, type Point } from "@/lib/stroke";

/** Drawing helpers that work on a plain 2D canvas context, so Konva shapes and the export share them. */
type Ctx = CanvasRenderingContext2D;

function trace(c: Ctx, pts: number[]) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
}

function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The mask polygon for an element, used by both drawing and hit testing. */
export function elementPolygon(el: Pick<Element, "w" | "h" | "mask">) {
  return maskPolygon(el.mask?.shape ?? "rect", el.w, el.h, { radius: el.mask?.radius, seed: el.mask?.seed });
}

/**
 * Draws a photo cut to its mask, with an optional border and shadow. Opacity is not handled here,
 * because Konva applies the node's opacity before it calls this.
 *
 * The shadow and border are drawn from the mask shape, not from the photo's own transparency, so they
 * suit ordinary photos. A cutout sticker with a soft edge should have its white border baked into the
 * PNG when the background is removed.
 */
export function drawMaskedImage(c: Ctx, img: HTMLImageElement | HTMLCanvasElement, el: Element) {
  const pts = elementPolygon(el);
  // An adjusted copy is a canvas, possibly smaller than the photo. A crop is a fraction either way.
  const full = "naturalWidth" in img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: img.width, h: img.height };
  const { sx, sy, sw, sh } = sourceRect(el.crop, full.w, full.h);

  const border = el.outline && el.outline.width > 0 ? el.outline : null;
  if (border || el.shadow) {
    c.save();
    trace(c, pts);
    if (el.shadow) {
      c.shadowColor = rgba(el.shadow.color, el.shadow.opacity);
      c.shadowBlur = el.shadow.blur;
      c.shadowOffsetX = el.shadow.x;
      c.shadowOffsetY = el.shadow.y;
    }
    c.fillStyle = border?.color ?? "#000000";
    c.fill();
    if (border) {
      c.shadowColor = "transparent";
      c.lineJoin = "round";
      c.lineWidth = border.width * 2; // half of it is hidden under the photo
      c.strokeStyle = border.color;
      c.stroke();
    }
    c.restore();
  }

  c.save();
  trace(c, pts);
  c.clip();
  c.drawImage(img, sx, sy, sw, sh, 0, 0, el.w, el.h);
  c.restore();
}

/** Fills the artboard with a grid, dots or ruled lines. Called under the elements. */
export function drawPattern(c: Ctx, p: Pattern, width: number, height: number) {
  c.save();
  c.strokeStyle = p.color;
  c.fillStyle = p.color;
  c.lineWidth = p.thickness;
  if (p.kind === "dots") {
    const r = p.thickness;
    for (let y = p.size / 2; y < height; y += p.size) {
      for (let x = p.size / 2; x < width; x += p.size) {
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
  } else {
    c.beginPath();
    if (p.kind === "grid") for (let x = 0; x <= width; x += p.size) (c.moveTo(x, 0), c.lineTo(x, height));
    for (let y = 0; y <= height; y += p.size) (c.moveTo(0, y), c.lineTo(width, y));
    c.stroke();
  }
  c.restore();
}

/** The parts of a canvas context needed to lay out a line. Konva's own context has them too, so hit testing can share this. */
type PathCtx = Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo" | "quadraticCurveTo">;

/** Lays out a smooth line through the points: curves that pass through the middle of each pair. One point makes a dot. */
export function tracePath(c: PathCtx, pts: readonly Point[]) {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    c.lineTo(pts[0].x + 0.01, pts[0].y); // with round ends, this is a dot
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

/** Draws one line, in whatever coordinates the points are in. Opacity is left to the caller. */
export function drawLine(c: Ctx, pts: readonly Point[], color: string, width: number) {
  if (pts.length === 0) return;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  tracePath(c, pts);
  c.stroke();
  c.restore();
}

/** Draws a drawing layer's stroke. Opacity is not handled here, because Konva applies the node's before it calls this. */
export function drawStroke(c: Ctx, el: Element) {
  if (el.stroke) drawLine(c, localPoints(el), el.stroke.color, el.stroke.width);
}
