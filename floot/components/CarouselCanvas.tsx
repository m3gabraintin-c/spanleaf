import { useEffect, useMemo, useRef, useState, MutableRefObject } from "react";
import Konva from "konva";
import { Stage, Layer as KLayer, Rect, Image as KImage, Text as KText, TextPath, Line, Shape, Transformer, Group } from "react-konva";
import { Minus, Plus } from "lucide-react";
import { maskPath } from "../helpers/maskPath";
import { Design, FORMATS, Layer, SLIDE_WIDTH, gradientLine, pageLabel, slideOf, trimWindow } from "../helpers/carouselModel";
import { clipUrl } from "../helpers/videoClips";
import { patternTile } from "../helpers/patterns";
import { measureText } from "../helpers/measureText";
import { applyLook, cropRect, isAdjusted, polaroidBox } from "../helpers/photoStyle";
import { arcFor, oneLine } from "../helpers/curvedText";
import { STRETCHY, tapeOutline } from "../helpers/stickerArt";
import { outlinedImage } from "../helpers/stickerEdge";
import { hasMarkup, layoutRich, plainText } from "../helpers/richText";
import { richMeasure } from "../helpers/measureText";
import { Guide, snapBox } from "../helpers/snapping";
import { PenMode, Point, localPoints, strokeHit, strokeLayer, tracePath } from "../helpers/strokes";
import { useThemeMode } from "../helpers/themeMode";
import styles from "./CarouselCanvas.module.css";

const PAD = 28;

/** Warmth, tint, vignette and grain, as a Konva filter. The settings are read from the node's "look" attribute. */
const lookFilter = function (this: Konva.Node, imageData: ImageData) {
  applyLook(imageData.data, imageData.width, imageData.height, this.getAttr("look") ?? {});
} as unknown as typeof Konva.Filters.Brighten;

const imageCache = new Map<string, HTMLImageElement>();
const useImage = (src: string | undefined) => {
  const [img, setImg] = useState<HTMLImageElement | null>(src ? (imageCache.get(src) ?? null) : null);
  useEffect(() => {
    if (!src) return setImg(null);
    const cached = imageCache.get(src);
    if (cached) return setImg(cached);
    const el = new window.Image();
    el.onload = () => {
      imageCache.set(src, el);
      setImg(el);
    };
    el.src = src;
  }, [src]);
  return img;
};

export type Pen = { mode: PenMode; color: string; size: number };

type Props = {
  design: Design;
  /** What is selected. The first is the one the panels show; shift-click adds or removes others. */
  selectedIds: string[];
  onSelect: (id: string | null, additive?: boolean) => void;
  onPatch: (id: string, patch: Partial<Layer>, key?: string) => void;
  stageRef: MutableRefObject<Konva.Stage | null>;
  contentRef: MutableRefObject<Konva.Layer | null>;
  className?: string;
  /** Scrolls to a slide whenever the nonce changes. */
  goTo: { index: number; nonce: number } | null;
  /** Told which slide is in the middle of the view. */
  onCurrentSlide: (index: number) => void;
  /** Drawing: pointer strokes make layers instead of moving them. */
  drawing: boolean;
  pen: Pen;
  onStroke: (layer: Layer) => void;
  onErase: (ids: string[]) => void;
  /** Whether video layers play in the editor. They are still at their first frame otherwise. */
  playVideos: boolean;
  /** Keyboard: Tab and Shift+Tab on the canvas select the next or previous layer. Returns false at either end, so focus moves on. */
  onKeyCycle: (dir: 1 | -1) => boolean;
  /** Keyboard: Enter on the canvas opens the selected layer's settings (for text, its words). */
  onActivate: () => void;
};

/**
 * The wide canvas. Only the part in view is a real canvas, so a project with hundreds of slides stays
 * light: the page scrolls, and the stage moves the other way to match.
 */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];

