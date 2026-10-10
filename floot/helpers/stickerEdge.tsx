/**
 * Die-cut sticker edges: an outline that follows the outside of a sticker's own shape (a cut-out photo, a heart),
 * not its box. Made by drawing the sticker's outline shape a little bigger all the way round, in one colour, under
 * the sticker.
 */

/** Points round a circle of radius r, close enough together that the outline has no gaps. */
export const ringOffsets = (r: number): [number, number][] => {
  const n = Math.max(12, Math.min(64, Math.round(r * 2.5)));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round(Math.cos(a) * r * 100) / 100, Math.round(Math.sin(a) * r * 100) / 100];
  });
};

const made = new Map<string, HTMLCanvasElement>();

/**
 * The sticker with its outline, the same size as the sticker's own picture so its box doesn't change. The sticker is
 * drawn a little smaller inside to leave room for the outline. r is in the picture's own pixels.
 */
export const outlinedImage = (img: HTMLImageElement, r: number, color: string): HTMLCanvasElement | null => {
  const key = `${img.src.length}:${img.src.slice(-64)}|${r}|${color}`;
  const have = made.get(key);
  if (have) return have;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const pad = Math.ceil(r) + 2;
  const inner = { x: pad, y: pad, w: Math.max(4, w - pad * 2), h: Math.max(4, h - pad * 2) };
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  for (const [dx, dy] of ringOffsets(r)) ctx.drawImage(img, inner.x + dx, inner.y + dy, inner.w, inner.h);
  ctx.drawImage(img, inner.x, inner.y, inner.w, inner.h);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(img, inner.x, inner.y, inner.w, inner.h);
  if (made.size > 60) made.clear();
  made.set(key, c);
  return c;
};