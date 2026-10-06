import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import Konva from "konva";
import { toast } from "sonner";
import {
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignHorizontalJustifyCenter,
  AlignEndHorizontal,
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  Lock,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Type,
  Undo2,
  Unlock,
  ImagePlus,
} from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { Switch } from "../components/Switch";
import { Slider } from "../components/Slider";
import { Skeleton } from "../components/Skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/Tabs";
import { ThemeModeSwitch } from "../components/ThemeModeSwitch";
import { CarouselCanvas } from "../components/CarouselCanvas";
import type { Pen } from "../components/CarouselCanvas";
import { DrawPanel, PhotoStylePanel, StickerPanel, ThemePanel } from "../components/EditorPanels";
import { STICKERS, stickerSrc } from "../helpers/stickerArt";
import { applyTheme, arrangePhotos } from "../helpers/themes";
import {
  ALIGNMENTS,
  Alignment,
  FONTS,
  FORMATS,
  FORMAT_KEYS,
  FormatKey,
  Layer,
  MAX_LAYERS,
  MAX_SLIDES,
  Project,
  SLIDE_WIDTH,
  slideOf,
  rotatedBy,
  uid,
} from "../helpers/carouselModel";
import { getProject, saveProject } from "../helpers/projectStorage";
import { useEditorState } from "../helpers/useEditorState";
import { preparePicture } from "../helpers/preparePicture";
import { measureText } from "../helpers/measureText";
import { exportSlides } from "../helpers/exportSlides";
import { flipPicture } from "../helpers/flipPicture";
import styles from "./app.project.$projectId.module.css";

const ALIGN_ICONS: Record<Alignment, { label: string; Icon: typeof AlignStartVertical }> = {
  left: { label: "Align left", Icon: AlignStartVertical },
  centre: { label: "Align centre", Icon: AlignVerticalJustifyCenter },
  right: { label: "Align right", Icon: AlignEndVertical },
  top: { label: "Align top", Icon: AlignStartHorizontal },
  middle: { label: "Align middle", Icon: AlignHorizontalJustifyCenter },
  bottom: { label: "Align bottom", Icon: AlignEndHorizontal },
};

export default function ProjectPage() {
  const { projectId } = useParams();
  const [state, setState] = useState<{ status: "loading" } | { status: "missing" } | { status: "ready"; project: Project }>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getProject(projectId ?? "").then(
      (p) => alive && setState(p ? { status: "ready", project: p } : { status: "missing" }),
      () => alive && setState({ status: "missing" }),
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (state.status === "loading") {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton style={{ height: 48 }} />
        <Skeleton style={{ height: "60vh" }} />
      </div>
    );
  }
  if (state.status === "missing") {
    return (
      <div className={styles.missing}>
        <Helmet>
          <title>Project not found - Spanleaf</title>
        </Helmet>
        <h1>That project isn't here</h1>
        <p>It may have been deleted, or it was made in a different browser.</p>
        <Button asChild>
          <Link to="/app">Back to projects</Link>
        </Button>
      </div>
    );
  }
  return <Editor key={state.project.id} project={state.project} />;
}

