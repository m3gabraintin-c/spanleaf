export type Box = { x: number; y: number; w: number; h: number };
export type Guide = { axis: "x" | "y"; at: number };

/**
 * Moves a box a little so its edges or middle line up with the slide's edges and middle or with other layers on
 * the slide, when they are within threshold. Returns where the box goes and the guide lines to show.
 */
export const snapBox = (
  box: Box,
  others: Box[],
  slide: { left: number; width: number; height: number },
  threshold: number,
): { x: number; y: number; guides: Guide[] } => {
  const xs = [slide.left, slide.left + slide.width / 2, slide.left + slide.width];
  const ys = [0, slide.height / 2, slide.height];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const best = (mine: number[], targets: number[]) => {
    let pick: { delta: number; at: number } | null = null;
    for (const m of mine) {
      for (const t of targets) {
        const d = t - m;
        if (Math.abs(d) <= threshold && (!pick || Math.abs(d) < Math.abs(pick.delta))) pick = { delta: d, at: t };
      }
    }
    return pick;
  };
  const sx = best([box.x, box.x + box.w / 2, box.x + box.w], xs);
  const sy = best([box.y, box.y + box.h / 2, box.y + box.h], ys);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: "x", at: sx.at });
  if (sy) guides.push({ axis: "y", at: sy.at });
  return { x: box.x + (sx?.delta ?? 0), y: box.y + (sy?.delta ?? 0), guides };
};
