import type Konva from "konva";

export type ImageStatus = "loading" | "ready" | "error";

/**
 * Handles to the live Konva objects. Export and the add-photo flow need the real canvas,
 * and passing it through React state would cause pointless re-renders.
 */
export const canvasRegistry = {
  stage: null as Konva.Stage | null,
  content: null as Konva.Layer | null,
  imageStatus: new Map<string, ImageStatus>(),
  /** Index of the slide closest to the middle of the visible area. */
  currentSlide: (() => 0) as () => number,
  /** Scrolls the canvas to a slide. */
  goToSlide: ((_index: number) => {}) as (index: number) => void,
  /** Puts keyboard focus on the canvas area, so arrow keys and Delete reach the selected element. */
  focusCanvas: (() => {}) as () => void,
  /** Puts the cursor in the text panel's text box. Set by the text panel while it is open. */
  focusTextField: (() => {}) as () => void,
};
