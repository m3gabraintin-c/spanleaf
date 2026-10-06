import { FONTS, type FontEntry } from "./fonts.generated";

export { FONTS };
export type { FontEntry };
const DEFAULT_FONT = "inter";

const byId = new Map(FONTS.map((f) => [f.id, f]));
const fontById = (id: string): FontEntry => byId.get(id) ?? byId.get(DEFAULT_FONT)!;
export const hasBold = (id: string) => !!fontById(id).files[700];

/** The name the canvas uses. Fonts are registered under it when they load. */
export const cssFamily = (id: string) => fontById(id).name;

export const FONT_GROUPS = ["Sans", "Display", "Serif", "Script and hand"].map((g) => ({ group: g, fonts: FONTS.filter((f) => f.group === g) }));

type FontState = "loading" | "ready" | "error";
const state = new Map<string, FontState>();
const pending = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();

const key = (id: string, bold: boolean) => `${fontById(id).id}:${bold && hasBold(id) ? 700 : 400}`;
export const fontState = (id: string, bold: boolean) => state.get(key(id, bold));
export const onFontsChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const notify = () => listeners.forEach((fn) => fn());

/**
 * Loads one weight of one family, once. The canvas draws text in whatever font is ready at that
 * moment, so text must wait for this before it is measured or exported.
 */
export function loadFont(id: string, bold: boolean): Promise<boolean> {
  const font = fontById(id);
  const weight = bold && font.files[700] ? 700 : 400;
  const k = `${font.id}:${weight}`;
  if (state.get(k) === "ready") return Promise.resolve(true);
  const inflight = pending.get(k);
  if (inflight) return inflight;
  state.set(k, "loading");
  const p = (async () => {
    try {
      const face = new FontFace(font.name, `url(${font.files[weight]}) format("woff2")`, { weight: String(weight), style: "normal" });
      await face.load();
      document.fonts.add(face);
      state.set(k, "ready");
      return true;
    } catch {
      state.set(k, "error");
      return false;
    } finally {
      pending.delete(k);
      notify();
    }
  })();
  pending.set(k, p);
  notify();
  return p;
}

/** Fonts the project's text layers need, waited for before an export. */
export async function waitForFonts(wanted: { font: string; bold: boolean }[], timeoutMs = 10000): Promise<void> {
  const unique = [...new Map(wanted.map((w) => [key(w.font, w.bold), w])).values()];
  const all = Promise.all(unique.map((w) => loadFont(w.font, w.bold)));
  const result = await Promise.race([all, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), timeoutMs))]);
  if (result === "timeout") throw new Error("Some fonts are still loading. Try again in a moment.");
  if (result.includes(false)) throw new Error("A font couldn't be loaded, so the text would export in the wrong typeface. Check your connection and try again.");
}
