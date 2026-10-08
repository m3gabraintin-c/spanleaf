import { MaskShape } from "./carouselModel";

type PathCtx = {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  closePath(): void;
};

/** Traces a photo shape filling a w by h box. Torn edges are jagged in the same way every time. */
export const maskPath = (c: PathCtx, shape: MaskShape, w: number, h: number) => {
  c.beginPath();
  if (shape === "circle") {
    c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === "heart") {
    c.moveTo(w / 2, h * 0.28);
    c.bezierCurveTo(w * 0.5, h * 0.05, w * 0.05, h * -0.02, w * 0.03, h * 0.3);
    c.bezierCurveTo(w * 0.01, h * 0.58, w * 0.35, h * 0.78, w / 2, h);
    c.bezierCurveTo(w * 0.65, h * 0.78, w * 0.99, h * 0.58, w * 0.97, h * 0.3);
    c.bezierCurveTo(w * 0.95, h * -0.02, w * 0.5, h * 0.05, w / 2, h * 0.28);
  } else if (shape === "arch") {
    const r = Math.min(w / 2, h);
    c.moveTo(0, h);
    c.lineTo(0, r);
    c.arc(w / 2, r, w / 2, Math.PI, 0);
    c.lineTo(w, h);
  } else if (shape === "star") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const k = i % 2 ? 0.42 : 1;
      const x = w / 2 + Math.cos(a) * (w / 2) * k;
      const y = h * 0.53 + Math.sin(a) * (h / 2) * k * 1.05;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  } else if (shape === "torn") {
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const tear = Math.max(4, Math.min(w, h) * 0.025);
    const step = Math.max(6, Math.min(w, h) / 40);
    c.moveTo(0, rand() * tear);
    for (let x = step; x < w; x += step) c.lineTo(x, rand() * tear);
    c.lineTo(w, rand() * tear);
    for (let y = step; y < h; y += step) c.lineTo(w - rand() * tear, y);
    c.lineTo(w - rand() * tear, h);
    for (let x = w - step; x > 0; x -= step) c.lineTo(x, h - rand() * tear);
    c.lineTo(0, h - rand() * tear);
    for (let y = h - step; y > 0; y -= step) c.lineTo(rand() * tear, y);
  } else {
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
  }
  c.closePath();
};
