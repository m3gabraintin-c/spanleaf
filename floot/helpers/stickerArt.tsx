/**
 * Built-in stickers: small flat shapes made as SVG, so they stay sharp at any size and can take any colour.
 * Nothing here is copied from another app.
 */

export const STICKERS = [
  { id: "star", name: "Star", w: 220, h: 220, art: (c: string) => `<path d="M100 8l27 58 63 7-47 43 13 62-56-32-56 32 13-62-47-43 63-7z" fill="${c}"/>` },
  { id: "heart", name: "Heart", w: 220, h: 200, art: (c: string) => `<path d="M100 180C20 120 4 80 4 52 4 26 24 8 50 8c20 0 40 12 50 32 10-20 30-32 50-32 26 0 46 18 46 44 0 28-16 68-96 128z" fill="${c}"/>` },
  { id: "sparkle", name: "Sparkle", w: 200, h: 200, art: (c: string) => `<path d="M100 4c6 50 26 70 96 96-70 26-90 46-96 96-6-50-26-70-96-96C74 74 94 54 100 4z" fill="${c}"/>` },
  { id: "drop", name: "Drop", w: 160, h: 220, art: (c: string) => `<path d="M80 6C40 70 8 110 8 148a72 72 0 0 0 144 0C152 110 120 70 80 6z" fill="${c}"/>` },
  { id: "tape", name: "Tape", w: 360, h: 110, art: (c: string) => `<path d="M10 8h340l-18 20 18 20-18 20 18 20-18 14H10l18-14-18-20 18-20-18-20z" fill="${c}" fill-opacity="0.78"/>` },
  { id: "label", name: "Label", w: 360, h: 140, art: (c: string) => `<rect x="6" y="6" width="348" height="128" rx="18" fill="${c}"/><rect x="18" y="18" width="324" height="104" rx="12" fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="10 8" opacity="0.8"/>` },
  { id: "squiggle", name: "Squiggle", w: 360, h: 100, art: (c: string) => `<path d="M12 50c30-60 50 60 80 0s50 60 80 0 50 60 80 0 50 60 80 0" fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round"/>` },
  { id: "dots", name: "Dots", w: 260, h: 100, art: (c: string) => `<g fill="${c}"><circle cx="30" cy="50" r="18"/><circle cx="90" cy="50" r="18"/><circle cx="150" cy="50" r="18"/><circle cx="210" cy="50" r="18"/></g>` },
  { id: "circle", name: "Circle", w: 200, h: 200, art: (c: string) => `<circle cx="100" cy="100" r="94" fill="${c}"/>` },
  {
    id: "daisy",
    name: "Daisy",
    w: 220,
    h: 220,
    art: (c: string) =>
      `<g transform="translate(110 110)">${Array.from({ length: 12 }, (_, i) => `<ellipse rx="22" ry="62" cy="-48" fill="${c}" stroke="#d9d2c3" stroke-width="2" transform="rotate(${i * 30})"/>`).join("")}<circle r="26" fill="#f2b632"/><circle r="26" fill="none" stroke="#d99a1e" stroke-width="3"/></g>`,
  },
  {
    id: "pin",
    name: "Pin",
    w: 120,
    h: 160,
    art: (c: string) => `<path d="M60 96 L60 154" stroke="#9a9a9a" stroke-width="6" stroke-linecap="round"/><circle cx="60" cy="56" r="46" fill="${c}"/><circle cx="44" cy="40" r="12" fill="#ffffff" opacity="0.55"/>`,
  },
] as const;

export type StickerId = (typeof STICKERS)[number]["id"];

export const STICKER_COLOURS = ["#f6d94a", "#f66dbb", "#e5484d", "#30a46c", "#0090ff", "#8e4ec6", "#1d211e", "#ffffff"];

/** The sticker as a picture address, drawn in the given colour. */
export const stickerSrc = (id: string, colour: string): string => {
  const s = STICKERS.find((x) => x.id === id) ?? STICKERS[0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">${s.art(colour)}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
