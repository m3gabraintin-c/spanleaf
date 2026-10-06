import { Adjust, Crop } from "./carouselModel";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const MAX_ZOOM = 4;

/**
 * The part of a photo to show in a frame of boxW by boxH, in the photo's own pixels. At zoom 1 it is the largest
 * piece that fits the frame without squashing; zooming in shrinks it; x and y are where its middle sits, 0 to 1.
 */
export const cropRect = (natW: number, natH: number, boxW: number, boxH: number, crop?: Crop) => {
  const boxAspect = boxW / boxH;
  let cw: number;
  let ch: number;
  if (natW / natH > boxAspect) {
    ch = natH;
    cw = natH * boxAspect;
  } else {
    cw = natW;
    ch = natW / boxAspect;
  }
  const z = clamp(crop?.zoom ?? 1, 1, MAX_ZOOM);
  cw /= z;
  ch /= z;
  const x = clamp((crop?.x ?? 0.5) * natW - cw / 2, 0, natW - cw);
  const y = clamp((crop?.y ?? 0.5) * natH - ch / 2, 0, natH - ch);
  return { x, y, width: cw, height: ch };
};

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0 };

export const ADJUST_PRESETS: { id: string; name: string; adjust: Adjust }[] = [
  { id: "original", name: "Original", adjust: NO_ADJUST },
  { id: "vivid", name: "Vivid", adjust: { brightness: 0, contrast: 15, saturation: 35 } },
  { id: "warm", name: "Warm", adjust: { brightness: 6, contrast: 0, saturation: 12 } },
  { id: "fade", name: "Fade", adjust: { brightness: 10, contrast: -20, saturation: -20 } },
  { id: "mono", name: "Mono", adjust: { brightness: 0, contrast: 10, saturation: -100 } },
];

export const isAdjusted = (a: Adjust | null | undefined): a is Adjust =>
  !!a && (a.brightness !== 0 || a.contrast !== 0 || a.saturation !== 0);
