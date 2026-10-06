import type { Doc } from "./doc";
import { FORMATS, type FormatKey } from "./formats";
import { restyleDoc } from "./restyle";

/**
 * The document for a project whose format is being changed. A carousel made from photos is laid out again for
 * the new shape, in the theme it has now. Anything else keeps its place relative to the middle of the slide,
 * so changing to another format and back puts everything where it was. Things can end up off the slide in a
 * shorter one, and stay in the layers list.
 */
export function changeFormat(doc: Doc, args: { from: FormatKey; to: FormatKey; slideCount: number }): Doc {
  const meta = doc.compose;
  if (meta) {
    const again = restyleDoc(doc, { format: args.to, slideCount: args.slideCount, theme: meta.theme, seed: meta.seed });
    if (again) return again;
  }
  const dy = (FORMATS[args.to].height - FORMATS[args.from].height) / 2;
  return { ...doc, elements: doc.elements.map((e) => ({ ...e, y: e.y + dy })) };
}
