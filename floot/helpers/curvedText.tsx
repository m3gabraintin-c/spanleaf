/**
 * Curved text: the words sit on an arc across the layer's width. A curve of 100 is a half circle arching up, -100
 * a half circle dipping down like a smile, 0 a straight line. Pure, so it can be tested.
 */

export const MAX_CURVE = 100;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The path the letters stand on (SVG path data, in the layer's own pixels) and the height the layer needs. */
export const arcFor = (w: number, fontSize: number, curve: number) => {
  const c = Math.max(-MAX_CURVE, Math.min(MAX_CURVE, Number(curve) || 0));
  // How far the middle of the line rises or drops from its ends.
  const sag = (Math.abs(c) / MAX_CURVE) * (w / 2);
  // Room above the line for the letters, and a little below it for tails like g and y.
  const top = r2(fontSize * 1.05);
  const height = Math.ceil(top + sag + fontSize * 0.3);
  if (sag < 0.5) return { data: `M 0 ${top} L ${r2(w)} ${top}`, height, radius: Infinity, sag: 0 };
  const radius = r2((sag * sag + (w / 2) ** 2) / (2 * sag));
  const data =
    c > 0
      ? `M 0 ${r2(top + sag)} A ${radius} ${radius} 0 0 1 ${r2(w)} ${r2(top + sag)}`
      : `M 0 ${top} A ${radius} ${radius} 0 0 0 ${r2(w)} ${top}`;
  return { data, height, radius, sag: r2(sag) };
};

/** Curved text sits on one line, so line breaks become spaces. */
export const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();