export const CarouselCanvas = ({ design, selectedIds, onSelect, onPatch, stageRef, contentRef, className, goTo, onCurrentSlide, drawing, pen, onStroke, onErase, playVideos, onKeyCycle, onActivate }: Props) => {
  // Dark or light changes the colours of the editing aids. Exports never include them.
  const { mode } = useThemeMode();
  const dark = mode === "dark" || (mode === "auto" && typeof document !== "undefined" && document.body.classList.contains("dark"));
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  /** 1 fits a slide's height in view; more is closer. */
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<Guide[]>([]);
  const nodes = useRef(new Map<string, Konva.Node>());
  const transformer = useRef<Konva.Transformer>(null);
  const liveRef = useRef<Konva.Line>(null);
  const live = useRef<{ pts: Point[]; style: { color: string; width: number; opacity: number } } | null>(null);
  const erasing = useRef(false);

  const height = FORMATS[design.format].height;
  const total = design.slideCount * SLIDE_WIDTH;
  const fit = Math.max(0.04, Math.min((view.h - PAD * 2) / height, (view.w - PAD * 2) / SLIDE_WIDTH));
  const scale = fit * zoom;
  const contentH = height * scale + PAD * 2;
  const fitsTall = contentH <= view.h;
  const latest = useRef({ design, pen, scale, zoom });
  latest.current = { design, pen, scale, zoom };

  useEffect(() => {
    if (!goTo || !scroller.current) return;
    const i = Math.min(design.slideCount - 1, Math.max(0, goTo.index));
    const centre = PAD + (i + 0.5) * SLIDE_WIDTH * scale;
    scroller.current.scrollTo({ left: Math.max(0, centre - view.w / 2), behavior: "smooth" });
    // Only a new request should scroll, not a change in size or in the slides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo?.nonce]);

  const current = Math.min(design.slideCount - 1, Math.max(0, Math.floor((scrollLeft + view.w / 2 - PAD) / (SLIDE_WIDTH * scale))));
  useEffect(() => onCurrentSlide(current), [current, onCurrentSlide]);

  // Zooming keeps the point that was in the middle in the middle.
  const zoomTo = (z: number) => {
    const el = scroller.current;
    const next = Math.min(ZOOMS[ZOOMS.length - 1], Math.max(ZOOMS[0], z));
    if (!el || next === zoom) return;
    const cx = (el.scrollLeft + view.w / 2 - PAD) / scale;
    const cy = (el.scrollTop + view.h / 2 - PAD) / scale;
    setZoom(next);
    requestAnimationFrame(() => el.scrollTo({ left: cx * fit * next + PAD - view.w / 2, top: cy * fit * next + PAD - view.h / 2 }));
  };
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  const step = (dir: 1 | -1) => {
    const at = ZOOMS.indexOf(latest.current.zoom);
    zoomRef.current(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + dir))]);
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Ctrl or Cmd with the wheel, or a trackpad pinch, zooms the canvas instead of the page.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      step(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // step reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Fonts load after the first draw, so draw again when they are ready.
    void document.fonts?.ready.then(() => contentRef.current?.batchDraw());
  }, [contentRef, design.layers]);

  const selectedSet = new Set(selectedIds);
  const selected = selectedIds.length === 1 ? (design.layers.find((l) => l.id === selectedIds[0]) ?? null) : null;
  const multi = selectedIds.length > 1;
  useEffect(() => {
    const tr = transformer.current;
    if (!tr) return;
    const picked = drawing ? [] : design.layers.filter((l) => selectedSet.has(l.id) && !l.locked).map((l) => nodes.current.get(l.id)).filter((n): n is Konva.Node => !!n);
    tr.nodes(picked);
    tr.getLayer()?.batchDraw();
    // selectedSet is rebuilt from selectedIds each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(","), design.layers, scale, drawing]);

  const first = Math.max(0, Math.floor((scrollLeft - PAD) / (SLIDE_WIDTH * scale)) - 1);
  const last = Math.min(design.slideCount - 1, Math.ceil((scrollLeft + view.w - PAD) / (SLIDE_WIDTH * scale)) + 1);
  const dividers = useMemo(() => {
    const out: number[] = [];
    for (let i = Math.max(1, first); i <= last; i++) out.push(i);
    return out;
  }, [first, last]);

  // ---- snapping while a layer is dragged
  // When several layers are selected, dragging one moves them all by the same amount.
  const groupDrag = useRef<{ id: string; from: Map<string, { x: number; y: number }> } | null>(null);
  const snapWhileDragging = (layer: Layer, node: Konva.Node, alt: boolean) => {
    if (multi && selectedSet.has(layer.id)) {
      if (groupDrag.current?.id !== layer.id) {
        groupDrag.current = { id: layer.id, from: new Map(latest.current.design.layers.filter((l) => selectedSet.has(l.id) && !l.locked).map((l) => [l.id, { x: l.x, y: l.y }])) };
      }
      const dx = node.x() - layer.x;
      const dy = node.y() - layer.y;
      for (const [id, p] of groupDrag.current.from) if (id !== layer.id) nodes.current.get(id)?.position({ x: p.x + dx, y: p.y + dy });
      return;
    }
    if (alt || layer.rotation !== 0) return setGuides((g) => (g.length ? [] : g));
    const d = latest.current.design;
    const slide = Math.min(d.slideCount - 1, Math.max(0, slideOf(layer)));
    const others = d.layers.filter((o) => o.id !== layer.id && o.rotation === 0 && slideOf(o) === slide).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
    const snapped = snapBox({ x: node.x(), y: node.y(), w: layer.w, h: layer.h }, others, { left: slide * SLIDE_WIDTH, width: SLIDE_WIDTH, height: FORMATS[d.format].height }, 8 / latest.current.scale);
    node.position({ x: snapped.x, y: snapped.y });
    setGuides((g) => (JSON.stringify(g) === JSON.stringify(snapped.guides) ? g : snapped.guides));
  };

  // ---- drawing
  const pointer = (): Point | null => {
    const st = stageRef.current;
    const p = st?.getPointerPosition();
    return st && p ? { x: (p.x - st.x()) / st.scaleX(), y: (p.y - st.y()) / st.scaleY() } : null;
  };

  const eraseAt = (p: Point) => {
    const r = Math.max(8, latest.current.pen.size);
    const ids = latest.current.design.layers.filter((l) => l.type === "drawing" && !l.locked && strokeHit(l, p, r)).map((l) => l.id);
    if (ids.length) onErase(ids);
  };

  const beginDraw = () => {
    if (!drawing) return;
    const p = pointer();
    if (!p) return;
    const pen = latest.current.pen;
    if (pen.mode === "eraser") {
      erasing.current = true;
      eraseAt(p);
      return;
    }
    const style = pen.mode === "highlighter" ? { color: pen.color, width: pen.size * 2.5, opacity: 0.4 } : { color: pen.color, width: pen.size, opacity: 1 };
    live.current = { pts: [p], style };
    const line = liveRef.current;
    if (line) {
      line.setAttrs({ points: [p.x, p.y, p.x + 0.01, p.y], stroke: style.color, strokeWidth: style.width, opacity: style.opacity, visible: true });
      line.getLayer()?.batchDraw();
    }
  };

  const moveDraw = () => {
    if (!drawing) return;
    const p = pointer();
    if (!p) return;
    if (erasing.current) return eraseAt(p);
    const l = live.current;
    if (!l) return;
    const last = l.pts[l.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2 / latest.current.scale) return;
    l.pts.push(p);
    const line = liveRef.current;
    if (line) {
      line.points(l.pts.flatMap((q) => [q.x, q.y]));
      line.getLayer()?.batchDraw();
    }
  };

  const endDraw = () => {
    erasing.current = false;
    const l = live.current;
    if (!l) return;
    live.current = null;
    const p = pointer();
    const pts = p && (p.x !== l.pts[l.pts.length - 1].x || p.y !== l.pts[l.pts.length - 1].y) ? [...l.pts, p] : l.pts;
    liveRef.current?.visible(false);
    liveRef.current?.getLayer()?.batchDraw();
    onStroke(strokeLayer(pts, l.style));
  };

  useEffect(() => {
    if (drawing) onSelect(null);
    const c = stageRef.current?.container();
    if (c) c.style.cursor = drawing ? "crosshair" : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);

  const gradient = design.gradient;
  const line = gradient ? gradientLine(gradient.angle, total, height) : null;
  const textSelected = selected?.type === "text";
  const stretchy = (selected?.type === "sticker" && STRETCHY.includes(selected.sticker ?? "")) || selected?.type === "shape";
  // Changes to several layers at once share an undo step.
  const patch = multi ? (id: string, p: Partial<Layer>) => onPatch(id, p, "group") : onPatch;
  const endDrag = () => {
    setGuides([]);
    const g = groupDrag.current;
    groupDrag.current = null;
    if (!g) return;
    for (const id of g.from.keys()) {
      const n = nodes.current.get(id);
      if (id !== g.id && n) onPatch(id, { x: Math.round(n.x() * 100) / 100, y: Math.round(n.y() * 100) / 100 }, "group");
    }
  };
  const common = { nodes: nodes.current, onSelect, onPatch: patch, onDragMove: snapWhileDragging, onDragEnd: endDrag, disabled: drawing };

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
    <div
      ref={scroller}
      className={styles.scroller}
      style={{ touchAction: drawing ? "none" : undefined }}
      tabIndex={0}
      role="region"
      aria-label="Slides"
      aria-describedby="canvas-keys"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || drawing) return;
        if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
          if (onKeyCycle(e.shiftKey ? -1 : 1)) e.preventDefault();
        } else if (e.key === "Enter" && selectedIds.length === 1) {
          e.preventDefault();
          onActivate();
        }
      }}
      onScroll={(e) => {
        setScrollLeft(e.currentTarget.scrollLeft);
        setScrollTop(e.currentTarget.scrollTop);
      }}
    >
      <span id="canvas-keys" className={styles.srOnly}>
        Tab and Shift Tab pick the next or previous layer. Arrow keys move it, with Shift for bigger steps. Enter edits it. Delete removes it. Escape lets go.
      </span>
      <div className={styles.spacer} style={{ width: total * scale + PAD * 2, height: Math.max(view.h, contentH) }}>
        <div className={styles.stick} style={{ width: view.w, height: view.h }}>
          {view.w > 0 && (
            <Stage
              ref={stageRef}
              width={view.w}
              height={view.h}
              x={PAD - scrollLeft}
              y={fitsTall ? Math.max(PAD, (view.h - height * scale) / 2) : PAD - scrollTop}
              scaleX={scale}
              scaleY={scale}
              onMouseDown={(e) => {
                if (drawing) return beginDraw();
                if (e.target === e.target.getStage()) onSelect(null);
              }}
              onTouchStart={(e) => {
                if (drawing) return beginDraw();
                if (e.target === e.target.getStage()) onSelect(null);
              }}
              onMouseMove={moveDraw}
              onTouchMove={(e) => {
                if (drawing && e.evt.cancelable) e.evt.preventDefault();
                moveDraw();
              }}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchEnd={endDraw}
              onTouchCancel={endDraw}
            >
              <KLayer ref={contentRef} listening={!drawing}>
                <Rect width={total} height={height} fill={design.background} listening={false} />
                {gradient && line && (
                  <Rect
                    width={total}
                    height={height}
                    listening={false}
                    fillLinearGradientStartPoint={line.start}
                    fillLinearGradientEndPoint={line.end}
                    fillLinearGradientColorStops={[0, gradient.from, 1, gradient.to]}
                  />
                )}
                {design.pattern && (
                  <Rect width={total} height={height} listening={false} fillPatternImage={patternTile(design.pattern) as unknown as HTMLImageElement} fillPatternRepeat="repeat" />
                )}
                {design.layers.map((l) =>
                  l.type === "video" ? (
                    <VideoNode key={l.id} layer={l} {...common} playing={playVideos} />
                  ) : l.type === "text" ? (
                    <WordsNode key={l.id} layer={l} {...common} />
                  ) : l.type === "drawing" ? (
                    <DrawingNode key={l.id} layer={l} {...common} />
                  ) : l.type === "sticker" && l.sticker === "tape" ? (
                    <TapeNode key={l.id} layer={l} {...common} />
                  ) : l.type === "shape" ? (
                    <ShapeNode key={l.id} layer={l} {...common} />
                  ) : (
                    <PictureNode key={l.id} layer={l} {...common} />
                  ),
                )}
                {design.pageNumbers &&
                  Array.from({ length: design.slideCount }, (_, i) => {
                    const pn = design.pageNumbers!;
                    const size = pn.style === "dots" ? 30 : 40;
                    const w = 600;
                    const x = pn.position === "bottom-centre" ? i * SLIDE_WIDTH + (SLIDE_WIDTH - w) / 2 : i * SLIDE_WIDTH + SLIDE_WIDTH - w - 48;
                    const y = pn.position === "top-right" ? 40 : height - 40 - size;
                    return (
                      <KText
                        key={`pn${i}`}
                        text={pageLabel(pn.style, i, design.slideCount)}
                        x={x}
                        y={y}
                        width={w}
                        align={pn.position === "bottom-centre" ? "center" : "right"}
                        fontFamily="Inter Tight"
                        fontStyle="600"
                        fontSize={size}
                        fill={pn.color}
                        listening={false}
                      />
                    );
                  })}
              </KLayer>
              {/* Editing aids: never exported. */}
              <KLayer listening={!drawing}>
                <Rect width={total} height={height} stroke={dark ? "#4a554b" : "#d6ceba"} strokeWidth={1 / scale} listening={false} />
                {dividers.map((i) => (
                  <Line key={i} points={[i * SLIDE_WIDTH, 0, i * SLIDE_WIDTH, height]} stroke={dark ? "#ece6da" : "#1d211e"} opacity={0.4} dash={[10 / scale, 8 / scale]} strokeWidth={1.5 / scale} listening={false} />
                ))}
                {guides.map((g, i) => (
                  <Line
                    key={`${g.axis}${g.at}${i}`}
                    points={g.axis === "x" ? [g.at, 0, g.at, height] : [0, g.at, total, g.at]}
                    stroke="#e5484d"
                    strokeWidth={1.5 / scale}
                    listening={false}
                  />
                ))}
                <Line ref={liveRef} visible={false} points={[0, 0, 0, 0]} lineCap="round" lineJoin="round" tension={0.4} listening={false} />
                <Transformer
                  ref={transformer}
                  rotateEnabled
                  keepRatio={!textSelected && !stretchy}
                  enabledAnchors={
                    textSelected
                      ? ["middle-left", "middle-right"]
                      : stretchy
                        ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]
                        : ["top-left", "top-right", "bottom-left", "bottom-right"]
                  }
                  anchorSize={Math.max(10, 12 / scale)}
                  borderStroke={dark ? "#4fb58a" : "#1f6f54"}
                  anchorStroke={dark ? "#4fb58a" : "#1f6f54"}
                  anchorFill={dark ? "#1e241f" : "#fbf9f4"}
                  boundBoxFunc={(oldBox, box) => (Math.abs(box.width) < 24 || Math.abs(box.height) < 8 ? oldBox : box)}
                />
              </KLayer>
            </Stage>
          )}
        </div>
      </div>
    </div>
    <div className={styles.zoom} role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOMS[0]} onClick={() => step(-1)}>
        <Minus size={14} />
      </button>
      <button type="button" className={styles.zoomLevel} aria-label="Fit a slide in view" title="Fit a slide in view" onClick={() => zoomTo(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}>
        <Plus size={14} />
      </button>
    </div>
    </div>
  );
};

