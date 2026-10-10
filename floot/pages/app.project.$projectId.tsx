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
import { DrawPanel, ExactBox, PhotoStylePanel, SlideStrip, StickerPanel, ThemePanel, VideoPanel } from "../components/EditorPanels";
import { ExportDialog, PhonePreview, ShortcutsDialog } from "../components/EditorDialogs";
import { CutoutDialog } from "../components/CutoutDialog";
import { FirstRunTour } from "../components/FirstRunTour";
import { STICKERS, stickerSrc } from "../helpers/stickerArt";
import { applyTheme, arrangePhotos } from "../helpers/themes";
import {
  ALIGNMENTS,
  Alignment,
  Design,
  FONTS,
  FORMATS,
  FORMAT_KEYS,
  FormatKey,
  Layer,
  MAX_LAYERS,
  MAX_SLIDES,
  PageNumbers,
  PATTERN_KINDS,
  Pattern,
  PICTURE_TYPES,
  Project,
  readableOn,
  ShapeKind,
  SLIDE_WIDTH,
  kindName,
  slideOf,
  rotatedBy,
  trimWindow,
  uid,
} from "../helpers/carouselModel";
import { StorageFullError, getProject, saveProject } from "../helpers/projectStorage";
import { useEditorState } from "../helpers/useEditorState";
import { preparePicture } from "../helpers/preparePicture";
import { measureText, richMeasure } from "../helpers/measureText";
import { fitFontSize, plainText } from "../helpers/richText";
import { loadHistory, saveHistory } from "../helpers/editHistory";
import { ShareRecord, createShare, deleteShare, listShares, shareUrl } from "../helpers/shareLink";
import { ClipPlay, ExportOptions, exportSlideVideo, exportSlides, recordingType, renderSlide } from "../helpers/exportSlides";
import { flipPicture } from "../helpers/flipPicture";
import { VIDEO_TYPES, addClip } from "../helpers/videoClips";
import { track } from "../helpers/analytics";
import { CollagePlan, applyPlan, cleanPlan, collageItemsOf, randomPlan, shuffleLayout } from "../helpers/collage";
import { makeThumb } from "../helpers/makeThumb";
import { MySticker, deleteMySticker, listMyStickers } from "../helpers/myStickers";
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
  const [state, setState] = useState<{ status: "loading" } | { status: "missing" } | { status: "ready"; project: Project; past: Design[] }>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getProject(projectId ?? "").then(
      async (p) => {
        if (!alive) return;
        if (!p) return setState({ status: "missing" });
        // Undo steps from the last visit, so undo still works after a reload.
        const past = await loadHistory(p.id);
        if (alive) setState({ status: "ready", project: p, past });
      },
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
  return <Editor key={state.project.id} project={state.project} past={state.past} />;
}

