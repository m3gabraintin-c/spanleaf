"use client";
import Konva from "konva";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { FORMATS, SLIDE_WIDTH, canvasSize, slideIndexAt } from "@/lib/formats";
import { layerName, type Element } from "@/lib/doc";
import { cssFamily, fontState, loadFont, onFontsChange } from "@/lib/fonts";
import { token, tokenPx } from "@/lib/tokens-runtime";
import { FloatingElementMenu, IconButton } from "@/ui";
import { canvasRegistry, type ImageStatus } from "./registry";
import { useEditor } from "./store";

/** Space around the artboard, in screen pixels, so handles stay reachable at the edges. */
const PAD = 48;
/** How much of an element must stay over the artboard, so it can always be found and grabbed again. */
const KEEP_VISIBLE = 80;
/** How close an edge or centre has to get to a guide before it jumps onto it, in screen pixels. */
const SNAP_PX = 6;
const MENU_H = 44;

/** Keeps at least KEEP_VISIBLE canvas pixels (or the whole element, if it is smaller) over the artboard. */
function clampToArtboard(x: number, y: number, w: number, h: number, artW: number, artH: number) {
  const mx = Math.min(KEEP_VISIBLE, w);
  const my = Math.min(KEEP_VISIBLE, h);
  return {
    x: Math.min(artW - mx, Math.max(mx - w, x)),
    y: Math.min(artH - my, Math.max(my - h, y)),
  };
}

type Anchor = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "middle-left" | "middle-right";

/**
 * Which resize handles to show. Handles are a fixed size on screen, so on a small layer they overlap
 * and can't be told apart or grabbed. Show fewer, and never two on the same side that touch.
 */
function anchorsFor(isText: boolean, wPx: number, hPx: number, anchorPx: number): Anchor[] {
  const corners: Anchor[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const tiny = hPx < anchorPx * 1.2 || wPx < anchorPx * 1.2;
  if (tiny) return ["top-left", "bottom-right"]; // opposite corners, as far apart as the box allows
  if (isText) {
    if (hPx < anchorPx * 1.2 * 2) return ["middle-left", "bottom-right"];
    if (hPx >= anchorPx * 2.4) return [...corners, "middle-left", "middle-right"];
  }
  return corners;
}

/** A number that changes whenever a font finishes loading, so text can be measured and drawn again. */
function useFontsTick() {
  const n = useRef(0);
  return useSyncExternalStore(
    (cb) =>
      onFontsChange(() => {
        n.current++;
        cb();
      }),
    () => n.current,
    () => 0,
  );
}

function useImage(id: string, url: string | undefined, missing: boolean) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const set = (s: ImageStatus) => canvasRegistry.imageStatus.set(id, s);
    const cleanup = () => void canvasRegistry.imageStatus.delete(id);
    if (missing) {
      // The file is gone. Say so right away instead of waiting for an image that will never arrive.
      setImg(null);
      set("error");
      return cleanup;
    }
    if (!url) {
      setImg(null);
      set("loading");
      return cleanup;
    }
    set("loading");
    const i = new window.Image();
    // Required for export. Without it a cross-origin image taints the canvas and toBlob fails.
    i.crossOrigin = "anonymous";
    i.onload = () => {
      setImg(i);
      set("ready");
    };
    i.onerror = () => {
      setImg(null);
      set("error");
    };
    i.src = url;
    return () => {
      i.onload = null;
      i.onerror = null;
      cleanup();
    };
  }, [id, url, missing]);
  return img;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface NodeHooks {
  /** Moves a dragged element's position onto a guide when it is close, and reports the guides it used. */
  constrain: (node: Konva.Node, pos: { x: number; y: number }, el: Element) => { x: number; y: number };
  onDragStart: () => void;
  onDragEnd: () => void;
}

function useElementHandlers(el: Element, hooks: NodeHooks) {
  const select = useEditor((s) => s.select);
  const update = useEditor((s) => s.updateElement);
  return {
    id: el.id,
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    draggable: !el.locked,
    onMouseDown: () => {
      select(el.id);
      canvasRegistry.focusCanvas();
    },
    onTouchStart: () => {
      select(el.id);
      canvasRegistry.focusCanvas();
    },
    onDragStart: hooks.onDragStart,
    dragBoundFunc(this: Konva.Node, pos: { x: number; y: number }) {
      return hooks.constrain(this, pos, el);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      hooks.onDragEnd();
      update(el.id, { x: round2(e.target.x()), y: round2(e.target.y()) });
    },
  };
}

