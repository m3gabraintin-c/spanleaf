/**
 * The two ends of a gradient across a box of w by h at the given angle (0 runs left to right, 90 top to bottom),
 * placed so the first colour is exactly at one corner or edge and the last at the opposite one.
 */
export function gradientLine(angle: number, w: number, h: number) {
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return { start: { x: cx - dx * half, y: cy - dy * half }, end: { x: cx + dx * half, y: cy + dy * half } };
}