function Editor({ project, past }: { project: Project; past: Design[] }) {
  const ed = useEditorState(project.design, past);
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
  const [myStickers, setMyStickers] = useState<MySticker[]>([]);
  const [cutoutSource, setCutoutSource] = useState<string | null>(null);
  const [tourAgain, setTourAgain] = useState(false);
  const [pen, setPen] = useState<Pen>({ mode: "pen", color: "#111111", size: 12 });
  const stageRef = useRef<Konva.Stage | null>(null);
  const contentRef = useRef<Konva.Layer | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const clips = useRef<HTMLInputElement>(null);
  /** The empty frame the next chosen photo goes into, when one was picked. */
  const fillFor = useRef<string | null>(null);
  const latest = useRef({ design: ed.design, title, past: ed.past });
  latest.current = { design: ed.design, title, past: ed.past };
  const first = useRef(true);

  const { design, selectedId } = ed;
  const drawing = tab === "draw";
  const height = FORMATS[design.format].height;
  // ---- selection: one layer, or several with shift-click, Ctrl or Cmd + A, or by dragging them together
  const [also, setAlso] = useState<string[]>([]);
  const selectedIds = selectedId ? [selectedId, ...also.filter((id) => id !== selectedId && design.layers.some((l) => l.id === id))] : [];
  const picked = design.layers.filter((l) => selectedIds.includes(l.id));
  const selected = picked.length === 1 ? picked[0] : null;
  const selectOnly = (id: string | null) => {
    setAlso([]);
    ed.select(id);
  };
  const selectFromCanvas = (id: string | null, additive?: boolean) => {
    if (!additive || !id) return selectOnly(id);
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    ed.select(next[0] ?? null);
    setAlso(next.slice(1));
  };
  /** Everything on the slide in view. */
  const selectAll = () => {
    const ids = design.layers.filter((l) => slideOf(l) === current).map((l) => l.id);
    ed.select(ids[0] ?? null);
    setAlso(ids.slice(1));
  };
  const clipboard = useRef<{ layers: Layer[]; slide: number } | null>(null);
  /** Set when a paste event has dealt with Ctrl or ⌘ + V, so the copied layers aren't pasted as well. */
  const pasteHandled = useRef(false);
  const copyPicked = () => {
    clipboard.current = { layers: structuredClone(picked), slide: Math.max(0, slideOf(picked[0])) };
    toast.message(picked.length === 1 ? "Copied." : `Copied ${picked.length} layers.`);
  };
  /** Pastes onto the slide in view, where they were on their own slide, or nudged by offset when pasting in place. */
  const pasteHere = (offset = 0) => {
    const c = clipboard.current;
    if (!c) return;
    const dx = (current - c.slide) * SLIDE_WIDTH + offset;
    const fresh = c.layers.map((l) => ({ ...l, id: uid(), x: l.x + dx, y: l.y + offset, auto: undefined, themeDecor: undefined }));
    if (design.layers.length + fresh.length > MAX_LAYERS) return void toast.error(`That would pass the limit of ${MAX_LAYERS} layers.`);
    ed.addLayers(fresh);
    ed.select(fresh[0].id);
    setAlso(fresh.slice(1).map((l) => l.id));
  };
  const removePicked = () => {
    ed.removeLayers(picked.map((l) => l.id));
    setAlso([]);
  };
  const go = useCallback((index: number) => setGoTo({ index, nonce: Math.random() }), []);

  // ---- share links for comments
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [sharing, setSharing] = useState<string | null>(null);
  useEffect(() => void listShares(project.id).then(setShares, () => setShares([])), [project.id]);
  const runShare = async () => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;
    setPlayVideos(false);
    setSharing("Drawing slides…");
    try {
      const rec = await createShare(project.id, stage, content, latest.current.design, latest.current.title, (done, all) =>
        setSharing(done * 2 <= all ? `Drawing slides ${done}/${all / 2}` : `Uploading ${done - all / 2}/${all / 2}`),
      );
      setShares((s) => [rec, ...s]);
      const copied = await navigator.clipboard.writeText(shareUrl(rec.id)).then(
        () => true,
        () => false,
      );
      toast.success(copied ? "Link made and copied. Send it to whoever you want comments from." : "Link made. Copy it from the list below.");
      track("share_link", { slides: rec.slides });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The link couldn't be made.");
    } finally {
      setSharing(null);
    }
  };
  const removeShare = async (rec: ShareRecord) => {
    try {
      await deleteShare(project.id, rec);
      setShares((s) => s.filter((x) => x.id !== rec.id));
      toast.message("Link deleted, with its pictures and comments.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The link couldn't be deleted.");
    }
  };

  // ---- slide thumbnails, drawn while the Slides tab is open, a moment after each change
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  useEffect(() => {
    if (tab !== "slides") return;
    let alive = true;
    const t = setTimeout(async () => {
      const stage = stageRef.current;
      const content = contentRef.current;
      if (!stage || !content) return;
      const out: Record<number, string> = {};
      const n = Math.min(latest.current.design.slideCount, 60);
      for (let i = 0; i < n; i++) {
        if (!alive) return;
        try {
          out[i] = await renderSlide(stage, content, latest.current.design, i, 0.16);
        } catch {
          /* a slide that can't be drawn keeps its number only */
        }
        if (i % 6 === 5) {
          setThumbs({ ...out });
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (alive) setThumbs(out);
    }, 700);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [tab, ed.version]);

  // ---- keyboard on the canvas: Tab picks layers in drawing order, Enter opens the right settings
  const cycleLayers = (dir: 1 | -1) => {
    if (drawing || design.layers.length === 0) return false;
    const ids = design.layers.map((l) => l.id);
    const at = selectedId ? ids.indexOf(selectedId) : -1;
    const next = at === -1 ? (dir > 0 ? 0 : ids.length - 1) : at + dir;
    if (next < 0 || next >= ids.length) {
      // Past either end, let go so the next Tab leaves the canvas.
      selectOnly(null);
      return false;
    }
    const l = design.layers[next];
    selectOnly(l.id);
    const s = Math.max(0, Math.min(design.slideCount - 1, slideOf(l)));
    if (s !== current) go(s);
    return true;
  };
  const activateSelected = () => {
    if (!selected) return;
    const where = ({ text: "text", image: "photos", video: "photos", sticker: "stickers", shape: "stickers", drawing: "layers" } as const)[selected.type];
    setTab(where);
    if (selected.type === "text") setTimeout(() => document.getElementById("words-input")?.focus(), 80);
  };

  useEffect(() => track("project_opened", { slides: project.design.slideCount }), [project.design.slideCount]);
  useEffect(() => void listMyStickers().then(setMyStickers, () => setMyStickers([])), []);

  // ---- saving: one second after the last change, and when the tab goes away
  const thumb = useRef<{ src?: string; at: number }>({ src: project.thumb, at: 0 });
  /** A small picture of the first slide, made from the canvas as it is, at most every few seconds. */
  const projectPreview = () => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content || Date.now() - thumb.current.at < 4000) return thumb.current.src;
    try {
      const s = stage.scaleX();
      thumb.current = {
        at: Date.now(),
        src: content.toDataURL({ x: stage.x(), y: stage.y(), width: SLIDE_WIDTH * s, height: FORMATS[latest.current.design.format].height * s, pixelRatio: 300 / (SLIDE_WIDTH * s), mimeType: "image/jpeg", quality: 0.7 }),
      };
    } catch {
      /* a picture that can't be drawn just keeps the old preview */
    }
    return thumb.current.src;
  };

  const persist = useCallback(async () => {
    setSave("saving");
    try {
      await saveProject({ ...project, title: latest.current.title.trim() || "Untitled", design: latest.current.design, thumb: projectPreview() });
      void saveHistory(project.id, latest.current.past);
      setSave("saved");
    } catch (e) {
      setSave("failed");
      if (e instanceof StorageFullError) toast.error(e.message, { id: "storage-full", duration: 10000 });
    }
    // projectPreview reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("unsaved");
    const t = setTimeout(() => void persist(), 400);
    return () => clearTimeout(t);
  }, [ed.version, title, persist]);

  // A save still waiting when the page is closed or reloaded would be lost, so the browser asks first.
  const saveState = useRef(save);
  saveState.current = save;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState.current === "saved") return;
      void persist();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [persist]);

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
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (mod && e.key.toLowerCase() === "c" && picked.length) {
        e.preventDefault();
        copyPicked();
      } else if (mod && e.key.toLowerCase() === "x" && picked.length) {
        e.preventDefault();
        copyPicked();
        removePicked();
      } else if (mod && e.key.toLowerCase() === "v") {
        // The paste event that follows decides: a picture copied from elsewhere becomes a photo; otherwise the copied
        // layers are pasted. Browsers that send no paste event get the copied layers.
        pasteHandled.current = false;
        setTimeout(() => {
          if (!pasteHandled.current) pasteHere();
        }, 80);
      } else if (mod && e.key.toLowerCase() === "d" && picked.length > 1) {
        e.preventDefault();
        copyPicked();
        pasteHere(40);
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
      } else if (e.key === "Escape" && picked.length) {
        selectOnly(null);
      } else if (selected && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        ed.reorder(selected.id, e.key === "]" ? "forward" : "backward");
      } else if (picked.length && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removePicked();
      } else if (picked.length && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        ed.patchMany(Object.fromEntries(picked.map((l) => [l.id, { x: l.x + dx, y: l.y + dy }])), "nudge");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      pasteHandled.current = true;
      const pics = Array.from(e.clipboardData?.files ?? []).filter((f) => PICTURE_TYPES.includes(f.type));
      if (pics.length) {
        e.preventDefault();
        void addPhotos(pics);
      } else pasteHere();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  // ---- adding things
  /** Files dropped on the editor: photos and videos go in, anything else is refused with a reason. */
  const dropFiles = (list: FileList) => {
    const all = Array.from(list);
    const pics = all.filter((f) => PICTURE_TYPES.includes(f.type));
    const vids = all.filter((f) => VIDEO_TYPES.includes(f.type));
    if (!pics.length && !vids.length) return void toast.error("Only photos (JPEG, PNG, WebP) and videos (MP4, WebM, MOV) can be added.");
    void (async () => {
      if (pics.length) await addPhotos(pics);
      if (vids.length) await addVideos(vids);
    })();
  };

  const addShape = (kind: ShapeKind) => {
    const size = kind === "line" ? { w: 600, h: 14 } : kind === "ellipse" ? { w: 360, h: 360 } : { w: 520, h: 340 };
    const id = uid();
    ed.addLayer({
      id,
      type: "shape",
      shape: kind,
      name: kind === "rect" ? "Rectangle" : kind === "ellipse" ? "Circle" : "Line",
      color: kind === "line" ? "#1d211e" : kind === "ellipse" ? "#f66dbb" : "#f6d94a",
      radius: kind === "rect" ? 24 : undefined,
      x: current * SLIDE_WIDTH + Math.round((SLIDE_WIDTH - size.w) / 2),
      y: Math.round((height - size.h) / 2),
      ...size,
      rotation: 0,
      locked: false,
    });
    selectOnly(id);
  };

  /** The biggest font size at which the longest line of the selected text still fits its box. */
  const fitText = () => {
    if (!selected || selected.type !== "text") return;
    const measure = richMeasure({ ...selected, fontSize: 100 });
    if (!measure) return;
    const widths = plainText(selected.text ?? "")
      .split("\n")
      .map((line) => measure(line, false));
    patchText({ fontSize: fitFontSize(widths, selected.w) });
  };

  const addPhotos = async (list: FileList | File[] | null) => {
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
    const id = uid();
    const base = { text: "Your words here", fontFamily: "Fraunces", fontSize: 110, w: 800, bold: false };
    ed.addLayer({
      id,
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
    selectOnly(id);
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

  const addMySticker = (s: MySticker) => {
    const k = 360 / Math.max(s.w, s.h);
    const w = Math.round(s.w * k);
    const h = Math.round(s.h * k);
    ed.addLayer({
      id: uid(),
      type: "sticker",
      name: "My sticker",
      sticker: "custom",
      src: s.src,
      x: current * SLIDE_WIDTH + Math.round((SLIDE_WIDTH - w) / 2),
      y: Math.round((height - h) / 2),
      w,
      h,
      rotation: 0,
      locked: false,
    });
  };

  const setPattern = (pattern: Pattern | null) => ed.apply((d) => ({ ...d, pattern }));

  const addStroke = (layer: Layer) => {
    if (design.layers.length >= MAX_LAYERS) return void toast.error(`This project has reached its limit of ${MAX_LAYERS} layers.`);
    ed.addLayer(layer);
    ed.select(null);
  };

  const addVideos = async (list: FileList | File[] | null) => {
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
      toast.success(options.format === "pdf" ? `Downloaded ${total === 1 ? "1 slide" : `${total} slides`} as a PDF.` : total === 1 ? "Slide downloaded." : `Downloaded ${total} slides as a zip.`);
      track("export", { slides: total, format: options.format, width: options.width });
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The export didn't finish.");
    } finally {
      setBusy(null);
    }
  };

  /** The clips on a slide, each with the part of it that plays. */
  const videosOnSlide = (i: number): ClipPlay[] =>
    (contentRef.current?.find(".video") ?? []).flatMap((n) => {
      const layer = design.layers.find((l) => l.id === n.id());
      const el = (n as Konva.Image).image();
      if (!layer || !(el instanceof HTMLVideoElement) || slideOf(layer) !== i) return [];
      const t = trimWindow({ ...layer, duration: layer.duration || el.duration });
      return [{ el, start: t.start, end: t.end }];
    });

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
  const collageItems = collageItemsOf(design);
  const photoCount = collageItems.filter((l) => l.type === "image").length;
  const clipCount = collageItems.length - photoCount;

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
        // The AI sees at most 30 photos; any more, and the videos, keep the random plan.
        const picked = order
          .map((id) => laid.layers.find((l) => l.id === id)!)
          .filter((l) => l.type === "image" && l.src)
          .slice(0, 30);
        if (picked.length === 0) throw new Error("no photos");
        const photos = await Promise.all(picked.map(async (l) => ({ id: l.id, thumb: await makeThumb(l.src!), slide: Math.max(0, slideOf(l)), landscape: l.w >= l.h })));
        const ai = await postCollagePlan({ photos });
        const aiIds = new Set(picked.map((l) => l.id));
        plan = {
          tilts: { ...plan.tilts, ...Object.fromEntries(ai.tilts.map((t) => [t.photoId, t.degrees])) },
          stickers: [...plan.stickers.filter((s) => !aiIds.has(s.photoId)), ...ai.stickers],
        };
        usedAi = true;
      } catch (e) {
        if (e instanceof Error && e.message === "no photos") usedAi = false;
        else if (e instanceof CollagePlanError && e.code === "OUT_OF_CREDITS") console.warn("Collage AI is out of credits; used a random look.");
        else toast.message("The AI wasn't available, so this is a quick random look. Press Shuffle again to retry.");
      } finally {
        setBusy(null);
      }
    }
    ed.apply(() => applyPlan(laid, cleanPlan(plan, order)));
    go(0);
    track("collage_shuffle", { photos: order.length, clips: clipCount, ai: usedAi });
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
        caption={design.caption ?? ""}
        onCaption={(text) => ed.apply((d) => ({ ...d, caption: text.slice(0, 5000) }), "caption")}
        storyShape={design.format === "story_9_16"}
        shares={shares}
        sharing={sharing}
        onShare={() => void runShare()}
        onDeleteShare={(r) => void removeShare(r)}
      />
      <PhonePreview open={previewOpen} onOpenChange={setPreviewOpen} slideCount={design.slideCount} aspect={SLIDE_WIDTH / height} start={current} render={renderForPreview} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} onTour={() => setTourAgain(true)} />
      <FirstRunTour forceOpen={tourAgain} onClose={() => setTourAgain(false)} />

      <main
        className={styles.body}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          dropFiles(e.dataTransfer.files);
        }}
      >
        <h1 className={styles.srOnly}>Editing {title || "Untitled"}</h1>
        <CarouselCanvas
          className={styles.canvas}
          design={design}
          selectedIds={selectedIds}
          onSelect={selectFromCanvas}
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
          onKeyCycle={cycleLayers}
          onActivate={activateSelected}
        />
        <p aria-live="polite" className={styles.srOnly}>
          {picked.length > 1
            ? `${picked.length} layers selected.`
            : selected
              ? `${kindName(selected)} ${selected.type === "text" ? (selected.text ?? "").slice(0, 60) : selected.name} selected, on slide ${Math.max(0, slideOf(selected)) + 1}.${selected.locked ? " Locked." : ""}`
              : ""}
        </p>

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
              <p className={styles.hint}>
                JPEG, PNG or WebP, up to 25 MB each. You can also drop photos and videos onto the canvas, or paste a copied picture. Photos land on the slide in view. Drag one across a slide edge and it exports as two halves.
              </p>
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
                <Button onClick={() => void shuffleCollage()} disabled={!!busy || collageItems.length === 0}>
                  <Shuffle size={16} /> {busy === "Arranging…" ? "Arranging…" : "Shuffle collage"}
                </Button>
                <div className={styles.fieldRow}>
                  <span id="ai-collage">AI picks the tilts and stickers</span>
                  <Switch aria-labelledby="ai-collage" checked={aiCollage} onCheckedChange={setAiCollage} />
                </div>
                <p className={styles.hint}>
                  Puts your {photoCount === 1 ? "photo" : `${photoCount} photos`}
                  {clipCount ? ` and ${clipCount === 1 ? "video" : `${clipCount} videos`}` : ""} in a new order and a new layout, tilts some of them and adds tape, pins and flowers. Each press gives a different look, and undo goes back.
                  {aiCollage ? " To do this, small blurry copies of your photos are sent to an AI service. Switch it off to keep everything on your device." : ""}
                </p>
              </div>
              {selected?.type === "video" ? (
                <VideoPanel layer={selected} onPatch={(p, k) => ed.patchLayer(selected.id, p, k)} />
              ) : selected?.type === "image" && !selected.src ? (
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
                <PhotoStylePanel
                  layer={selected}
                  onPatch={(p, k) => ed.patchLayer(selected.id, p, k)}
                  onFlip={(a) => void flip(a)}
                  onReplace={() => {
                    fillFor.current = selected.id;
                    files.current?.click();
                  }}
                />
              ) : (
                <p className={styles.hint}>Click a photo on the slides to crop it, flip it, frame it, or change its colours. Click a video to trim it.</p>
              )}
            </TabsContent>

            <TabsContent value="stickers" className={styles.tab}>
              <StickerPanel
                selected={selected}
                onAdd={addSticker}
                onPatch={(p, k) => selected && ed.patchLayer(selected.id, p, k)}
                onAddShape={addShape}
                onRecolour={(c) => selected && selected.sticker !== "custom" && ed.patchLayer(selected.id, { color: c, src: stickerSrc(selected.sticker ?? "star", c) })}
                mine={myStickers}
                onMake={setCutoutSource}
                onAddMine={addMySticker}
                onDeleteMine={(id) => void deleteMySticker(id).then(() => setMyStickers((all) => all.filter((s) => s.id !== id)))}
              />
              <CutoutDialog
                source={cutoutSource}
                onClose={() => setCutoutSource(null)}
                onDone={(s) => {
                  setMyStickers((all) => [s, ...all]);
                  addMySticker(s);
                  setCutoutSource(null);
                  track("sticker_made", {});
                  toast.success("Sticker saved to My stickers and added to the slide.");
                }}
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
                    <Textarea id="words-input" value={selected.text ?? ""} rows={3} disabled={selected.locked} onChange={(e) => patchText({ text: e.target.value }, "text")} />
                    <span className={styles.hint}>Put stars round words to highlight them, *like this*. They turn bold, in the highlight colour.</span>
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
                  <div className={styles.field}>
                    <span id="curve-label">Curve {selected.curve ?? 0}</span>
                    <Slider aria-labelledby="curve-label" min={-100} max={100} value={[selected.curve ?? 0]} disabled={selected.locked} onValueChange={([v]) => patchText({ curve: v === 0 ? undefined : v }, "curve")} />
                    <span className={styles.hint}>Bends the words into an arch (right) or a smile (left). Curved words sit on one line.</span>
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
                  <h3 className={styles.subhead}>Colour</h3>
                  <label className={styles.fieldRow}>
                    <span>Highlight colour</span>
                    <Input type="color" className={styles.colour} value={selected.accent ?? "#e5484d"} disabled={selected.locked} onChange={(e) => patchText({ accent: e.target.value }, "accent")} />
                  </label>
                  <div className={styles.fieldRow}>
                    <span id="fade-label">Colour fade, top to bottom</span>
                    <Switch
                      aria-labelledby="fade-label"
                      checked={!!selected.textGradient}
                      disabled={selected.locked}
                      onCheckedChange={(on) => patchText({ textGradient: on ? { from: selected.color ?? "#1d211e", to: "#e5484d" } : null })}
                    />
                  </div>
                  {selected.textGradient && (
                    <>
                      <label className={styles.fieldRow}>
                        <span>Top colour</span>
                        <Input type="color" className={styles.colour} value={selected.textGradient.from} disabled={selected.locked} onChange={(e) => patchText({ textGradient: { ...selected.textGradient!, from: e.target.value } }, "fadefrom")} />
                      </label>
                      <label className={styles.fieldRow}>
                        <span>Bottom colour</span>
                        <Input type="color" className={styles.colour} value={selected.textGradient.to} disabled={selected.locked} onChange={(e) => patchText({ textGradient: { ...selected.textGradient!, to: e.target.value } }, "fadeto")} />
                      </label>
                    </>
                  )}
                  <Button variant="outline" size="sm" disabled={selected.locked} onClick={fitText}>
                    Fit the words to the box width
                  </Button>
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
              <div className={styles.field}>
                <span id="pattern-label">Pattern</span>
                <Select value={design.pattern?.kind ?? "none"} onValueChange={(v) => setPattern(v === "none" ? null : { kind: v as Pattern["kind"], color: design.pattern?.color ?? readableOn(design.background), opacity: design.pattern?.opacity ?? 0.3 })}>
                  <SelectTrigger aria-labelledby="pattern-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {PATTERN_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {{ grid: "Grid paper", dots: "Dots", lines: "Ruled lines", stripes: "Stripes", checks: "Checks", grain: "Paper grain" }[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {design.pattern && (
                <div className={styles.fields}>
                  <label className={styles.fieldRow}>
                    <span>Pattern colour</span>
                    <Input type="color" className={styles.colour} value={design.pattern.color} onChange={(e) => setPattern({ ...design.pattern!, color: e.target.value })} />
                  </label>
                  <div className={styles.field}>
                    <span id="pattern-strength">Strength {Math.round(design.pattern.opacity * 100)}%</span>
                    <Slider aria-labelledby="pattern-strength" min={5} max={100} value={[Math.round(design.pattern.opacity * 100)]} onValueChange={([v]) => setPattern({ ...design.pattern!, opacity: v / 100 })} />
                  </div>
                </div>
              )}
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
              <p className={styles.hint}>Drag a slide onto another to move it there.{design.slideCount > 60 ? " Pictures are drawn for the first 60 slides." : ""}</p>
              <SlideStrip
                count={design.slideCount}
                current={current}
                thumbs={thumbs}
                aspect={SLIDE_WIDTH / height}
                onGo={go}
                onMove={(from, to) => {
                  ed.moveSlide(from, to);
                  go(to);
                }}
              />
            </TabsContent>

            <TabsContent value="layers" className={styles.tab}>
              {picked.length > 1 ? (
                <div className={styles.fields}>
                  <h2 className={styles.subhead}>{picked.length} layers selected</h2>
                  <p className={styles.hint}>Drag any of them to move them all. Shift-click a layer to add or remove it. Ctrl or ⌘ + C and V copy them, also onto another slide.</p>
                  <div className={styles.alignRow} role="group" aria-label="Align each to its slide">
                    {ALIGNMENTS.map((how) => {
                      const { label, Icon } = ALIGN_ICONS[how];
                      return (
                        <Button key={how} variant="outline" size="icon-sm" aria-label={`${label}, each`} title={`${label}, each`} onClick={() => picked.forEach((l) => ed.align(l.id, how))}>
                          <Icon size={14} />
                        </Button>
                      );
                    })}
                  </div>
                  <div className={styles.grid2}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        copyPicked();
                        pasteHere(40);
                      }}
                    >
                      <Copy size={14} /> Duplicate all
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => ed.patchMany(Object.fromEntries(picked.map((l) => [l.id, { locked: true }])))}>
                      <Lock size={14} /> Lock all
                    </Button>
                    <Button variant="destructive" size="sm" onClick={removePicked}>
                      <Trash2 size={14} /> Delete all
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => selectOnly(null)}>
                      Deselect
                    </Button>
                  </div>
                </div>
              ) : selected ? (
                <div className={styles.fields}>
                  <h2 className={styles.subhead}>{selected.name}</h2>
                  <h3 className={styles.subhead}>Position and size</h3>
                  <ExactBox
                    layer={selected}
                    slide={Math.max(0, Math.min(design.slideCount - 1, slideOf(selected)))}
                    onCommit={(p) => ed.patchLayer(selected.id, selected.type === "text" && p.w ? { ...p, h: measureText({ ...selected, ...p }) } : p)}
                  />
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
                  <h3 className={styles.subhead}>Turn</h3>
                  <div className={styles.grid2}>
                    <Button variant="outline" size="sm" disabled={selected.locked} onClick={() => ed.patchLayer(selected.id, rotatedBy(selected, -90))}>
                      <RotateCcw size={14} /> Left 90°
                    </Button>
                    <Button variant="outline" size="sm" disabled={selected.locked} onClick={() => ed.patchLayer(selected.id, rotatedBy(selected, 90))}>
                      <RotateCw size={14} /> Right 90°
                    </Button>
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
                        aria-pressed={selectedIds.includes(l.id)}
                        onClick={(e) => {
                          if (e.shiftKey) return selectFromCanvas(l.id, true);
                          selectOnly(l.id);
                          go(Math.max(0, Math.min(design.slideCount - 1, slideOf(l))));
                        }}
                      >
                        {kindName(l)}: {l.name}
                        {l.locked ? " (locked)" : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}