function ImageNode({ el, url, missing, hooks }: { el: Element; url?: string; missing: boolean; hooks: NodeHooks }) {
  const img = useImage(el.id, url, missing);
  const update = useEditor((s) => s.updateElement);
  const ink = useMemo(() => ({ fill: token("surface-hover"), stroke: token("border-input"), text: token("text-muted"), font: token("ff-sans") }), []);
  const common = {
    ...useElementHandlers(el, hooks),
    width: el.w,
    height: el.h,
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      const sx = node.scaleX();
      const sy = node.scaleY();
      // Fold the scale into width and height so the saved doc never carries a scale.
      node.scaleX(1);
      node.scaleY(1);
      update(el.id, {
        x: round2(node.x()),
        y: round2(node.y()),
        w: round2(Math.max(5, node.width() * sx)),
        h: round2(Math.max(5, node.height() * sy)),
        rotation: round2(node.rotation()),
      });
    },
  };

  if (missing) {
    return (
      <>
        <Rect {...common} fill={ink.fill} stroke={ink.stroke} strokeWidth={2} strokeScaleEnabled={false} dash={[10, 8]} />
        <Text
          x={el.x}
          y={el.y + el.h / 2 - 20}
          width={el.w}
          rotation={el.rotation}
          align="center"
          text={"Photo not found\nRemove it and add the photo again"}
          fontSize={Math.max(18, Math.min(36, el.w / 14))}
          fontFamily={ink.font}
          fill={ink.text}
          listening={false}
        />
      </>
    );
  }
  return <KImage {...common} image={img ?? undefined} />;
}

function TextNode({ el, hooks }: { el: Element; hooks: NodeHooks }) {
  const t = el.text!;
  const update = useEditor((s) => s.updateElement);
  const measure = useEditor((s) => s.measureElement);
  const setTool = useEditor((s) => s.setTool);
  const ref = useRef<Konva.Text>(null);
  useFontsTick();
  const ready = fontState(t.font, t.bold) === "ready";
  const handlers = useElementHandlers(el, hooks);

  useEffect(() => {
    void loadFont(t.font, t.bold);
  }, [t.font, t.bold]);

  // The layer's height comes from the laid-out text. Measure again whenever the text, the width or the font changes.
  useLayoutEffect(() => {
    const node = ref.current;
    if (node) measure(el.id, { h: round2(Math.max(1, node.height())) });
  }, [el.id, t.value, t.size, t.font, t.bold, el.w, ready, measure]);

  const edit = () => {
    setTool("text");
    setTimeout(() => canvasRegistry.focusTextField(), 50);
  };

  return (
    <Text
      // A new node when the font arrives, so Konva measures the real glyphs instead of the fallback ones.
      key={`${el.id}:${ready}`}
      ref={ref}
      {...handlers}
      width={el.w}
      text={t.value}
      fontFamily={cssFamily(t.font)}
      fontSize={t.size}
      fontStyle={t.bold ? "bold" : "normal"}
      fill={t.color}
      align={t.align}
      lineHeight={1.2}
      wrap="word"
      onDblClick={edit}
      onDblTap={edit}
      onTransformEnd={(e) => {
        const node = e.target;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        // A side handle changes the width the lines wrap at. A corner handle scales the type.
        const uniform = Math.abs(sx - sy) < 0.001;
        update(el.id, {
          x: round2(node.x()),
          y: round2(node.y()),
          w: round2(Math.max(20, node.width() * sx)),
          rotation: round2(node.rotation()),
          text: { ...t, size: uniform ? Math.min(1200, Math.max(6, round2(t.size * sx))) : t.size },
        });
      }}
    />
  );
}