type NodeProps = {
  layer: Layer;
  nodes: Map<string, Konva.Node>;
  onSelect: (id: string | null, additive?: boolean) => void;
  onPatch: (id: string, patch: Partial<Layer>, key?: string) => void;
  onDragMove: (layer: Layer, node: Konva.Node, alt: boolean) => void;
  onDragEnd: () => void;
  disabled: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A video layer: the clip in its box, still or playing, muted. Its node is named "video" so export can find the clip. */
const VideoNode = ({ layer, nodes, onSelect, onPatch, onDragMove, onDragEnd, disabled, playing }: NodeProps & { playing: boolean }) => {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [missing, setMissing] = useState(false);
  const ref = useRef<Konva.Image | null>(null);
  // Only the trimmed part plays. Paused, the clip shows the first frame of its trim.
  const { start, end } = trimWindow(layer);

  useEffect(() => {
    let alive = true;
    let el: HTMLVideoElement | null = null;
    if (!layer.mediaKey) return setMissing(true);
    void clipUrl(layer.mediaKey).then((url) => {
      if (!alive) return;
      if (!url) return setMissing(true);
      el = document.createElement("video");
      el.muted = true;
      el.loop = true;
      el.playsInline = true;
      el.preload = "auto";
      el.onloadeddata = () => {
        if (!alive) return;
        setVideo(el);
        ref.current?.getLayer()?.batchDraw();
      };
      el.onerror = () => alive && setMissing(true);
      el.src = url;
    });
    return () => {
      alive = false;
      el?.pause();
    };
  }, [layer.mediaKey]);

  useEffect(() => {
    if (!video) return;
    if (!playing) {
      video.pause();
      const show = () => ref.current?.getLayer()?.batchDraw();
      video.addEventListener("seeked", show, { once: true });
      if (Math.abs(video.currentTime - start) > 0.01) video.currentTime = start;
      show();
      return;
    }
    if (video.currentTime < start || (end > start && video.currentTime >= end)) video.currentTime = start;
    void video.play().catch(() => undefined);
    const anim = new Konva.Animation(() => {
      if (end > start && video.currentTime >= end - 0.02) video.currentTime = start;
    }, ref.current?.getLayer());
    anim.start();
    return () => {
      anim.stop();
      video.pause();
    };
  }, [video, playing, start, end]);

  const common = {
    x: layer.x,
    y: layer.y,
    width: layer.w,
    height: layer.h,
    rotation: layer.rotation,
    opacity: layer.opacity ?? 1,
    draggable: !layer.locked && !disabled,
    onMouseDown: () => !disabled && onSelect(layer.id),
    onTouchStart: () => !disabled && onSelect(layer.id),
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd();
      onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      const sx = n.scaleX();
      const sy = n.scaleY();
      n.scaleX(1);
      n.scaleY(1);
      onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w: Math.max(24, Math.round(n.width() * sx)), h: Math.max(24, Math.round(n.height() * sy)), rotation: r2(n.rotation()) });
    },
  };

  if (missing) {
    return (
      <KText
        {...common}
        ref={(n) => {
          if (n) nodes.set(layer.id, n);
          else nodes.delete(layer.id);
        }}
        text="This video isn't in this browser. Add it again."
        fontFamily="Inter Tight"
        fontSize={34}
        align="center"
        verticalAlign="middle"
        fill="#b3392f"
      />
    );
  }

  return (
    <KImage
      {...common}
      name="video"
      id={layer.id}
      ref={(n) => {
        ref.current = n;
        if (n) nodes.set(layer.id, n);
        else nodes.delete(layer.id);
      }}
      image={video ?? undefined}
      cornerRadius={layer.radius ?? 0}
      stroke={layer.border?.color}
      strokeWidth={layer.border?.width ?? 0}
    />
  );
};

