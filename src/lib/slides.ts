import { uid, type Doc, type Element } from "./doc";
import { SLIDE_WIDTH } from "./formats";

/**
 * Adding, copying, removing and moving slides. A project has one wide canvas, so every one of these is a matter of
 * shifting layers sideways by whole slide widths. A layer belongs to the slide under its middle.
 */

/** The slide a layer belongs to, counting from 0. Left of the first slide is below 0, right of the last is past the end. */
export const slideOf = (e: Pick<Element, "x" | "w">) => Math.floor((e.x + e.w / 2) / SLIDE_WIDTH);

const shift = (e: Element, slides: number): Element => (slides === 0 ? e : { ...e, x: e.x + slides * SLIDE_WIDTH });

/** A blank slide at position at (0 is first, the slide count is last). Everything from there on moves one slide along. */
export function insertSlide(doc: Doc, at: number): Doc {
  return { ...doc, elements: doc.elements.map((e) => shift(e, slideOf(e) >= at ? 1 : 0)) };
}

/** Takes slide at away, with the layers on it. Everything after it moves one slide back. */
export function removeSlide(doc: Doc, at: number): Doc {
  return { ...doc, elements: doc.elements.filter((e) => slideOf(e) !== at).map((e) => shift(e, slideOf(e) > at ? -1 : 0)) };
}

/** A copy of slide at, placed straight after it. The copies are new layers, on top. */
export function duplicateSlide(doc: Doc, at: number, newId: () => string = uid): Doc {
  const made = insertSlide(doc, at + 1);
  const copies = doc.elements.filter((e) => slideOf(e) === at).map((e) => ({ ...shift(e, 1), id: newId() }));
  return { ...made, elements: [...made.elements, ...copies] };
}

/** Takes slide from and puts it at position to, the slides in between making room. */
export function moveSlide(doc: Doc, slideCount: number, from: number, to: number): Doc {
  if (from === to) return doc;
  const newIndex = (s: number) => {
    if (s === from) return to;
    if (from < to && s > from && s <= to) return s - 1;
    if (from > to && s >= to && s < from) return s + 1;
    return s;
  };
  return {
    ...doc,
    elements: doc.elements.map((e) => {
      const s = slideOf(e);
      return s < 0 || s >= slideCount ? e : shift(e, newIndex(s) - s);
    }),
  };
}
