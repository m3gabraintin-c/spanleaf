import { Pattern } from "./carouselModel";

/** Sizes of one repeat of each pattern, in canvas pixels. */
const TILE = { grid: 54, dots: 36, lines: 48, stripes: 40, checks: 60, grain: 96 } as const;

/** A small repeatable picture of a pattern, to fill the background with. Drawn once per pattern and kept. */
const cache = new Map<string, HTMLCanvasElement>();
export const patternTile = (p: Pattern): HTMLCanvasElement => {
  const key = `${p.kind}:${p.color}:${p.opacity}`;
  const have = cache.get(key);
  if (have) return have;
  const s = TILE[p.kind];
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.globalAlpha = Math.min(1, Math.max(0, p.opacity));
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  if (p.kind === "grid") {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0.75);
    ctx.lineTo(s, 0.75);
    ctx.moveTo(0.75, 0);
    ctx.lineTo(0.75, s);
    ctx.stroke();
  } else if (p.kind === "dots") {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "lines") {
    ctx.fillRect(0, s - 2, s, 2);
  } else if (p.kind === "stripes") {
    ctx.lineWidth = s / 4;
    ctx.beginPath();
    for (let o = -s; o <= s * 2; o += s / 2) {
      ctx.moveTo(o, 0);
      ctx.lineTo(o - s, s);
    }
    ctx.stroke();
  } else if (p.kind === "checks") {
    ctx.fillRect(0, 0, s / 2, s / 2);
    ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
  } else {
    // Paper grain: a fixed scatter of specks, the same every time so exports match the screen.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 260; i++) ctx.fillRect(rand() * s, rand() * s, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  cache.set(key, c);
  return c;
};