const PictureNode = ({ layer, nodes, onSelect, onPatch, onDragMove, onDragEnd, disabled }: NodeProps) => {
  const src = layer.src;
  const img = useImage(src);
  const ref = useRef<Konva.Image | null>(null);
  const crop = img && layer.type === "image" ? cropRect(layer.natural?.w ?? img.naturalWidth, layer.natural?.h ?? img.naturalHeight, layer.w, layer.h, layer.crop) : undefined;
  const adj = layer.adjust;
  // Stickers with an edge show a copy of the picture with its outline drawn round it.
  const edgeImg = useMemo(
    () => (img && layer.type === "sticker" && layer.edge?.width ? outlinedImage(img, (layer.edge.width * (img.naturalWidth || layer.w)) / Math.max(1, layer.w), layer.edge.color) : null),
    [img, layer.type, layer.edge?.width, layer.edge?.color, layer.w],
  );

  // Filters need the picture cached. Cache it only while an adjustment is on.
  useEffect(() => {
    const n = ref.current;
    if (!n || !img) return;
    if (isAdjusted(adj)) {
      n.filters([Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL, lookFilter]);
      n.brightness(adj.brightness / 100);
      n.contrast(adj.contrast);
      n.saturation(adj.saturation / 50);
      n.setAttr("look", { warmth: adj.warmth ?? 0, tint: adj.tint ?? 0, vignette: adj.vignette ?? 0, grain: adj.grain ?? 0 });
      // Cached after the settings, so the filters run with them.
      n.cache({ offset: layer.shadow ? 40 : 0 });
    } else {
      n.filters([]);
      n.clearCache();
    }
    n.getLayer()?.batchDraw();
  }, [img, adj?.brightness, adj?.contrast, adj?.saturation, adj?.warmth, adj?.tint, adj?.vignette, adj?.grain, layer.w, layer.h, layer.crop?.zoom, layer.crop?.x, layer.crop?.y, layer.shadow, layer.radius, layer.border?.width, layer.mask, !!layer.polaroid]);

  // A photo layer with no picture is an empty frame, waiting for a photo. It is never exported.
  if (!layer.src && layer.type === "image") {
    return (
      <Shape
        name="placeholder"
        ref={(n) => {
          if (n) nodes.set(layer.id, n);
          else nodes.delete(layer.id);
        }}
        x={layer.x}
        y={layer.y}
        width={layer.w}
        height={layer.h}
        rotation={layer.rotation}
        fill="#000000"
        draggable={!layer.locked && !disabled}
        sceneFunc={(ctx) => {
          const c = ctx._context;
          c.save();
          c.fillStyle = "rgba(128, 140, 130, 0.14)";
          c.fillRect(0, 0, layer.w, layer.h);
          c.strokeStyle = "#4fa27f";
          c.lineWidth = 3;
          c.setLineDash([16, 10]);
          c.strokeRect(1.5, 1.5, layer.w - 3, layer.h - 3);
          c.setLineDash([]);
          const s = Math.min(layer.w, layer.h) * 0.12;
          c.lineWidth = 6;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(layer.w / 2 - s, layer.h / 2);
          c.lineTo(layer.w / 2 + s, layer.h / 2);
          c.moveTo(layer.w / 2, layer.h / 2 - s);
          c.lineTo(layer.w / 2, layer.h / 2 + s);
          c.stroke();
          c.restore();
        }}
        hitFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.rect(0, 0, layer.w, layer.h);
          ctx.closePath();
          ctx.fillShape(shape);
        }}
        onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
        onTouchStart={() => !disabled && onSelect(layer.id)}
        onDragMove={(e) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey)}
        onDragEnd={(e) => {
          onDragEnd();
          onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
        }}
        onTransformEnd={(e) => {
          const n = e.target;
          const sx = n.scaleX();
          const sy = n.scaleY();
          n.scaleX(1);
          n.scaleY(1);
          onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w: Math.max(24, Math.round(n.width() * sx)), h: Math.max(24, Math.round(n.height() * sy)), rotation: r2(n.rotation()) });
        }}
      />
    );
  }

  // A photo in a shape: a group clipped to the shape moves and turns as one, with an optional outline in the
  // border colour drawn on top. The picture inside keeps its crop and colour changes.
  // An instant photo: a white card, the photo inset with a deeper bottom, and a handwritten caption.
  if (layer.polaroid && layer.type === "image") {
    const pb = polaroidBox(layer.w, layer.h);
    const pcrop = img ? cropRect(layer.natural?.w ?? img.naturalWidth, layer.natural?.h ?? img.naturalHeight, pb.photo.w, pb.photo.h, layer.crop) : undefined;
    return (
      <Group
        ref={(n) => {
          if (n) nodes.set(layer.id, n);
          else nodes.delete(layer.id);
        }}
        x={layer.x}
        y={layer.y}
        rotation={layer.rotation}
        opacity={layer.opacity ?? 1}
        draggable={!layer.locked && !disabled}
        onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
        onTouchStart={() => !disabled && onSelect(layer.id)}
        onDragMove={(e) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey)}
        onDragEnd={(e) => {
          onDragEnd();
          onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
        }}
        onTransformEnd={(e) => {
          const n = e.target;
          const sx = n.scaleX();
          const sy = n.scaleY();
          n.scaleX(1);
          n.scaleY(1);
          onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w: Math.max(24, Math.round(layer.w * sx)), h: Math.max(24, Math.round(layer.h * sy)), rotation: r2(n.rotation()) });
        }}
      >
        <Rect width={layer.w} height={layer.h} fill="#fbfaf6" stroke="#e4ded1" strokeWidth={1} shadowEnabled={layer.shadow !== false} shadowColor="#000000" shadowBlur={18} shadowOffsetY={8} shadowOpacity={0.22} />
        <KImage ref={(n) => void (ref.current = n)} image={img ?? undefined} crop={pcrop} x={pb.photo.x} y={pb.photo.y} width={pb.photo.w} height={pb.photo.h} />
        <KText
          text={layer.polaroid.caption}
          x={pb.pad}
          y={pb.caption.y}
          width={layer.w - pb.pad * 2}
          height={pb.caption.h}
          align="center"
          verticalAlign="middle"
          fontFamily="Caveat"
          fontSize={pb.caption.fontSize}
          fill="#2b2b2b"
          listening={false}
        />
      </Group>
    );
  }

  if (layer.mask && layer.mask !== "none" && layer.type === "image") {
    const shape = layer.mask;
    return (
      <Group
        ref={(n) => {
          if (n) nodes.set(layer.id, n);
          else nodes.delete(layer.id);
        }}
        x={layer.x}
        y={layer.y}
        rotation={layer.rotation}
        opacity={layer.opacity ?? 1}
        draggable={!layer.locked && !disabled}
        onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
        onTouchStart={() => !disabled && onSelect(layer.id)}
        onDragMove={(e) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey)}
        onDragEnd={(e) => {
          onDragEnd();
          onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
        }}
        onTransformEnd={(e) => {
          const n = e.target;
          const sx = n.scaleX();
          const sy = n.scaleY();
          n.scaleX(1);
          n.scaleY(1);
          onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w: Math.max(24, Math.round(layer.w * sx)), h: Math.max(24, Math.round(layer.h * sy)), rotation: r2(n.rotation()) });
        }}
      >
        <Group clipFunc={(ctx) => maskPath(ctx as unknown as Parameters<typeof maskPath>[0], shape, layer.w, layer.h)}>
          <KImage ref={(n) => void (ref.current = n)} image={img ?? undefined} crop={crop} width={layer.w} height={layer.h} />
        </Group>
        {layer.border && layer.border.width > 0 && (
          <Shape
            listening={false}
            stroke={layer.border.color}
            strokeWidth={layer.border.width}
            sceneFunc={(ctx, s) => {
              maskPath(ctx as unknown as Parameters<typeof maskPath>[0], shape, layer.w, layer.h);
              ctx.strokeShape(s);
            }}
          />
        )}
      </Group>
    );
  }

  return (
    <KImage
      ref={(n) => {
        ref.current = n;
        if (n) nodes.set(layer.id, n);
        else nodes.delete(layer.id);
      }}
      image={edgeImg ?? img ?? undefined}
      crop={crop}
      x={layer.x}
      y={layer.y}
      width={layer.w}
      height={layer.h}
      rotation={layer.rotation}
      opacity={layer.opacity ?? 1}
      cornerRadius={layer.radius ?? 0}
      stroke={layer.border?.color}
      strokeWidth={layer.border?.width ?? 0}
      shadowEnabled={!!layer.shadow}
      shadowColor="#000000"
      shadowBlur={24}
      shadowOffsetY={10}
      shadowOpacity={0.25}
      draggable={!layer.locked && !disabled}
      onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
      onTouchStart={() => !disabled && onSelect(layer.id)}
      onDragMove={(e) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey)}
      onDragEnd={(e) => {
        onDragEnd();
        onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
      }}
      onTransformEnd={(e) => {
        const n = e.target;
        const sx = n.scaleX();
        const sy = n.scaleY();
        n.scaleX(1);
        n.scaleY(1);
        onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w: Math.max(24, Math.round(n.width() * sx)), h: Math.max(24, Math.round(n.height() * sy)), rotation: r2(n.rotation()) });
      }}
    />
  );
};

