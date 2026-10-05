/**
 * Built-in decorations for the scrapbook look: tape, a torn paper label and hand-drawn doodles. Each is a
 * small SVG drawn for this app, so nothing is copied from another product. A sticker element in a document
 * names one as "builtin:<id>" in assetPath and gives its colour in tint. Only ids listed here are ever drawn,
 * so a document can't make the editor load an address of its choosing.
 */
export interface StickerDef {
  label: string;
  /** Width divided by height. */
  aspect: number;
  /** The colour a new one starts with. */
  defaultTint: string;
  svg: (tint: string) => string;
}

/** A tiny seeded generator, so a doodle's wobble is the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

const n = (v: number) => Math.round(v * 10) / 10;
const pts = (p: [number, number][]) => p.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
const wrap = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const pen = (tint: string, width: number) => `fill="none" stroke="${tint}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;

/** A strip with zigzag ends, like tape torn off a roll. */
function tapeOutline(w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  const step = 6;
  const rows = Math.round(h / step);
  for (let i = 0; i <= rows; i++) out.push([i % 2 ? 0 : 5, (i * h) / rows]); // left edge, top to bottom
  for (let i = rows; i >= 0; i--) out.push([w - (i % 2 ? 0 : 5), (i * h) / rows]); // right edge, bottom to top
  return out;
}

/** A sheet of paper with a ragged edge all the way round. */
function tornOutline(w: number, h: number, seed: number): [number, number][] {
  const r = rng(seed);
  const out: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const count = Math.round(len / 11);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const d = 1 + r() * 5;
      out.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]);
    }
  };
  edge(0, 0, w, 0, 0, 1);
  edge(w, 0, w, h, -1, 0);
  edge(w, h, 0, h, 0, -1);
  edge(0, h, 0, 0, 1, 0);
  return out;
}

/** The corners of a star, with a little wobble, as if drawn by hand. */
function starPath(seed: number) {
  const r = rng(seed);
  const p: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = (i % 2 ? 19 : 45) + (r() - 0.5) * 4;
    p.push([50 + rad * Math.cos(a), 54 + rad * Math.sin(a)]);
  }
  // Close the loop and overshoot the first corner, the way a pen does.
  return `M${pts([p[0]])} L${pts(p.slice(1))} L${pts([p[0]])} L${pts([[p[1][0] * 0.35 + p[0][0] * 0.65, p[1][1] * 0.35 + p[0][1] * 0.65]])}`;
}

const TAPE = tapeOutline(160, 50);
const LABEL = tornOutline(250, 84, 11);

export const STICKERS: Record<string, StickerDef> = {
  tape: {
    label: "Tape",
    aspect: 160 / 50,
    defaultTint: "#f3d9a4",
    svg: (t) => wrap(160, 50, `<polygon points="${pts(TAPE)}" fill="${t}" fill-opacity="0.92"/><rect x="0" y="14" width="160" height="5" fill="#fff" fill-opacity="0.22"/>`),
  },
  "tape-stripe": {
    label: "Striped tape",
    aspect: 160 / 50,
    defaultTint: "#e9a7b8",
    svg: (t) => {
      const stripes = Array.from({ length: 14 }, (_, i) => `<line x1="${i * 14 - 20}" y1="52" x2="${i * 14 + 20}" y2="-2" stroke="#fff" stroke-opacity="0.45" stroke-width="5"/>`).join("");
      return wrap(160, 50, `<clipPath id="c"><polygon points="${pts(TAPE)}"/></clipPath><polygon points="${pts(TAPE)}" fill="${t}" fill-opacity="0.92"/><g clip-path="url(#c)">${stripes}</g>`);
    },
  },
  label: {
    label: "Paper label",
    aspect: 250 / 84,
    defaultTint: "#ecebe5",
    svg: (t) => wrap(250, 84, `<polygon points="${pts(LABEL)}" fill="${t}" stroke="#000" stroke-opacity="0.1" stroke-width="1.5"/>`),
  },
  star: {
    label: "Star",
    aspect: 1,
    defaultTint: "#f6d94a",
    svg: (t) => wrap(100, 100, `<path d="${starPath(3)}" ${pen(t, 8)}/><path d="${starPath(8)}" ${pen(t, 4)} stroke-opacity="0.5" transform="rotate(4 50 54)"/>`),
  },
  drop: {
    label: "Raindrop",
    aspect: 0.7,
    defaultTint: "#ffffff",
    svg: (t) => wrap(70, 100, `<path d="M35,7 C35,7 9,42 9,63 A26,26 0 0 0 61,63 C61,42 35,7 35,7 Z" ${pen(t, 8)}/><path d="M24,66 Q26,76 35,79" ${pen(t, 4)} stroke-opacity="0.7"/>`),
  },
  sparkle: {
    label: "Sparkle",
    aspect: 1,
    defaultTint: "#ffffff",
    svg: (t) => wrap(100, 100, `<path d="M50,4 Q55,45 96,50 Q55,55 50,96 Q45,55 4,50 Q45,45 50,4 Z" fill="${t}"/>`),
  },
  heart: {
    label: "Heart",
    aspect: 1.1,
    defaultTint: "#ffffff",
    svg: (t) => wrap(110, 100, `<path d="M55,92 C20,66 6,44 6,28 C6,14 17,6 30,6 C42,6 51,13 55,22 C59,13 68,6 80,6 C93,6 104,14 104,28 C104,44 90,66 55,92 Z" ${pen(t, 8)}/>`),
  },
  squiggle: {
    label: "Squiggle",
    aspect: 3,
    defaultTint: "#ffffff",
    svg: (t) => wrap(150, 50, `<path d="M6,28 Q22,2 38,26 T70,26 T102,26 T134,26" ${pen(t, 8)}/>`),
  },
  dots: {
    label: "Dots and asterisk",
    aspect: 1,
    defaultTint: "#ffffff",
    svg: (t) =>
      wrap(
        100,
        100,
        `<g fill="${t}"><circle cx="22" cy="68" r="4"/><circle cx="52" cy="36" r="3"/><circle cx="74" cy="74" r="5"/><circle cx="84" cy="26" r="2.5"/></g>` +
          `<g ${pen(t, 4)}><path d="M28,14 L28,34 M18,20 L38,28 M38,20 L18,28"/></g>`,
      ),
  },
};

export const STICKER_IDS = Object.keys(STICKERS);

const PREFIX = "builtin:";
export const stickerAsset = (id: string) => PREFIX + id;

/** The catalog id an assetPath names, or null if it isn't a built-in we know. */
export function parseSticker(assetPath: string | undefined): string | null {
  if (!assetPath || !assetPath.startsWith(PREFIX)) return null;
  const id = assetPath.slice(PREFIX.length);
  return Object.hasOwn(STICKERS, id) ? id : null;
}

/** A data address the canvas can load as an image. Colour comes from the document, so it is checked here too. */
export function stickerDataUrl(id: string, tint: string): string {
  const colour = /^#[0-9a-fA-F]{6}$/.test(tint) ? tint : STICKERS[id].defaultTint;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(STICKERS[id].svg(colour));
}
