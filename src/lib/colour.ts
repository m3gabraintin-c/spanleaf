/** Small colour helpers for choosing readable text and quiet patterns. Colours are "#rrggbb". */

const rgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (h: string) => {
  const [r, g, b] = rgb(h);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast ratio, from 1 (none) to 21 (black on white). */
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** A colour t of the way from a to b. */
export const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));

/** The preferred colour if it reads on the background, otherwise black or white, whichever reads better. */
export function inkFor(background: string, preferred: string) {
  if (contrast(background, preferred) >= 3) return preferred;
  return contrast(background, "#111111") >= contrast(background, "#ffffff") ? "#111111" : "#ffffff";
}

/** A colour as six hex digits. A three digit one is widened, and anything else becomes white, so it can go in a field that needs six. */
export function hex6(colour: string): string {
  const c = colour.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(c);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : "#ffffff";
}