const WordsNode = ({ layer, nodes, onSelect, onPatch, onDragMove, onDragEnd, disabled }: NodeProps) => {
  const ref = useRef<Konva.Text | null>(null);
  // Highlighted words are laid out here, so a font arriving late needs a fresh layout, not just a redraw.
  const [, setFontTick] = useState(0);
  // A font is downloaded the first time it is used, so draw again once it has arrived.
  useEffect(() => {
    const family = layer.fontFamily || "Inter Tight";
    void Promise.all([document.fonts?.load(`400 64px "${family}"`), document.fonts?.load(`700 64px "${family}"`)]).then(
      () => {
        setFontTick((t) => t + 1);
        ref.current?.getLayer()?.batchDraw();
      },
      () => undefined,
    );
  }, [layer.fontFamily, layer.bold]);
  const gradient = layer.textGradient
    ? {
        fillPriority: "linear-gradient",
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: 0, y: Math.max(1, layer.h) },
        fillLinearGradientColorStops: [0, layer.textGradient.from, 1, layer.textGradient.to],
      }
    : {};
  const handlers = {
    draggable: !layer.locked && !disabled,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => !disabled && onSelect(layer.id, e.evt.shiftKey),
    onTouchStart: () => !disabled && onSelect(layer.id),
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd();
      onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      const sx = n.scaleX();
      n.scaleX(1);
      n.scaleY(1);
      const w = Math.max(48, Math.round(layer.w * sx));
      onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w, h: measureText({ ...layer, w }), rotation: r2(n.rotation()) });
    },
  };

  // Words between *stars* are drawn bold in the accent colour, so the words are laid out and drawn piece by piece.
  const measure = hasMarkup(layer.text) && !layer.curve ? richMeasure(layer) : null;
  if (measure) {
    const fontSize = layer.fontSize || 64;
    const lh = fontSize * (layer.lineHeight ?? 1);
    const family = layer.fontFamily || "Inter Tight";
    const lines = layoutRich(layer.text ?? "", layer.w, measure);
    return (
      <Shape
        ref={(n) => {
          ref.current = n as unknown as Konva.Text | null;
          if (n) nodes.set(layer.id, n);
          else nodes.delete(layer.id);
        }}
        x={layer.x}
        y={layer.y}
        width={layer.w}
        height={Math.max(layer.h, lines.length * lh)}
        rotation={layer.rotation}
        opacity={layer.opacity ?? 1}
        fill="#000000"
        {...handlers}
        sceneFunc={(kctx) => {
          const ctx = kctx._context as CanvasRenderingContext2D;
          ctx.save();
          if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${layer.letterSpacing ?? 0}px`;
          ctx.textBaseline = "middle";
          let fade: CanvasGradient | null = null;
          if (layer.textGradient) {
            fade = ctx.createLinearGradient(0, 0, 0, Math.max(1, lines.length * lh));
            fade.addColorStop(0, layer.textGradient.from);
            fade.addColorStop(1, layer.textGradient.to);
          }
          if (layer.textShadow) {
            ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 5;
          }
          lines.forEach((line, i) => {
            const ox = layer.align === "center" ? (layer.w - line.width) / 2 : layer.align === "right" ? layer.w - line.width : 0;
            const y = i * lh + lh / 2;
            for (const p of line.pieces) {
              if (!p.text.trim()) continue;
              ctx.font = `${layer.bold || p.accent ? "700" : "400"} ${fontSize}px "${family}"`;
              if (layer.outline?.width) {
                ctx.lineWidth = layer.outline.width;
                ctx.lineJoin = "round";
                ctx.strokeStyle = layer.outline.color;
                ctx.strokeText(p.text, ox + p.x, y);
              }
              ctx.fillStyle = p.accent ? (layer.accent ?? "#e5484d") : (fade ?? (layer.color || "#1d211e"));
              ctx.fillText(p.text, ox + p.x, y);
            }
          });
          ctx.restore();
        }}
        hitFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.rect(0, 0, layer.w, Math.max(layer.h, lines.length * lh));
          ctx.closePath();
          ctx.fillShape(shape);
        }}
      />
    );
  }

  // Curved words: a group the size of the layer, holding the words on their arc. The group is what moves and turns.
  if (layer.curve) {
    const fontSize = layer.fontSize || 64;
    const arc = arcFor(layer.w, fontSize, layer.curve);
    return (
      <Group
        ref={(n) => {
          if (n) nodes.set(layer.id, n);
          else nodes.delete(layer.id);
        }}
        x={layer.x}
        y={layer.y}
        rotation={layer.rotation}
        opacity={layer.opacity ?? 1}
        draggable={!layer.locked && !disabled}
        onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
        onTouchStart={() => !disabled && onSelect(layer.id)}
        onDragMove={(e) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey)}
        onDragEnd={(e) => {
          onDragEnd();
          onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
        }}
        onTransformEnd={(e) => {
          const n = e.target;
          const sx = n.scaleX();
          n.scaleX(1);
          n.scaleY(1);
          const w = Math.max(48, Math.round(layer.w * sx));
          onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w, h: measureText({ ...layer, w }), rotation: r2(n.rotation()) });
        }}
      >
        <Rect width={layer.w} height={arc.height} fill="rgba(0,0,0,0)" />
        <TextPath
          ref={(n) => void (ref.current = n as unknown as Konva.Text | null)}
          data={arc.data}
          text={plainText(oneLine(layer.text || ""))}
          fontFamily={layer.fontFamily || "Inter Tight"}
          fontSize={fontSize}
          fontStyle={layer.bold ? "bold" : "normal"}
          fill={layer.textGradient?.from ?? (layer.color || "#1d211e")}
          align={layer.align || "center"}
          letterSpacing={layer.letterSpacing ?? 0}
          textBaseline="alphabetic"
          stroke={layer.outline?.color}
          strokeWidth={layer.outline?.width ?? 0}
          fillAfterStrokeEnabled
          shadowEnabled={!!layer.textShadow}
          shadowColor="#000000"
          shadowBlur={14}
          shadowOffsetY={5}
          shadowOpacity={0.45}
          listening={false}
        />
      </Group>
    );
  }
  return (
  <KText
    ref={(n) => {
      ref.current = n;
      if (n) nodes.set(layer.id, n);
      else nodes.delete(layer.id);
    }}
    text={layer.text || ""}
    fontFamily={layer.fontFamily || "Inter Tight"}
    fontSize={layer.fontSize || 64}
    fontStyle={layer.bold ? "bold" : "normal"}
    fill={layer.color || "#1d211e"}
    align={layer.align || "left"}
    letterSpacing={layer.letterSpacing ?? 0}
    lineHeight={layer.lineHeight ?? 1}
    stroke={layer.outline?.color}
    strokeWidth={layer.outline?.width ?? 0}
    fillAfterStrokeEnabled
    shadowEnabled={!!layer.textShadow}
    shadowColor="#000000"
    shadowBlur={14}
    shadowOffsetY={5}
    shadowOpacity={0.45}
    {...gradient}
    opacity={layer.opacity ?? 1}
    x={layer.x}
    y={layer.y}
    width={layer.w}
    rotation={layer.rotation}
    draggable={!layer.locked && !disabled}
    onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
    onTouchStart={() => !disabled && onSelect(layer.id)}
    onDragMove={(e) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey)}
    onDragEnd={(e) => {
      onDragEnd();
      onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
    }}
    onTransformEnd={(e) => {
      const n = e.target;
      const sx = n.scaleX();
      n.scaleX(1);
      n.scaleY(1);
      const w = Math.max(48, Math.round(n.width() * sx));
      onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w, h: measureText({ ...layer, w }), rotation: r2(n.rotation()) });
    }}
  />
  );
};

/**
 * Tape: a translucent strip with torn ends. Stretching it redraws it at the new size, so the ends keep their teeth
 * instead of being pulled out of shape.
 */
const TapeNode = ({ layer, nodes, onSelect, onPatch, onDragMove, onDragEnd, disabled }: NodeProps) => (
  <Shape
    ref={(n) => {
      if (n) nodes.set(layer.id, n);
      else nodes.delete(layer.id);
    }}
    x={layer.x}
    y={layer.y}
    width={layer.w}
    height={layer.h}
    rotation={layer.rotation}
    opacity={(layer.opacity ?? 1) * 0.82}
    fill={layer.color ?? "#f3ead7"}
    draggable={!layer.locked && !disabled}
    sceneFunc={(ctx, s) => {
      const pts = tapeOutline(s.width(), s.height());
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fillShape(s);
    }}
    onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
    onTouchStart={() => !disabled && onSelect(layer.id)}
    onDragMove={(e) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey)}
    onDragEnd={(e) => {
      onDragEnd();
      onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
    }}
    onTransform={(e) => {
      const n = e.target;
      n.width(Math.max(40, n.width() * n.scaleX()));
      n.height(Math.max(16, n.height() * n.scaleY()));
      n.scaleX(1);
      n.scaleY(1);
    }}
    onTransformEnd={(e) => {
      const n = e.target;
      onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w: Math.round(n.width()), h: Math.round(n.height()), rotation: r2(n.rotation()) });
    }}
  />
);

/** Traces a shape layer's outline: a rectangle with rounded corners, an ellipse, or a line with round ends. */
const traceShape = (ctx: Konva.Context, kind: Layer["shape"], w: number, h: number, radius: number) => {
  ctx.beginPath();
  if (kind === "ellipse") {
    const k = 0.5522848;
    const rx = w / 2;
    const ry = h / 2;
    ctx.moveTo(w, ry);
    ctx.bezierCurveTo(w, ry + ry * k, rx + rx * k, h, rx, h);
    ctx.bezierCurveTo(rx - rx * k, h, 0, ry + ry * k, 0, ry);
    ctx.bezierCurveTo(0, ry - ry * k, rx - rx * k, 0, rx, 0);
    ctx.bezierCurveTo(rx + rx * k, 0, w, ry - ry * k, w, ry);
  } else {
    const r = Math.max(0, Math.min(kind === "line" ? Math.min(w, h) / 2 : radius, w / 2, h / 2));
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
  }
  ctx.closePath();
};

/** A plain shape. Stretching redraws it at the new size, so corners and borders keep their size. */
const ShapeNode = ({ layer, nodes, onSelect, onPatch, onDragMove, onDragEnd, disabled }: NodeProps) => (
  <Shape
    ref={(n) => {
      if (n) nodes.set(layer.id, n);
      else nodes.delete(layer.id);
    }}
    x={layer.x}
    y={layer.y}
    width={layer.w}
    height={layer.h}
    rotation={layer.rotation}
    opacity={layer.opacity ?? 1}
    fill={layer.color ?? "#1f6f54"}
    stroke={layer.border?.width ? layer.border.color : undefined}
    strokeWidth={layer.border?.width ?? 0}
    strokeScaleEnabled={false}
    draggable={!layer.locked && !disabled}
    sceneFunc={(ctx, s) => {
      traceShape(ctx, layer.shape, s.width(), s.height(), layer.radius ?? 0);
      ctx.fillStrokeShape(s);
    }}
    onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
    onTouchStart={() => !disabled && onSelect(layer.id)}
    onDragMove={(e) => onDragMove(layer, e.target, !!(e.evt as MouseEvent)?.altKey)}
    onDragEnd={(e) => {
      onDragEnd();
      onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
    }}
    onTransform={(e) => {
      const n = e.target;
      n.width(Math.max(8, n.width() * n.scaleX()));
      n.height(Math.max(4, n.height() * n.scaleY()));
      n.scaleX(1);
      n.scaleY(1);
    }}
    onTransformEnd={(e) => {
      const n = e.target;
      onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w: Math.round(n.width()), h: Math.round(n.height()), rotation: r2(n.rotation()) });
    }}
  />
);

const DrawingNode = ({ layer, nodes, onSelect, onPatch, onDragMove, onDragEnd, disabled }: NodeProps) => {
  if (!layer.stroke) return null;
  const pts = localPoints(layer);
  return (
    <Shape
      ref={(n) => {
        if (n) nodes.set(layer.id, n);
        else nodes.delete(layer.id);
      }}
      x={layer.x}
      y={layer.y}
      width={layer.w}
      height={layer.h}
      rotation={layer.rotation}
      opacity={layer.opacity ?? 1}
      stroke={layer.stroke.color}
      strokeWidth={layer.stroke.width}
      hitStrokeWidth={Math.max(layer.stroke.width, 28)}
      lineCap="round"
      lineJoin="round"
      draggable={!layer.locked && !disabled}
      sceneFunc={(ctx, shape) => {
        tracePath(ctx, pts);
        ctx.strokeShape(shape);
      }}
      hitFunc={(ctx, shape) => {
        tracePath(ctx, pts);
        ctx.strokeShape(shape);
      }}
      onMouseDown={(e) => !disabled && onSelect(layer.id, (e.evt as MouseEvent).shiftKey)}
      onTouchStart={() => !disabled && onSelect(layer.id)}
      onDragMove={(e) => onDragMove(layer, e.target, true)}
      onDragEnd={(e) => {
        onDragEnd();
        onPatch(layer.id, { x: r2(e.target.x()), y: r2(e.target.y()) });
      }}
      onTransformEnd={(e) => {
        const n = e.target;
        const sx = n.scaleX();
        const sy = n.scaleY();
        n.scaleX(1);
        n.scaleY(1);
        onPatch(layer.id, { x: r2(n.x()), y: r2(n.y()), w: Math.max(8, r2(n.width() * sx)), h: Math.max(8, r2(n.height() * sy)), rotation: r2(n.rotation()) });
      }}
    />
  );
};
