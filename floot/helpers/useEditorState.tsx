import { useCallback, useState } from "react";
import {
  Alignment,
  Design,
  FORMATS,
  Layer,
  MAX_LAYERS,
  MAX_SLIDES,
  alignedPosition,
  duplicateSlide,
  insertSlide,
  moveSlide,
  removeSlide,
  slideOf,
  uid,
  FormatKey,
  Gradient,
} from "./carouselModel";

/**
 * The editor's state: the design, what is selected, and undo and redo. Every
 * change is one step, except changes with the same key close together (dragging a
 * slider, typing), which are one step.
 */

type State = {
  design: Design;
  selectedId: string | null;
  past: Design[];
  future: Design[];
  lastKey: string | null;
  lastAt: number;
  /** Counts changes, so the page can tell when to save. */
  version: number;
};

const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

export const useEditorState = (initial: Design) => {
  const [s, setS] = useState<State>({
    design: initial,
    selectedId: null,
    past: [],
    future: [],
    lastKey: null,
    lastAt: 0,
    version: 0,
  });

  /** Applies a change to the design. Returns nothing; refused changes (return null) are ignored. */
  const change = useCallback((fn: (d: Design) => Design | null, key?: string) => {
    setS((prev) => {
      const next = fn(prev.design);
      if (!next || next === prev.design) return prev;
      const now = Date.now();
      const joins = !!key && key === prev.lastKey && now - prev.lastAt < COALESCE_MS;
      const past = joins ? prev.past : [...prev.past, prev.design].slice(-HISTORY_LIMIT);
      const stillThere = prev.selectedId && next.layers.some((l) => l.id === prev.selectedId);
      return {
        ...prev,
        design: next,
        past,
        future: [],
        lastKey: key ?? null,
        lastAt: now,
        selectedId: stillThere ? prev.selectedId : null,
        version: prev.version + 1,
      };
    });
  }, []);

  const undo = useCallback(
    () =>
      setS((p) => {
        const prev = p.past[p.past.length - 1];
        if (!prev) return p;
        return {
          ...p,
          design: prev,
          past: p.past.slice(0, -1),
          future: [p.design, ...p.future],
          lastKey: null,
          selectedId: prev.layers.some((l) => l.id === p.selectedId) ? p.selectedId : null,
          version: p.version + 1,
        };
      }),
    [],
  );

  const redo = useCallback(
    () =>
      setS((p) => {
        const next = p.future[0];
        if (!next) return p;
        return {
          ...p,
          design: next,
          past: [...p.past, p.design],
          future: p.future.slice(1),
          lastKey: null,
          selectedId: next.layers.some((l) => l.id === p.selectedId) ? p.selectedId : null,
          version: p.version + 1,
        };
      }),
    [],
  );

  const select = useCallback((id: string | null) => setS((p) => (p.selectedId === id ? p : { ...p, selectedId: id })), []);

  const actions = {
    addLayer: (layer: Layer) =>
      change((d) => {
        if (d.layers.length >= MAX_LAYERS) return null;
        return { ...d, layers: [...d.layers, layer] };
      }),
    patchLayer: (id: string, patch: Partial<Layer>, key?: string) =>
      change(
        (d) => ({ ...d, layers: d.layers.map((l) => (l.id === id && !l.locked ? { ...l, ...patch } : l)) }),
        key,
      ),
    removeLayer: (id: string) => change((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) })),
    /** Removes several layers as one step. Calls with the same key close together share a step (rubbing out a long stroke). */
    removeLayers: (ids: string[], key?: string) =>
      change((d) => {
        const gone = new Set(ids);
        if (!d.layers.some((l) => gone.has(l.id))) return null;
        return { ...d, layers: d.layers.filter((l) => !gone.has(l.id)) };
      }, key),
    /** Any whole-design change, such as a theme or arranging the photos. */
    apply: (fn: (d: Design) => Design, key?: string) => change((d) => fn(d), key),
    /** Changes several layers as one step, such as moving everything that is selected. Locked layers are left. */
    patchMany: (patches: Record<string, Partial<Layer>>, key?: string) =>
      change((d) => {
        if (!d.layers.some((l) => patches[l.id] && !l.locked)) return null;
        return { ...d, layers: d.layers.map((l) => (patches[l.id] && !l.locked ? { ...l, ...patches[l.id] } : l)) };
      }, key),
    /** Adds several layers as one step, such as pasting. Refused if it would pass the layer limit. */
    addLayers: (add: Layer[]) =>
      change((d) => {
        if (add.length === 0 || d.layers.length + add.length > MAX_LAYERS) return null;
        return { ...d, layers: [...d.layers, ...add] };
      }),
    toggleLock: (id: string) =>
      change((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)) })),
    reorder: (id: string, to: "front" | "back" | "forward" | "backward") =>
      change((d) => {
        const i = d.layers.findIndex((l) => l.id === id);
        if (i < 0) return null;
        const arr = [...d.layers];
        const [item] = arr.splice(i, 1);
        const j = to === "front" ? arr.length : to === "back" ? 0 : to === "forward" ? Math.min(arr.length, i + 1) : Math.max(0, i - 1);
        if (j === i) return null;
        arr.splice(j, 0, item);
        return { ...d, layers: arr };
      }),
    align: (id: string, how: Alignment) =>
      change((d) => {
        const l = d.layers.find((x) => x.id === id);
        if (!l || l.locked) return null;
        const at = alignedPosition(l, how, d.slideCount, FORMATS[d.format].height);
        if (at.x === l.x && at.y === l.y) return null;
        return { ...d, layers: d.layers.map((x) => (x.id === id ? { ...x, ...at } : x)) };
      }),
    setBackground: (background: string) => change((d) => (d.background === background ? null : { ...d, background }), "background"),
    setGradient: (gradient: Gradient | null) =>
      change((d) => (JSON.stringify(d.gradient) === JSON.stringify(gradient) ? null : { ...d, gradient }), "gradient"),
    /** Changes the slide shape. Layers keep their place relative to the middle, so changing back puts them where they were. */
    setFormat: (format: FormatKey) =>
      change((d) => {
        if (d.format === format) return null;
        const dy = (FORMATS[format].height - FORMATS[d.format].height) / 2;
        return { ...d, format, layers: d.layers.map((l) => ({ ...l, y: l.y + dy })) };
      }),
    addSlide: (at: number) =>
      change((d) => {
        if (d.slideCount >= MAX_SLIDES || at < 0 || at > d.slideCount) return null;
        return { ...d, slideCount: d.slideCount + 1, layers: insertSlide(d.layers, at) };
      }),
    duplicateSlide: (at: number) =>
      change((d) => {
        if (d.slideCount >= MAX_SLIDES || at < 0 || at >= d.slideCount) return null;
        const copies = d.layers.filter((l) => slideOf(l) === at).length;
        if (d.layers.length + copies > MAX_LAYERS) return null;
        return { ...d, slideCount: d.slideCount + 1, layers: duplicateSlide(d.layers, at) };
      }),
    deleteSlide: (at: number) =>
      change((d) => {
        if (d.slideCount <= 1 || at < 0 || at >= d.slideCount) return null;
        return { ...d, slideCount: d.slideCount - 1, layers: removeSlide(d.layers, at) };
      }),
    moveSlide: (from: number, to: number) =>
      change((d) => {
        if (from === to || from < 0 || to < 0 || from >= d.slideCount || to >= d.slideCount) return null;
        return { ...d, layers: moveSlide(d.layers, d.slideCount, from, to) };
      }),
    duplicateLayer: (id: string) =>
      change((d) => {
        const l = d.layers.find((x) => x.id === id);
        if (!l || d.layers.length >= MAX_LAYERS) return null;
        return { ...d, layers: [...d.layers, { ...l, id: uid(), x: l.x + 40, y: l.y + 40 }] };
      }),
  };

  return {
    design: s.design,
    selectedId: s.selectedId,
    version: s.version,
    canUndo: s.past.length > 0,
    canRedo: s.future.length > 0,
    undo,
    redo,
    select,
    ...actions,
  };
};