export default function CanvasStage() {
  const format = useEditor((s) => s.format);
  const slideCount = useEditor((s) => s.slideCount);
  const elements = useEditor((s) => s.doc.elements);
  const background = useEditor((s) => s.doc.background.value);
  const selectedId = useEditor((s) => s.selectedId);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const mediaUrls = useEditor((s) => s.mediaUrls);
  const mediaMissing = useEditor((s) => s.mediaMissing);
  const select = useEditor((s) => s.select);
  const update = useEditor((s) => s.updateElement);
  const remove = useEditor((s) => s.removeElement);
  const duplicate = useEditor((s) => s.duplicateElement);
  const moveLayer = useEditor((s) => s.moveLayer);
  const toggleLock = useEditor((s) => s.toggleLock);
  const announce = useEditor((s) => s.announce);
  const fontsTick = useFontsTick();

  const scroller = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const contentRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);

  const colours = useMemo(
    () => ({
      accent: token("accent"),
      page: token("bg"),
      field: token("border-input"),
      ink: token("text"),
      guide: token("guide"),
      handle: tokenPx("layout-handle-visual") || 12,
      radius: tokenPx("r-sm") || 6,
    }),
    [],
  );
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  const f = FORMATS[format];
  const size = canvasSize(format, slideCount);
  const fit = view.h > 0 ? Math.min(1, Math.max(0.05, (view.h - PAD * 2) / f.height)) : 0.3;
  const scale = fit * zoom;

  /*
   * The browser can't draw a canvas as wide as a long carousel: Chrome gives up at 32,767 pixels, and
   * iPhones at about 16 million pixels in total. So the Konva stage is only ever as big as the visible
   * window. The scroll area around it is an empty box that gives the scrollbars their length, and the
   * stage slides across the artboard as you scroll.
   */
  const artW = size.width * scale;
  const artH = size.height * scale;
  const contentW = Math.max(view.w, artW + PAD * 2);
  const contentH = Math.max(view.h, artH + PAD * 2);
  const offX = (contentW - artW) / 2;
  const offY = (contentH - artH) / 2;

  const metrics = useRef({ scale, offX, offY });
  metrics.current = { scale, offX, offY };
  const latest = useRef({ elements, size, slideCount });
  latest.current = { elements, size, slideCount };
  /** The canvas point at the middle of the window. Zooming and resizing keep it there. */
  const anchor = useRef<{ cx: number; cy: number } | null>(null);
  const raf = useRef(0);

  const recordAnchor = useCallback(() => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const m = metrics.current;
    anchor.current = { cx: (el.scrollLeft + el.clientWidth / 2 - m.offX) / m.scale, cy: (el.scrollTop + el.clientHeight / 2 - m.offY) / m.scale };
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measureView = () => setView({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measureView);
    ro.observe(el);
    measureView();
    return () => ro.disconnect();
  }, []);

  // When the zoom or window size changes, scroll so the same canvas point stays in the middle.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || view.w === 0) return;
    if (anchor.current) {
      el.scrollLeft = anchor.current.cx * scale + offX - el.clientWidth / 2;
      el.scrollTop = anchor.current.cy * scale + offY - el.clientHeight / 2;
    }
    setScroll({ left: el.scrollLeft, top: el.scrollTop });
    recordAnchor();
  }, [scale, view.w, view.h, offX, offY, recordAnchor]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    recordAnchor();
    // Move the stage right now so it never lags the scroll bar, and keep React's copy in step.
    stageRef.current?.position({ x: metrics.current.offX - el.scrollLeft, y: metrics.current.offY - el.scrollTop });
    stageRef.current?.batchDraw();
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setScroll({ left: el.scrollLeft, top: el.scrollTop }));
  };

  const centreCanvasX = useCallback(() => {
    const el = scroller.current;
    if (!el) return SLIDE_WIDTH / 2;
    const m = metrics.current;
    return (el.scrollLeft + el.clientWidth / 2 - m.offX) / m.scale;
  }, []);

  const updateCurrent = useCallback(() => setCurrent(slideIndexAt(centreCanvasX(), slideCount)), [centreCanvasX, slideCount]);

  useEffect(() => {
    updateCurrent();
    canvasRegistry.currentSlide = () => slideIndexAt(centreCanvasX(), slideCount);
  }, [updateCurrent, centreCanvasX, slideCount, view, zoom, scroll]);

  useEffect(() => {
    canvasRegistry.stage = stageRef.current;
    canvasRegistry.content = contentRef.current;
    canvasRegistry.focusCanvas = () => scroller.current?.focus({ preventScroll: true });
    return () => {
      canvasRegistry.stage = null;
      canvasRegistry.content = null;
      canvasRegistry.focusCanvas = () => {};
      cancelAnimationFrame(raf.current);
    };
  }, []);

  // ---------------------------------------------------------------- snapping

  const altDown = useRef(false);
  const guideRef = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const guideRaf = useRef(0);
  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Alt") altDown.current = true;
    };
    const up = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Alt") altDown.current = false;
    };
    const blur = () => (altDown.current = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const showGuides = useCallback((g: { x: number[]; y: number[] }) => {
    guideRef.current = g;
    if (guideRaf.current) return;
    guideRaf.current = requestAnimationFrame(() => {
      guideRaf.current = 0;
      setGuides({ x: [...guideRef.current.x], y: [...guideRef.current.y] });
    });
  }, []);

  /**
   * Runs for every pointer move while dragging. The pointer gives a wanted position. If an edge or the
   * middle of the element is within a few pixels of a slide edge, a slide centre, or another element's
   * edge or centre, the element is moved onto it. Holding Alt turns this off.
   */
  const constrain = useCallback(
    (node: Konva.Node, pos: { x: number; y: number }, el: Element) => {
      const st = node.getStage();
      if (!st) return pos;
      const s = st.scaleX();
      const { elements: all, size: art, slideCount: n } = latest.current;
      let x = (pos.x - st.x()) / s;
      let y = (pos.y - st.y()) / s;
      const matched = { x: [] as number[], y: [] as number[] };

      if (!altDown.current) {
        const layer = node.getLayer();
        const here = node.position();
        const bb = layer ? node.getClientRect({ relativeTo: layer }) : { x: here.x, y: here.y, width: el.w, height: el.h };
        const box = { x: bb.x + (x - here.x), y: bb.y + (y - here.y), w: bb.width, h: bb.height };
        const thr = SNAP_PX / s;
        const tx: number[] = [];
        const ty: number[] = [0, art.height / 2, art.height];
        for (let i = 0; i <= n; i++) tx.push(i * SLIDE_WIDTH);
        for (let i = 0; i < n; i++) tx.push(i * SLIDE_WIDTH + SLIDE_WIDTH / 2);
        for (const o of all) {
          if (o.id === el.id || Math.abs(o.rotation % 360) > 0.01) continue;
          tx.push(o.x, o.x + o.w / 2, o.x + o.w);
          ty.push(o.y, o.y + o.h / 2, o.y + o.h);
        }
        const cx = [box.x, box.x + box.w / 2, box.x + box.w];
        const cy = [box.y, box.y + box.h / 2, box.y + box.h];
        const best = (cands: number[], targets: number[]) => {
          let d = 0;
          let min = thr + 1;
          for (const c of cands)
            for (const t of targets)
              if (Math.abs(t - c) < min) {
                min = Math.abs(t - c);
                d = t - c;
              }
          return min <= thr ? d : 0;
        };
        const dx = best(cx, tx);
        const dy = best(cy, ty);
        x += dx;
        y += dy;
        const near = (c: number, t: number) => Math.abs(t - c) < 0.5;
        for (const t of tx) if (cx.some((c) => near(c + dx, t)) && !matched.x.includes(t)) matched.x.push(t);
        for (const t of ty) if (cy.some((c) => near(c + dy, t)) && !matched.y.includes(t)) matched.y.push(t);
      }

      const c = clampToArtboard(x, y, el.w, el.h, art.width, art.height);
      showGuides(matched);
      return { x: c.x * s + st.x(), y: c.y * s + st.y() };
    },
    [showGuides],
  );

  const hooks: NodeHooks = useMemo(
    () => ({
      constrain,
      onDragStart: () => setDragging(true),
      onDragEnd: () => {
        setDragging(false);
        showGuides({ x: [], y: [] });
      },
    }),
    [constrain, showGuides],
  );

  // ---------------------------------------------------------------- selection handles and the floating menu

  const selected = elements.find((e) => e.id === selectedId);
  const findNode = useCallback((id: string) => contentRef.current?.getChildren().find((n) => n.id() === id), []);

  // Attach the resize handles to the selected element, with the handles that suit what it is.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selected && !selected.locked ? findNode(selected.id) : undefined;
    if (selected) {
      const anchorPx = coarse ? colours.handle * 2 : colours.handle;
      tr.enabledAnchors(anchorsFor(selected.type === "text", selected.w * scale, selected.h * scale, anchorPx));
    }
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, findNode, fontsTick, scale, coarse, colours.handle]);

  // Put the floating menu above the selected element, or below it when there is no room above.
  useLayoutEffect(() => {
    if (!selected || dragging || view.w === 0) {
      setMenu(null);
      return;
    }
    const node = findNode(selected.id);
    if (!node) {
      setMenu(null);
      return;
    }
    const r = node.getClientRect(); // in the stage's own pixels, which are the window's pixels
    const half = 70;
    const left = Math.min(view.w - half - 4, Math.max(half + 4, r.x + r.width / 2));
    let top = r.y - MENU_H - 10 - (selected.locked ? 0 : coarse ? 36 : 22); // clear of the rotate handle
    if (top < 4) top = r.y + r.height + 10 + (coarse ? 18 : 8);
    top = Math.min(view.h - MENU_H - 4, Math.max(4, top));
    setMenu({ left, top });
  }, [selected, dragging, scroll, scale, view, fontsTick, findNode, coarse]);

  const goToSlide = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const target = Math.min(slideCount - 1, Math.max(0, i));
    const m = metrics.current;
    el.scrollTo({ left: m.offX + (target + 0.5) * SLIDE_WIDTH * m.scale - el.clientWidth / 2, behavior: "smooth" });
  };

  const doDuplicate = (id: string) => {
    const el = elements.find((e) => e.id === id);
    const made = duplicate(id, 48, { w: size.width, h: size.height });
    if (made && el) announce(`Duplicated ${layerName(el)}`);
  };
  const doToggleLock = (id: string) => {
    const el = elements.find((e) => e.id === id);
    toggleLock(id);
    if (el) announce(`${layerName(el)} ${el.locked ? "unlocked" : "locked"}`);
  };
  const doRemove = (id: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    if (el.locked) {
      announce(`${layerName(el)} is locked. Unlock it to delete it.`);
      return;
    }
    remove(id);
    announce(`Deleted ${layerName(el)}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const el = elements.find((x) => x.id === selectedId);
    if (e.key === "Escape") {
      select(null);
      return;
    }
    if (!el) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      doDuplicate(el.id);
      return;
    }
    if (mod) return; // leave undo, redo, copy and the rest to the browser and the window handler
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      doRemove(el.id);
      return;
    }
    if (e.key === "]" || e.key === "[" || e.key === "}" || e.key === "{") {
      e.preventDefault();
      if (el.locked) return announce(`${layerName(el)} is locked.`);
      moveLayer(el.id, e.key === "]" ? "forward" : e.key === "[" ? "backward" : e.key === "}" ? "front" : "back");
      announce(`${layerName(el)} moved ${e.key === "]" ? "forward" : e.key === "[" ? "backward" : e.key === "}" ? "to the front" : "to the back"}`);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      if (el.locked) return announce(`${layerName(el)} is locked.`);
      const c = clampToArtboard(el.x + m[0], el.y + m[1], el.w, el.h, size.width, size.height);
      update(el.id, { x: c.x, y: c.y }, { key: `nudge:${el.id}` });
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scroller}
        role="region"
        aria-label="Canvas area"
        aria-describedby="canvas-help"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto bg-canvas"
      >
        <p id="canvas-help" className="sr-only">
          Select a layer in the Layers panel or click it, then use the arrow keys to move it. Hold Shift to move 10 pixels. Delete removes it. Control or Command plus D duplicates it. Square brackets change its layer order. Hold Alt while dragging to turn off snapping.
        </p>
        {/* An empty box as long as the whole carousel, so the scroll bars are the right length. */}
        <div style={{ width: contentW, height: contentH, position: "relative" }}>
          {/* The window the stage is drawn in. It stays put while the box above scrolls under it. */}
          <div style={{ position: "sticky", top: 0, left: 0, width: view.w || 1, height: view.h || 1 }}>
            <Stage
              ref={stageRef}
              width={view.w || 1}
              height={view.h || 1}
              x={offX - scroll.left}
              y={offY - scroll.top}
              scaleX={scale}
              scaleY={scale}
              onMouseDown={(e) => {
                if (e.target === e.target.getStage()) {
                  select(null);
                  scroller.current?.focus({ preventScroll: true });
                }
              }}
              onTouchStart={(e) => {
                if (e.target === e.target.getStage()) select(null);
              }}
            >
              {/* Backdrop: the soft shadow under the artboard. Never exported. */}
              <Layer listening={false}>
                <Rect width={size.width} height={size.height} fill={colours.page} shadowColor={colours.ink} shadowOpacity={0.18} shadowBlur={16} shadowOffsetY={2} />
              </Layer>

              {/* Content: this layer, and only this layer, is what gets exported. */}
              <Layer ref={contentRef}>
                <Rect width={size.width} height={size.height} fill={background} listening={false} />
                {elements.map((el) =>
                  el.type === "image" ? (
                    <ImageNode
                      key={el.id}
                      el={el}
                      url={el.mediaId ? mediaUrls[el.mediaId]?.url : undefined}
                      missing={!!el.mediaId && !!mediaMissing[el.mediaId]}
                      hooks={hooks}
                    />
                  ) : el.type === "text" && el.text ? (
                    <TextNode key={el.id} el={el} hooks={hooks} />
                  ) : null,
                )}
              </Layer>

              {/* Editing aids: slide dividers, snap guides and selection handles. Never exported. */}
              <Layer>
                {Array.from({ length: slideCount - 1 }, (_, i) => (
                  <Line
                    key={i}
                    points={[(i + 1) * SLIDE_WIDTH, 0, (i + 1) * SLIDE_WIDTH, size.height]}
                    stroke={colours.field}
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                ))}
                {guides.x.map((gx) => (
                  <Line key={`gx${gx}`} name="guide" points={[gx, 0, gx, size.height]} stroke={colours.guide} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
                ))}
                {guides.y.map((gy) => (
                  <Line key={`gy${gy}`} name="guide" points={[0, gy, size.width, gy]} stroke={colours.guide} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
                ))}
                <Transformer
                  ref={trRef}
                  flipEnabled={false}
                  rotateEnabled
                  keepRatio
                  borderStroke={colours.accent}
                  borderStrokeWidth={2}
                  anchorStroke={colours.accent}
                  anchorFill={colours.page}
                  anchorStrokeWidth={2}
                  anchorSize={coarse ? colours.handle * 2 : colours.handle}
                  anchorCornerRadius={colours.radius / 2}
                  rotateAnchorOffset={coarse ? 40 : 28}
                  anchorStyleFunc={(a) => {
                    // A bigger invisible target on touch screens, so handles are easy to grab.
                    a.hitStrokeWidth(coarse ? 36 : 12);
                  }}
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 24 || newBox.height < 12 ? oldBox : newBox)}
                />
              </Layer>
            </Stage>

            {menu && selected ? (
              <div style={{ position: "absolute", left: menu.left, top: menu.top, transform: "translateX(-50%)", zIndex: "var(--z-toolbar)" }}>
                <FloatingElementMenu
                  locked={!!selected.locked}
                  onDuplicate={() => doDuplicate(selected.id)}
                  onToggleLock={() => doToggleLock(selected.id)}
                  onDelete={() => doRemove(selected.id)}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 border-t border-line bg-page px-1 py-1 sm:px-2">
        <div className="flex items-center gap-1" role="group" aria-label="Slide navigation">
          <IconButton label="Previous slide" disabled={current <= 0} onClick={() => goToSlide(current - 1)}>
            <ChevronLeft aria-hidden className="size-5" />
          </IconButton>
          <span className="min-w-[5.5rem] text-center text-sm text-muted tabular-nums" aria-live="polite">
            Slide {current + 1} of {slideCount}
          </span>
          <IconButton label="Next slide" disabled={current >= slideCount - 1} onClick={() => goToSlide(current + 1)}>
            <ChevronRight aria-hidden className="size-5" />
          </IconButton>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <IconButton label="Zoom out" disabled={zoom <= 0.25} onClick={() => setZoom(zoom / 1.25)}>
            <Minus aria-hidden className="size-5" />
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset zoom to fit"
            className="h-9 min-w-12 rounded-md px-1 text-sm text-muted tabular-nums t-fast hover:bg-surface-hover pointer-coarse:h-11"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(zoom * 1.25)}>
            <Plus aria-hidden className="size-5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
