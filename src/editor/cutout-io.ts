import { visibleRegion, type Rgba } from "@/lib/cutout";
import type { Element } from "@/lib/doc";

type Canvas = HTMLCanvasElement;
const makeCanvas = () => document.createElement("canvas");

/** Loads a photo so its pixels can be read. The address must allow it, as export already needs. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo couldn't be opened."));
    img.src = url;
  });
}

/**
 * The pixels of what a layer shows (its crop, and any adjustments if source already has them), at most maxEdge on
 * the longest side, plus the size of the part of the photo they came from.
 */
export function readRegion(source: HTMLImageElement | Canvas, el: Pick<Element, "crop">, maxEdge: number, make: () => Canvas = makeCanvas): Rgba {
  const full = "naturalWidth" in source ? { w: source.naturalWidth, h: source.naturalHeight } : { w: source.width, h: source.height };
  const r = visibleRegion(el, full.w, full.h, maxEdge);
  const canvas = make();
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, 0, 0, r.w, r.h);
  const px = ctx.getImageData(0, 0, r.w, r.h);
  return { data: px.data, w: r.w, h: r.h };
}

/** A PNG file of the picture, with its transparency. */
export function pngFile(img: Rgba, name: string, make: () => Canvas = makeCanvas): Promise<File> {
  const canvas = make();
  canvas.width = img.w;
  canvas.height = img.h;
  const ctx = canvas.getContext("2d")!;
  const px = ctx.createImageData(img.w, img.h);
  px.data.set(img.data);
  ctx.putImageData(px, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: "image/png" })) : reject(new Error("The cut-out couldn't be saved."))), "image/png"),
  );
}

/** Draws the picture, scaled to fit, over a chequerboard so the see-through parts can be seen. */
export function drawPreview(canvas: Canvas, img: Rgba, maxEdge: number, make: () => Canvas = makeCanvas) {
  const k = Math.min(1, maxEdge / Math.max(img.w, img.h));
  canvas.width = Math.max(1, Math.round(img.w * k));
  canvas.height = Math.max(1, Math.round(img.h * k));
  const ctx = canvas.getContext("2d")!;
  const cell = 12;
  for (let y = 0; y < canvas.height; y += cell) {
    for (let x = 0; x < canvas.width; x += cell) {
      ctx.fillStyle = (x / cell + y / cell) % 2 ? "#e6e6e6" : "#bdbdbd";
      ctx.fillRect(x, y, cell, cell);
    }
  }
  const full = make();
  full.width = img.w;
  full.height = img.h;
  const fctx = full.getContext("2d")!;
  const px = fctx.createImageData(img.w, img.h);
  px.data.set(img.data);
  fctx.putImageData(px, 0, 0);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
}
