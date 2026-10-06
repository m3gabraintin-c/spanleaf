import type { Adjust } from "./look";

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0 };

/** Ready-made looks. Each is just a set of the four controls, so it can be tweaked afterwards. */
export const ADJUST_PRESETS: { id: string; name: string; adjust: Adjust }[] = [
  { id: "original", name: "Original", adjust: NO_ADJUST },
  { id: "vivid", name: "Vivid", adjust: { brightness: 0, contrast: 15, saturation: 35, warmth: 0 } },
  { id: "warm", name: "Warm", adjust: { brightness: 5, contrast: 0, saturation: 5, warmth: 40 } },
  { id: "cool", name: "Cool", adjust: { brightness: 0, contrast: 5, saturation: 0, warmth: -40 } },
  { id: "fade", name: "Fade", adjust: { brightness: 10, contrast: -20, saturation: -20, warmth: 0 } },
  { id: "mono", name: "Mono", adjust: { brightness: 0, contrast: 10, saturation: -100, warmth: 0 } },
];

/** Whether anything is changed. A photo with no change is drawn as it is, without the extra work. */
export const isAdjusted = (a: Adjust | undefined): a is Adjust => !!a && (a.brightness !== 0 || a.contrast !== 0 || a.saturation !== 0 || a.warmth !== 0);

/** Changes RGBA pixels in place. Brightness first, then contrast around mid grey, then saturation, then warmth. Alpha is left alone. */
export function adjustPixels(data: Uint8ClampedArray, a: Adjust) {
  const add = a.brightness * 2.55;
  const c = a.contrast * 2.55;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  const sat = 1 + a.saturation / 100;
  const warm = a.warmth * 0.5;
  for (let i = 0; i < data.length; i += 4) {
    let r = (data[i] + add - 128) * factor + 128;
    let g = (data[i + 1] + add - 128) * factor + 128;
    let b = (data[i + 2] + add - 128) * factor + 128;
    const grey = 0.299 * r + 0.587 * g + 0.114 * b;
    r = grey + (r - grey) * sat + warm;
    g = grey + (g - grey) * sat;
    b = grey + (b - grey) * sat - warm;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
