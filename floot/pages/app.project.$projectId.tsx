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
  Film,
  Keyboard,
  Lock,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Shuffle,
  Smartphone,
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
import { ExportDialog, PhonePreview, ShortcutsDialog } from "../components/EditorDialogs";
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
  PageNumbers,
  Project,
  readableOn,
  SLIDE_WIDTH,
  slideOf,
  rotatedBy,
  uid,
} from "../helpers/carouselModel";
import { getProject, saveProject } from "../helpers/projectStorage";
import { useEditorState } from "../helpers/useEditorState";
import { preparePicture } from "../helpers/preparePicture";
import { measureText } from "../helpers/measureText";
import { ExportOptions, exportSlideVideo, exportSlides, recordingType, renderSlide } from "../helpers/exportSlides";
import { flipPicture } from "../helpers/flipPicture";
import { addClip } from "../helpers/videoClips";
import { track } from "../helpers/analytics";
import { CollagePlan, applyPlan, cleanPlan, photosOf, randomPlan, shuffleLayout } from "../helpers/collage";
import { makeThumb } from "../helpers/makeThumb";
import { CollagePlanError, postCollagePlan } from "../endpoints/collage-plan_POST.schema";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [playVideos, setPlayVideos] = useState(false);
  const [aiCollage, setAiCollage] = useState(true);
  const [pen, setPen] = useState<Pen>({ mode: "pen", color: "#111111", size: 12 });
  const stageRef = useRef<Konva.Stage | null>(null);
  const contentRef = useRef<Konva.Layer | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const clips = useRef<HTMLInputElement>(null);
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

  useEffect(() => track("project_opened", { slides: project.design.slideCount }), [project.design.slideCount]);

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
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable || t.getAttribute("role") === "slider")) return;
      // Dialogs handle their own keys.
      if (document.querySelector('[role="dialog"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        ed.redo();
      } else if (mod && e.key.toLowerCase() === "d" && selected) {
        e.preventDefault();
        ed.duplicateLayer(selected.id);
      } else if (mod) {
        return;
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPreviewOpen(true);
      } else if (e.key === "Escape" && selected) {
        ed.select(null);
      } else if (selected && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        ed.reorder(selected.id, e.key === "]" ? "forward" : "backward");
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

  const addVideos = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    for (const file of Array.from(list).slice(0, 5)) {
      try {
        setBusy(`Adding ${file.name}`);
        const clip = await addClip(file);
        const k = Math.min((SLIDE_WIDTH * 0.8) / clip.width, (height * 0.8) / clip.height);
        const w = Math.round(clip.width * k);
        const h = Math.round(clip.height * k);
        ed.addLayer({
          id: uid(),
          type: "video",
          name: clip.name,
          mediaKey: clip.key,
          duration: clip.duration,
          natural: { w: clip.width, h: clip.height },
          x: current * SLIDE_WIDTH + Math.round((SLIDE_WIDTH - w) / 2),
          y: Math.round((height - h) / 2),
          w,
          h,
          rotation: 0,
          locked: false,
        });
        track("video_added", { seconds: Math.round(clip.duration) });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That video couldn't be added.");
      }
    }
    setBusy(null);
    if (clips.current) clips.current.value = "";
  };

  const runExport = async (options: ExportOptions) => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;
    const total = options.slides?.length ?? design.slideCount;
    setBusy(`Exporting 0 of ${total}`);
    try {
      await exportSlides(stage, content, design, title, options, (done, all) => setBusy(`Exporting ${done} of ${all}`));
      toast.success(total === 1 ? "Slide downloaded." : `Downloaded ${total} slides as a zip.`);
      track("export", { slides: total, format: options.format, width: options.width });
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The export didn't finish.");
    } finally {
      setBusy(null);
    }
  };

  const videosOnSlide = (i: number) =>
    (contentRef.current?.find(".video") ?? [])
      .filter((n) => slideOf({ x: n.x(), w: n.width() }) === i)
      .map((n) => (n as Konva.Image).image())
      .filter((v): v is HTMLVideoElement => v instanceof HTMLVideoElement);

  const runVideoExport = async () => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;
    setPlayVideos(false);
    setBusy("Recording 0%");
    try {
      await exportSlideVideo(stage, content, design, current, title, videosOnSlide(current), (f) => setBusy(`Recording ${Math.round(f * 100)}%`));
      toast.success(`Slide ${current + 1} downloaded as a video.`);
      track("export_video", {});
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The video export didn't finish.");
    } finally {
      setBusy(null);
    }
  };

  const renderForPreview = useCallback((i: number) => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return Promise.reject(new Error("The canvas isn't ready."));
    return renderSlide(stage, content, latest.current.design, i, 0.5);
  }, []);

  const setPageNumbers = (pn: PageNumbers | null) => ed.apply((d) => ({ ...d, pageNumbers: pn }));
  const hasVideo = design.layers.some((l) => l.type === "video");
  const photoCount = photosOf(design).length;

  /**
   * Shuffles the photos into a new collage. The layout is worked out here; then the AI looks at small copies of the
   * photos and picks the tilts and where tape and accents go. Without the AI, a random plan is used instead.
   */
  const shuffleCollage = async () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const { design: laid, order } = shuffleLayout(latest.current.design, seed);
    if (order.length === 0) return void toast.message("Add some photos first.");
    let plan: CollagePlan = randomPlan(order, seed);
    let usedAi = false;
    if (aiCollage) {
      setBusy("Arranging…");
      try {
        // The AI sees at most 30 photos; any more keep the random plan.
        const picked = order.slice(0, 30).map((id) => laid.layers.find((l) => l.id === id)!);
        const photos = await Promise.all(picked.map(async (l) => ({ id: l.id, thumb: await makeThumb(l.src!), slide: Math.max(0, slideOf(l)), landscape: l.w >= l.h })));
        const ai = await postCollagePlan({ photos });
        const aiIds = new Set(picked.map((l) => l.id));
        plan = {
          tilts: { ...plan.tilts, ...Object.fromEntries(ai.tilts.map((t) => [t.photoId, t.degrees])) },
          stickers: [...plan.stickers.filter((s) => !aiIds.has(s.photoId)), ...ai.stickers],
        };
        usedAi = true;
      } catch (e) {
        if (e instanceof CollagePlanError && e.code === "OUT_OF_CREDITS") console.warn("Collage AI is out of credits; used a random look.");
        else toast.message("The AI wasn't available, so this is a quick random look. Press Shuffle again to retry.");
      } finally {
        setBusy(null);
      }
    }
    ed.apply(() => applyPlan(laid, cleanPlan(plan, order)));
    go(0);
    track("collage_shuffle", { photos: order.length, ai: usedAi });
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
          <Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
            <Keyboard size={16} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Undo" title="Undo" disabled={!ed.canUndo} onClick={ed.undo}>
            <Undo2 size={16} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Redo" title="Redo" disabled={!ed.canRedo} onClick={ed.redo}>
            <Redo2 size={16} />
          </Button>
          <span className={styles.status} role="status" data-state={save}>
            {status}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} title="Preview on a phone (P)">
            <Smartphone size={16} /> Preview
          </Button>
          <Button size="sm" onClick={() => setExportOpen(true)} disabled={!!busy}>
            <Download size={16} /> {busy ?? "Export"}
          </Button>
        </div>
      </header>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        slideCount={design.slideCount}
        current={current}
        currentHasVideo={design.layers.some((l) => l.type === "video" && slideOf(l) === current)}
        canRecord={!!recordingType()}
        busy={busy}
        onExport={(o) => void runExport(o)}
        onExportVideo={() => void runVideoExport()}
      />
      <PhonePreview open={previewOpen} onOpenChange={setPreviewOpen} slideCount={design.slideCount} aspect={SLIDE_WIDTH / height} start={current} render={renderForPreview} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

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
          playVideos={playVideos}
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
              <input ref={clips} type="file" accept="video/mp4,video/webm,video/quicktime" multiple hidden aria-label="Choose videos" onChange={(e) => void addVideos(e.target.files)} />
              <Button variant="outline" onClick={() => clips.current?.click()} disabled={!!busy}>
                <Film size={16} /> Add video
              </Button>
              {hasVideo && (
                <Button variant="outline" size="sm" onClick={() => setPlayVideos((p) => !p)}>
                  {playVideos ? <Pause size={14} /> : <Play size={14} />} {playVideos ? "Pause videos" : "Play videos"}
                </Button>
              )}
              <p className={styles.hint}>Videos: MP4, WebM or MOV, up to 90 seconds and 200 MB. They play muted. To keep the movement, export a slide with a video as a video from the Export button.</p>
              <div className={styles.shuffleBox}>
                <Button onClick={() => void shuffleCollage()} disabled={!!busy || photoCount === 0}>
                  <Shuffle size={16} /> {busy === "Arranging…" ? "Arranging…" : "Shuffle collage"}
                </Button>
                <div className={styles.fieldRow}>
                  <span id="ai-collage">AI picks the tilts and stickers</span>
                  <Switch aria-labelledby="ai-collage" checked={aiCollage} onCheckedChange={setAiCollage} />
                </div>
                <p className={styles.hint}>
                  Puts your {photoCount === 1 ? "photo" : `${photoCount} photos`} in a new order and a new layout, tilts some of them and adds tape, pins and flowers. Each press gives a different look, and undo goes back.
                  {aiCollage ? " To do this, small blurry copies of your photos are sent to an AI service. Switch it off to keep everything on your device." : ""}
                </p>
              </div>
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
              <div className={styles.fieldRow}>
                <span id="pn-label">Page numbers</span>
                <Switch
                  aria-labelledby="pn-label"
                  checked={!!design.pageNumbers}
                  onCheckedChange={(on) => setPageNumbers(on ? { style: "fraction", position: "bottom-right", color: readableOn(design.gradient?.to ?? design.background) } : null)}
                />
              </div>
              {design.pageNumbers && (
                <div className={styles.fields}>
                  <div className={styles.field}>
                    <span id="pns-label">Style</span>
                    <Select value={design.pageNumbers.style} onValueChange={(v) => setPageNumbers({ ...design.pageNumbers!, style: v as PageNumbers["style"] })}>
                      <SelectTrigger aria-labelledby="pns-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fraction">1/{design.slideCount}</SelectItem>
                        <SelectItem value="number">1</SelectItem>
                        <SelectItem value="dots">Dots</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={styles.field}>
                    <span id="pnp-label">Position</span>
                    <Select value={design.pageNumbers.position} onValueChange={(v) => setPageNumbers({ ...design.pageNumbers!, position: v as PageNumbers["position"] })}>
                      <SelectTrigger aria-labelledby="pnp-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Bottom right</SelectItem>
                        <SelectItem value="bottom-centre">Bottom centre</SelectItem>
                        <SelectItem value="top-right">Top right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className={styles.fieldRow}>
                    <span>Colour</span>
                    <Input type="color" className={styles.colour} value={design.pageNumbers.color} onChange={(e) => setPageNumbers({ ...design.pageNumbers!, color: e.target.value })} />
                  </label>
                  <p className={styles.hint}>Page numbers are part of the exported pictures.</p>
                </div>
              )}
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
                        {{ image: l.src ? "Photo" : "Empty frame", text: "Text", sticker: "Sticker", drawing: "Drawing", video: "Video" }[l.type]}: {l.name}
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
