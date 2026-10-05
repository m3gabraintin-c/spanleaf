/** Read design tokens at runtime, for the canvas (Konva can't use Tailwind classes). */
export function token(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

export function tokenPx(name: string): number {
  return parseFloat(token(name)) || 0;
}