function Editor({ project }: { project: Project }) {
  const ed = useEditorState(project.design);
  const [title, setTitle] = useState(project.title);
  const [save, setSave] = useState<"saved" | "saving" | "unsaved" | "failed">("saved");
  const [tab, setTab] = useState("photos");
  const [current, setCurrent] = useState(0);
  const [goTo, setGoTo] = useState<{ index: number; nonce: number } | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [pen, setPen] = useState<Pen>({ mode: "pen", color: "#111111", size: 12 });
  const stageRef = useRef<Konva.Stage | null>(null);
  const contentRef = useRef<Konva.Layer | null>(null);
  const files = useRef<HTMLInputElement>(null);
  /** The empty frame the next chosen photo goes into, when one was picked. */
  const fillFor = useRef<string | null>(null);
  const latest = useRef({ design: ed.design, title });
  latest.current = { design: ed.design, title };
  const first = useRef(true);

  const { design, selectedId } = ed;
  const drawing = tab === "draw";
  const height = FORMATS[design.format].height;
  const selected = design.layers.find((l) => l.id === selectedId) ?? null;
  const go = useCallback((index: number) => setGoTo({ index, nonce: Math.random() }), []);

  // ---- saving: one second after the last change, and when the tab goes away
  const persist = useCallback(async () => {
    setSave("saving");
    try {
      await saveProject({ ...project, title: latest.current.title.trim() || "Untitled", design: latest.current.design });
      setSave("saved");
    } catch {
      setSave("failed");
    }
  }, [project]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("unsaved");
    const t = setTimeout(() => void persist(), 900);
    return () => clearTimeout(t);
  }, [ed.version, title, persist]);

  useEffect(() => {
    const flush = () => void persist();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [persist]);

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.getAttribute("role") === "slider")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        ed.redo();
      } else if (selected && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        ed.removeLayer(selected.id);
      } else if (selected && !selected.locked && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        ed.patchLayer(selected.id, { x: selected.x + dx, y: selected.y + dy }, "nudge");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ed, selected]);

  // ---- adding things
  const addPhotos = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const chosen = Array.from(list).slice(0, 30);
    if (list.length > 30) toast.message("Added the first 30 photos.");
    // Photos go into empty frames first (the picked one, then the rest from left to right), then onto the slide.
    const target = fillFor.current;
    fillFor.current = null;
    const empty = design.layers.filter((l) => l.type === "image" && !l.src).sort((a, b) => a.x - b.x).map((l) => l.id);
    const queue = target ? [target, ...empty.filter((id) => id !== target)] : empty;
    let at = current;
    for (const file of chosen) {
      try {
        const pic = await preparePicture(file);
        const frame = queue.shift();
        if (frame) {
          ed.patchLayer(frame, { src: pic.src, natural: { w: pic.width, h: pic.height }, name: pic.name, crop: undefined });
          continue;
        }
        const k = Math.min((SLIDE_WIDTH * 0.8) / pic.width, (height * 0.8) / pic.height);
        const w = Math.round(pic.width * k);
        const h = Math.round(pic.height * k);
        ed.addLayer({
          id: uid(),
          type: "image",
          name: pic.name,
          src: pic.src,
          natural: { w: pic.width, h: pic.height },
          x: at * SLIDE_WIDTH + Math.round((SLIDE_WIDTH - w) / 2),
          y: Math.round((height - h) / 2),
          w,
          h,
          rotation: 0,
          locked: false,
        });
        at = Math.min(design.slideCount - 1, at + (chosen.length > 1 && at < design.slideCount - 1 ? 1 : 0));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That photo couldn't be added.");
      }
    }
    if (files.current) files.current.value = "";
  };

  const addText = () => {
    const base = { text: "Your words here", fontFamily: "Fraunces", fontSize: 110, w: 800, bold: false };
    ed.addLayer({
      id: uid(),
      type: "text",
      name: "Text",
      ...base,
      h: measureText(base),
      color: "#1d211e",
      align: "center",
      x: current * SLIDE_WIDTH + (SLIDE_WIDTH - base.w) / 2,
      y: Math.round(height / 2 - 80),
      rotation: 0,
      locked: false,
    });
    setTab("text");
  };

  const patchText = (patch: Partial<Layer>, key?: string) => {
    if (!selected || selected.type !== "text") return;
    const merged = { ...selected, ...patch };
    ed.patchLayer(selected.id, { ...patch, h: measureText(merged) }, key);
  };

  const addSticker = (id: string, colour: string) => {
    const s = STICKERS.find((x) => x.id === id);
    if (!s) return;
    const k = 260 / Math.max(s.w, s.h);
    const w = Math.round(s.w * k);
    const h = Math.round(s.h * k);
    ed.addLayer({
      id: uid(),
      type: "sticker",
      name: s.name,
      sticker: id,
      color: colour,
      src: stickerSrc(id, colour),
      x: current * SLIDE_WIDTH + Math.round((SLIDE_WIDTH - w) / 2),
      y: Math.round((height - h) / 2),
      w,
      h,
      rotation: 0,
      locked: false,
    });
  };

  const flip = async (axis: "horizontal" | "vertical") => {
    if (!selected?.src) return;
    try {
      const src = await flipPicture(selected.src, axis);
      const c = selected.crop;
      ed.patchLayer(selected.id, { src, crop: c ? (axis === "horizontal" ? { ...c, x: 1 - c.x } : { ...c, y: 1 - c.y }) : undefined });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The picture couldn't be flipped.");
    }
  };

  const addStroke = (layer: Layer) => {
    if (design.layers.length >= MAX_LAYERS) return void toast.error(`This project has reached its limit of ${MAX_LAYERS} layers.`);
    ed.addLayer(layer);
    ed.select(null);
  };

  const runExport = async () => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;
    setExporting({ done: 0, total: design.slideCount });
    try {
      await exportSlides(stage, content, design, title, (done, total) => setExporting({ done, total }));
      toast.success(design.slideCount === 1 ? "Slide downloaded." : `Downloaded ${design.slideCount} slides as a zip.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The export didn't finish.");
    } finally {
      setExporting(null);
    }
  };

  const changeFormat = (format: FormatKey) => {
    if (format === design.format) return;
    ed.setFormat(format);
  };

  const status = save === "saved" ? "Saved" : save === "saving" ? "Saving…" : save === "failed" ? "Couldn't save" : "Unsaved";

  return (
    <div className={styles.page}>
      <Helmet>
        <title>{`${title || "Untitled"} - Spanleaf`}</title>
      </Helmet>

      <header className={styles.header}>
        <Button asChild variant="ghost" size="sm">
          <Link to="/app" aria-label="Back to projects">
            <ArrowLeft size={16} /> Projects
          </Link>
        </Button>
        <Input aria-label="Project name" className={styles.titleInput} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        <div className={styles.headerRight}>
          <ThemeModeSwitch />
          <Button variant="ghost" size="icon-sm" aria-label="Undo" title="Undo" disabled={!ed.canUndo} onClick={ed.undo}>
            <Undo2 size={16} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Redo" title="Redo" disabled={!ed.canRedo} onClick={ed.redo}>
            <Redo2 size={16} />
          </Button>
          <span className={styles.status} role="status" data-state={save}>
            {status}
          </span>
          <Button size="sm" onClick={runExport} disabled={!!exporting}>
            <Download size={16} /> {exporting ? `Exporting ${exporting.done} of ${exporting.total}` : "Export"}
          </Button>
        </div>
      </header>

      <div className={styles.body}>
        <CarouselCanvas
          className={styles.canvas}
          design={design}
          selectedId={selectedId}
          onSelect={ed.select}
          onPatch={ed.patchLayer}
          stageRef={stageRef}
          contentRef={contentRef}
          goTo={goTo}
          onCurrentSlide={setCurrent}
          drawing={drawing}
          pen={pen}
          onStroke={addStroke}
          onErase={(ids) => ed.removeLayers(ids, "erase")}
        />

        <aside className={styles.panel} aria-label="Tools">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className={styles.tabsList}>
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="stickers">Stickers</TabsTrigger>
              <TabsTrigger value="draw">Draw</TabsTrigger>
              <TabsTrigger value="themes">Themes</TabsTrigger>
              <TabsTrigger value="background">Background</TabsTrigger>
              <TabsTrigger value="slides">Slides</TabsTrigger>
              <TabsTrigger value="layers">Layers</TabsTrigger>
            </TabsList>

            <TabsContent value="photos" className={styles.tab}>
              <p className={styles.hint}>JPEG, PNG or WebP, up to 25 MB each. Photos land on the slide in view. Drag one across a slide edge and it exports as two halves.</p>
              <input ref={files} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label="Choose photos" onChange={(e) => void addPhotos(e.target.files)} />
              <Button
                onClick={() => {
                  fillFor.current = null;
                  files.current?.click();
                }}
              >
                <ImagePlus size={16} /> Add photos
              </Button>
              {selected?.type === "image" && !selected.src ? (
                <>
                  <p className={styles.hint}>This is an empty frame. Choose a photo to put in it. It is left out of the exported pictures until it has a photo.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      fillFor.current = selected.id;
                      files.current?.click();
                    }}
                  >
                    <ImagePlus size={16} /> Put a photo in this frame
                  </Button>
                </>
              ) : selected?.type === "image" ? (
                <PhotoStylePanel layer={selected} onPatch={(p, k) => ed.patchLayer(selected.id, p, k)} onFlip={(a) => void flip(a)} />
              ) : (
                <p className={styles.hint}>Click a photo on the slides to crop it, flip it, frame it, or change its colours.</p>
              )}
            </TabsContent>

            <TabsContent value="stickers" className={styles.tab}>
              <StickerPanel
                selected={selected}
                onAdd={addSticker}
                onRecolour={(c) => selected && ed.patchLayer(selected.id, { color: c, src: stickerSrc(selected.sticker ?? "star", c) })}
              />
            </TabsContent>

            <TabsContent value="draw" className={styles.tab}>
              <DrawPanel
                pen={pen}
                onPen={(p) => setPen((prev) => ({ ...prev, ...p }))}
                drawingCount={design.layers.filter((l) => l.type === "drawing").length}
                onClear={() => ed.removeLayers(design.layers.filter((l) => l.type === "drawing" && !l.locked).map((l) => l.id))}
              />
            </TabsContent>

            <TabsContent value="themes" className={styles.tab}>
              <ThemePanel
                photoCount={design.layers.filter((l) => l.type === "image").length}
                onTheme={(id) => ed.apply((d) => applyTheme(d, id))}
                onArrange={() => ed.apply((d) => arrangePhotos(d))}
              />
            </TabsContent>

            <TabsContent value="text" className={styles.tab}>
              <Button onClick={addText}>
                <Type size={16} /> Add text
              </Button>
              {selected?.type === "text" ? (
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span>Words</span>
                    <Textarea value={selected.text ?? ""} rows={3} disabled={selected.locked} onChange={(e) => patchText({ text: e.target.value }, "text")} />
                  </label>
                  <div className={styles.field}>
                    <span id="font-label">Font</span>
                    <Select value={selected.fontFamily ?? "Inter Tight"} disabled={selected.locked} onValueChange={(v) => patchText({ fontFamily: v })}>
                      <SelectTrigger aria-labelledby="font-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONTS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={styles.field}>
                    <span id="size-label">Size {selected.fontSize}</span>
                    <Slider aria-labelledby="size-label" min={20} max={300} step={2} value={[selected.fontSize ?? 64]} disabled={selected.locked} onValueChange={([v]) => patchText({ fontSize: v }, "size")} />
                  </div>
                  <label className={styles.fieldRow}>
                    <span>Colour</span>
                    <Input type="color" className={styles.colour} value={selected.color ?? "#1d211e"} disabled={selected.locked} onChange={(e) => patchText({ color: e.target.value }, "colour")} />
                  </label>
                  <div className={styles.fieldRow}>
                    <span id="bold-label">Bold</span>
                    <Switch aria-labelledby="bold-label" checked={!!selected.bold} disabled={selected.locked} onCheckedChange={(v) => patchText({ bold: v })} />
                  </div>
                  <div className={styles.segment} role="group" aria-label="Alignment">
                    {(["left", "center", "right"] as const).map((a) => (
                      <Button key={a} size="sm" variant={selected.align === a ? "primary" : "outline"} disabled={selected.locked} onClick={() => patchText({ align: a })}>
                        {a[0].toUpperCase() + a.slice(1)}
                      </Button>
                    ))}
                  </div>
                  <h3 className={styles.subhead}>Effects</h3>
                  <div className={styles.field}>
                    <span id="ls-label">Letter spacing {selected.letterSpacing ?? 0}</span>
                    <Slider aria-labelledby="ls-label" min={-5} max={40} value={[selected.letterSpacing ?? 0]} disabled={selected.locked} onValueChange={([v]) => patchText({ letterSpacing: v }, "spacing")} />
                  </div>
                  <div className={styles.field}>
                    <span id="lh-label">Line height {(selected.lineHeight ?? 1).toFixed(2)}</span>
                    <Slider aria-labelledby="lh-label" min={0.8} max={2} step={0.05} value={[selected.lineHeight ?? 1]} disabled={selected.locked} onValueChange={([v]) => patchText({ lineHeight: v }, "leading")} />
                  </div>
                  <div className={styles.fieldRow}>
                    <span id="out-label">Outline</span>
                    <Switch aria-labelledby="out-label" checked={!!selected.outline} disabled={selected.locked} onCheckedChange={(on) => patchText({ outline: on ? { color: "#ffffff", width: 6 } : null })} />
                  </div>
                  {selected.outline && (
                    <>
                      <div className={styles.field}>
                        <span id="ow-label">Outline width {selected.outline.width}</span>
                        <Slider aria-labelledby="ow-label" min={1} max={30} value={[selected.outline.width]} disabled={selected.locked} onValueChange={([v]) => patchText({ outline: { ...selected.outline!, width: v } }, "outline")} />
                      </div>
                      <label className={styles.fieldRow}>
                        <span>Outline colour</span>
                        <Input type="color" className={styles.colour} value={selected.outline.color} disabled={selected.locked} onChange={(e) => patchText({ outline: { ...selected.outline!, color: e.target.value } }, "outlinecolour")} />
                      </label>
                    </>
                  )}
                  <div className={styles.fieldRow}>
                    <span id="tsh-label">Shadow</span>
                    <Switch aria-labelledby="tsh-label" checked={!!selected.textShadow} disabled={selected.locked} onCheckedChange={(on) => patchText({ textShadow: on })} />
                  </div>
                </div>
              ) : (
                <p className={styles.hint}>Add text, or click a text layer to change its words, font and colour.</p>
              )}
            </TabsContent>

            <TabsContent value="background" className={styles.tab}>
              <label className={styles.fieldRow}>
                <span>Colour</span>
                <Input type="color" className={styles.colour} value={design.background} onChange={(e) => ed.setBackground(e.target.value)} />
              </label>
              <div className={styles.fieldRow}>
                <span id="grad-label">Gradient across all slides</span>
                <Switch
                  aria-labelledby="grad-label"
                  checked={!!design.gradient}
                  onCheckedChange={(on) => ed.setGradient(on ? { from: design.background, to: "#1f6f54", angle: 90 } : null)}
                />
              </div>
              {design.gradient && (
                <div className={styles.fields}>
                  <label className={styles.fieldRow}>
                    <span>Start</span>
                    <Input type="color" className={styles.colour} value={design.gradient.from} onChange={(e) => ed.setGradient({ ...design.gradient!, from: e.target.value })} />
                  </label>
                  <label className={styles.fieldRow}>
                    <span>End</span>
                    <Input type="color" className={styles.colour} value={design.gradient.to} onChange={(e) => ed.setGradient({ ...design.gradient!, to: e.target.value })} />
                  </label>
                  <div className={styles.field}>
                    <span id="angle-label">Angle {Math.round(design.gradient.angle)}°</span>
                    <Slider aria-labelledby="angle-label" min={0} max={360} value={[design.gradient.angle]} onValueChange={([v]) => ed.setGradient({ ...design.gradient!, angle: v })} />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="slides" className={styles.tab}>
              <p className={styles.hint} aria-live="polite">
                {design.slideCount} {design.slideCount === 1 ? "slide" : "slides"}. There is no limit on slides, up to {MAX_SLIDES} in one project. These work on the slide in view (slide {current + 1}).
              </p>
              <div className={styles.grid2}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={design.slideCount >= MAX_SLIDES}
                  onClick={() => {
                    ed.addSlide(current + 1);
                    go(current + 1);
                  }}
                >
                  <Plus size={14} /> Add slide
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={design.slideCount >= MAX_SLIDES}
                  onClick={() => {
                    ed.duplicateSlide(current);
                    go(current + 1);
                  }}
                >
                  <Copy size={14} /> Copy slide
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={design.slideCount <= 1}
                  onClick={() => {
                    ed.deleteSlide(current);
                    go(Math.min(current, design.slideCount - 2));
                    toast.message(`Deleted slide ${current + 1}. Undo brings it back.`);
                  }}
                >
                  <Trash2 size={14} /> Delete slide
                </Button>
                <div className={styles.segment}>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Move slide earlier"
                    disabled={current <= 0}
                    onClick={() => {
                      ed.moveSlide(current, current - 1);
                      go(current - 1);
                    }}
                  >
                    <ArrowLeft size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Move slide later"
                    disabled={current >= design.slideCount - 1}
                    onClick={() => {
                      ed.moveSlide(current, current + 1);
                      go(current + 1);
                    }}
                  >
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
              <div className={styles.field}>
                <span id="shape-label">Slide shape</span>
                <Select value={design.format} onValueChange={(v) => changeFormat(v as FormatKey)}>
                  <SelectTrigger aria-labelledby="shape-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {FORMATS[k].label} {FORMATS[k].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ol className={styles.slideList} aria-label="Slides">
                {Array.from({ length: Math.min(design.slideCount, 200) }, (_, i) => (
                  <li key={i}>
                    <button type="button" className={styles.slideButton} aria-current={i === current ? "true" : undefined} onClick={() => go(i)}>
                      Slide {i + 1}
                    </button>
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="layers" className={styles.tab}>
              {selected ? (
                <div className={styles.fields}>
                  <h2 className={styles.subhead}>{selected.name}</h2>
                  <h3 className={styles.subhead}>Align to slide {slideOf(selected) + 1}</h3>
                  <div className={styles.alignRow} role="group" aria-label="Align to slide">
                    {ALIGNMENTS.map((how) => {
                      const { label, Icon } = ALIGN_ICONS[how];
                      return (
                        <Button key={how} variant="outline" size="icon-sm" aria-label={label} title={label} disabled={selected.locked} onClick={() => ed.align(selected.id, how)}>
                          <Icon size={14} />
                        </Button>
                      );
                    })}
                  </div>
                  <h3 className={styles.subhead}>Order</h3>
                  <div className={styles.grid2}>
                    <Button variant="outline" size="sm" onClick={() => ed.reorder(selected.id, "front")}>
                      To front
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => ed.reorder(selected.id, "back")}>
                      To back
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => ed.reorder(selected.id, "forward")}>
                      Forward
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => ed.reorder(selected.id, "backward")}>
                      Backward
                    </Button>
                  </div>
                  <h3 className={styles.subhead}>Turn</h3>
                  <div className={styles.grid2}>
                    <Button variant="outline" size="sm" disabled={selected.locked} onClick={() => ed.patchLayer(selected.id, rotatedBy(selected, -90))}>
                      <RotateCcw size={14} /> Left 90°
                    </Button>
                    <Button variant="outline" size="sm" disabled={selected.locked} onClick={() => ed.patchLayer(selected.id, rotatedBy(selected, 90))}>
                      <RotateCw size={14} /> Right 90°
                    </Button>
                  </div>
                  <div className={styles.grid2}>
                    <Button variant="outline" size="sm" onClick={() => ed.duplicateLayer(selected.id)}>
                      <Copy size={14} /> Duplicate
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => ed.toggleLock(selected.id)}>
                      {selected.locked ? <Unlock size={14} /> : <Lock size={14} />} {selected.locked ? "Unlock" : "Lock"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => ed.removeLayer(selected.id)}>
                      <Trash2 size={14} /> Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={styles.hint}>Click a photo or text on the slides to align it, reorder it, lock it or delete it.</p>
              )}
              <h3 className={styles.subhead}>All layers ({design.layers.length})</h3>
              {design.layers.length === 0 ? (
                <p className={styles.hint}>Nothing here yet. Add photos or text.</p>
              ) : (
                <ul className={styles.layerList}>
                  {[...design.layers].reverse().map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className={styles.layerButton}
                        aria-pressed={l.id === selectedId}
                        onClick={() => {
                          ed.select(l.id);
                          go(Math.max(0, Math.min(design.slideCount - 1, slideOf(l))));
                        }}
                      >
                        {{ image: "Photo", text: "Text", sticker: "Sticker", drawing: "Drawing" }[l.type]}: {l.name}
                        {l.locked ? " (locked)" : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
