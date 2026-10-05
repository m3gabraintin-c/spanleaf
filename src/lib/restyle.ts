import { layoutCarousel } from "./compose";
import type { Doc } from "./doc";
import type { FormatKey } from "./formats";
import type { ThemeChoice } from "./themes";

/**
 * Lays a carousel out again in another theme, or with another shuffle, using the photos it has now. Nothing
 * is asked of the model: what it said about the photos was saved with the document. Photos the person
 * removed stay removed and ones they added are included. Text and stickers they added are not kept.
 * Returns null when the document wasn't made from photos or has none left. Throws if the photos don't fit.
 */
export function restyleDoc(doc: Doc, args: { format: FormatKey; slideCount: number; theme: ThemeChoice; seed: number }): Doc | null {
  const meta = doc.compose;
  const images = doc.elements.flatMap((e) => (e.type === "image" && e.mediaId ? [{ e, id: e.mediaId }] : []));
  if (!meta || images.length === 0) return null;

  const rank = new Map(meta.order.map((id, i) => [id, i]));
  images.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || a.e.x - b.e.x);

  const photos = images.map(({ e, id }) => {
    // Undo the crop to get the photo's own shape. Only the shape matters for layout.
    const aspect = (e.w / e.h) * (e.crop ? e.crop.h / e.crop.w : 1);
    return { id, name: e.name, width: Math.round(aspect * 1000), height: 1000, tags: meta.tags[id] };
  });

  return layoutCarousel(photos, meta.plan, { format: args.format, maxSlides: args.slideCount, slides: args.slideCount, seed: args.seed, theme: args.theme }).doc;
}
