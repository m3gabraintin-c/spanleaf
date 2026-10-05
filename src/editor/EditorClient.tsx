"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Download, ImagePlus, Frame, ImageOff, Layers, Crop, Loader2, Palette, Pencil, PaintBucket, Ratio, Scissors, Redo2, SlidersHorizontal, Sticker, Type, Undo2 } from "lucide-react";
import { data, DataError, type MediaRecord } from "@/data";
import { FORMATS, SLIDE_WIDTH, ACCEPTED_IMAGE_TYPES, MAX_BATCH_PHOTOS, UPLOAD_CONCURRENCY } from "@/lib/formats";
import { uploadMany, type BatchProgress } from "@/lib/upload";
import { uid } from "@/lib/doc";
import {
  Button,
  Dialog,
  EmptyState,
  IconButton,
  ProgressBar,
  Skeleton,
  ToastProvider,
  TooltipProvider,
  ToolPanel,
  ToolRail,
  buttonClasses,
  useToast,
  type ToolItem,
} from "@/ui";
import { canvasRegistry } from "./registry";
import { BackgroundPanel } from "./panels/BackgroundPanel";
import { LayersPanel } from "./panels/LayersPanel";
import { TextPanel } from "./panels/TextPanel";
import { AdjustPanel } from "./panels/AdjustPanel";
import { CropPanel } from "./panels/CropPanel";
import { CutoutPanel } from "./panels/CutoutPanel";
import { DrawPanel } from "./panels/DrawPanel";
import { FramesPanel } from "./panels/FramesPanel";
import { SizePanel } from "./panels/SizePanel";
import { StickersPanel } from "./panels/StickersPanel";
import { ThemesPanel } from "./panels/ThemesPanel";
import { useEditor, type ToolKey } from "./store";
import { useAutosave } from "./useAutosave";
import { useExport } from "./useExport";

// Konva needs the browser. Load it only there.
const CanvasStage = dynamic(() => import("./CanvasStage"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-canvas" aria-busy="true" />,
});

const TOOLS: (ToolItem & { key: ToolKey })[] = [
  { key: "media", label: "Media", icon: ImagePlus },
  { key: "themes", label: "Themes", icon: Palette },
  { key: "crop", label: "Crop", icon: Crop },
  { key: "size", label: "Size", icon: Ratio },
  { key: "text", label: "Text", icon: Type },
  { key: "layers", label: "Layers", icon: Layers },
  { key: "stickers", label: "Stickers", icon: Sticker },
  { key: "frames", label: "Frames", icon: Frame },
  { key: "draw", label: "Draw", icon: Pencil },
  { key: "cutout", label: "Cut out", icon: Scissors },
  { key: "background", label: "Colour", icon: PaintBucket },
  { key: "adjust", label: "Adjust", icon: SlidersHorizontal },
];

function SaveStatusText() {
  const status = useEditor((s) => s.saveStatus);
  const label =
    status === "saving"
      ? "Saving…"
      : status === "unsaved"
        ? "Unsaved"
        : status === "conflict" || status === "error" || status === "signed_out"
          ? "Not saved"
          : "Saved";
  return (
    <span className={status === "error" || status === "signed_out" ? "text-sm text-danger" : "text-sm text-muted"} aria-live="polite">
      {label}
    </span>
  );
}

/** Says why changes aren't being saved, and what to do. Shown under the header, so it can't be missed. */
function SaveBanner({ onRetry }: { onRetry: () => void }) {
  const status = useEditor((s) => s.saveStatus);
  const error = useEditor((s) => s.saveError);
  if (status !== "error" && status !== "signed_out") return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-3 py-2 text-sm text-ink">
      <p className="min-w-0 flex-1">
        {status === "signed_out"
          ? "You've been signed out, so your latest changes aren't saved yet. Sign in again in a new tab, then press Try again here. Keep this tab open so nothing is lost."
          : `Your latest changes aren't saved. ${error ?? ""}`}
      </p>
      <div className="flex items-center gap-2">
        {status === "signed_out" ? (
          <a href="/login" target="_blank" rel="noopener" className={buttonClasses("secondary", "sm")}>
            Sign in
          </a>
        ) : null}
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function UndoRedo() {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const announce = useEditor((s) => s.announce);
  return (
    <div role="group" aria-label="History" className="flex items-center">
      <IconButton
        label="Undo"
        disabled={!canUndo}
        onClick={() => {
          undo();
          announce("Undone");
        }}
      >
        <Undo2 aria-hidden className="size-5" />
      </IconButton>
      <IconButton
        label="Redo"
        disabled={!canRedo}
        onClick={() => {
          redo();
          announce("Redone");
        }}
      >
        <Redo2 aria-hidden className="size-5" />
      </IconButton>
    </div>
  );
}

/** Ctrl or Cmd + Z, Shift + Z, and Ctrl + Y, except while typing in a field, where the field's own undo applies. */
function useHistoryShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const s = useEditor.getState();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (s.past.length) {
          s.undo();
          s.announce("Undone");
        }
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        if (s.future.length) {
          s.redo();
          s.announce("Redone");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function MediaPanel() {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const busy = progress !== null;
  const addElement = useEditor((s) => s.addElement);
  const addMediaUrls = useEditor((s) => s.addMediaUrls);
  const announce = useEditor((s) => s.announce);

  const place = async (media: MediaRecord) => {
    addMediaUrls(await data.getMediaUrls([media.id]));
    // Fit inside 80% of a slide and centre it on the slide in view.
    const { format } = useEditor.getState();
    const f = FORMATS[format];
    const k = Math.min((f.width * 0.8) / media.width, (f.height * 0.8) / media.height, 1);
    const w = Math.round(media.width * k);
    const h = Math.round(media.height * k);
    const slide = canvasRegistry.currentSlide();
    const cx = slide * SLIDE_WIDTH + f.width / 2;
    const cy = f.height / 2;
    // Photos that would land exactly on top of another one are shifted down and right a step,
    // so adding several at once doesn't look like adding one.
    const existing = useEditor.getState().doc.elements;
    let step = 0;
    while (step < 8 && existing.some((e) => Math.abs(e.x + e.w / 2 - (cx + step * 56)) < 30 && Math.abs(e.y + e.h / 2 - (cy + step * 56)) < 30)) step++;
    const nudge = step * 56;
    addElement({
      id: uid(),
      type: "image",
      x: Math.round(slide * SLIDE_WIDTH + (f.width - w) / 2 + nudge),
      y: Math.round((f.height - h) / 2 + nudge),
      w,
      h,
      rotation: 0,
      locked: false,
      name: media.name,
      mediaId: media.id,
    });
    announce(`Added ${media.name} to slide ${slide + 1}`);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProgress({ total: files.length, finished: 0, failed: 0 });
    try {
      // Uploads run a few at a time, but photos are placed in the order they were picked.
      const result = await uploadMany(Array.from(files), (f) => data.uploadImage(f), {
        concurrency: UPLOAD_CONCURRENCY,
        maxFiles: MAX_BATCH_PHOTOS,
        onProgress: setProgress,
        onSettled: async (r) => {
          if (r.error !== undefined) return toast("error", r.error);
          try {
            await place(r.value!);
          } catch (e) {
            toast("error", e instanceof DataError || e instanceof Error ? e.message : "That photo couldn't be added.");
          }
        },
      });
      if (result.skipped > 0) toast("error", `Only the first ${MAX_BATCH_PHOTOS} photos were added.`);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onFiles(e.target.files)}
      />
      <Button
        variant="secondary"
        loading={busy}
        icon={<ImagePlus aria-hidden className="size-4" />}
        onClick={() => input.current?.click()}
      >
        {progress && progress.total > 1 ? `Adding ${Math.min(progress.finished + 1, progress.total)} of ${progress.total}` : "Add photos"}
      </Button>
      <p className="text-sm text-muted">JPEG, PNG or WebP, up to 25 MB each. Photos land on the slide you&apos;re looking at.</p>
      <p className="text-sm text-muted">Drag a photo across a slide edge and it will split cleanly when you export.</p>
      <p className="text-sm text-muted">Edges and centres snap to guides while you drag. Hold Alt to turn that off.</p>
    </div>
  );
}

function ToolBody({ tool }: { tool: ToolKey }) {
  if (tool === "media") return <MediaPanel />;
  if (tool === "themes") return <ThemesPanel />;
  if (tool === "crop") return <CropPanel />;
  if (tool === "size") return <SizePanel />;
  if (tool === "text") return <TextPanel />;
  if (tool === "stickers") return <StickersPanel />;
  if (tool === "frames") return <FramesPanel />;
  if (tool === "draw") return <DrawPanel />;
  if (tool === "cutout") return <CutoutPanel />;
  if (tool === "adjust") return <AdjustPanel />;
  if (tool === "layers") return <LayersPanel />;
  if (tool === "background") return <BackgroundPanel />;
  const t = TOOLS.find((x) => x.key === tool)!;
  return (
    <EmptyState
      icon={<t.icon aria-hidden className="size-6" />}
      title={`${t.label} isn't built yet`}
      as="h3"
      body="This tool arrives in a later milestone."
    />
  );
}

function ExportDialog({ ex, restoreFocusTo }: { ex: ReturnType<typeof useExport>; restoreFocusTo: React.RefObject<HTMLElement | null> }) {
  const slideCount = useEditor((s) => s.slideCount);
  return (
    <Dialog
      open={ex.state !== "idle"}
      onOpenChange={(open) => !open && ex.close()}
      dismissible={ex.state !== "rendering"}
      restoreFocusTo={restoreFocusTo}
      title={ex.state === "failed" ? "Export didn't finish" : ex.state === "done" ? "Your slides are ready" : "Exporting"}
      description={
        ex.state === "done"
          ? `${slideCount} PNG files, one per slide, are in a zip in your downloads.`
          : ex.state === "failed"
            ? (ex.error ?? "Something went wrong.")
            : "Rendering each slide at 1080 pixels wide. Keep this tab open."
      }
      actions={
        ex.state === "done" ? (
          <>
            <Button variant="ghost" onClick={ex.again}>
              Download again
            </Button>
            <Button onClick={ex.close}>Done</Button>
          </>
        ) : ex.state === "failed" ? (
          <>
            <Button variant="ghost" onClick={ex.close}>
              Close
            </Button>
            <Button onClick={() => void ex.start()}>Try again</Button>
          </>
        ) : null
      }
    >
      <ProgressBar
        label={ex.state === "done" ? "Slides rendered" : "Rendering slides"}
        value={ex.state === "done" ? 100 : ex.progress}
        state={ex.state === "done" ? "done" : ex.state === "failed" ? "failed" : "running"}
      />
    </Dialog>
  );
}

function Editor({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const title = useEditor((s) => s.title);
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const saveStatus = useEditor((s) => s.saveStatus);
  const announcement = useEditor((s) => s.announcement);
  const flush = useAutosave();
  useHistoryShortcuts();
  const ex = useExport();
  const exportButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await data.getMe();
        if (!me) {
          location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        const p = await data.getProject(projectId);
        if (cancelled) return;
        useEditor.getState().load(p);
        const ids = [...new Set(p.doc.elements.flatMap((e) => (e.mediaId ? [e.mediaId] : [])))];
        if (ids.length) {
          const urls = await data.getMediaUrls(ids);
          useEditor.getState().addMediaUrls(urls);
          // Anything the data layer couldn't find a file for is flagged now, not after a long wait.
          useEditor.getState().setMediaMissing(ids.filter((id) => !urls[id]));
        }
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled) setStatus(e instanceof DataError && e.code === "NOT_FOUND" ? "missing" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const onToolChange = useCallback((k: string) => setTool(k === useEditor.getState().tool ? null : (k as ToolKey)), [setTool]);

  if (status === "loading")
    return (
      <div className="flex h-dvh flex-col" aria-busy="true">
        <div className="h-(--layout-header-mobile) border-b border-line lg:h-(--layout-header)" />
        <div className="flex flex-1 items-center justify-center bg-canvas">
          <Skeleton className="h-2/3 w-2/3 max-w-3xl" />
        </div>
      </div>
    );

  if (status === "missing" || status === "error")
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center p-6">
        <EmptyState
          icon={<ImageOff aria-hidden className="size-6" />}
          title={status === "missing" ? "Project not found" : "Couldn't open this project"}
          as="h1"
          body={status === "missing" ? "It may have been deleted, or it was made on another device." : "Check your connection and try again."}
          action={
            <Link href="/app" className={buttonClasses("primary", "md")}>
              Back to projects
            </Link>
          }
        />
      </main>
    );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-(--layout-header-mobile) shrink-0 items-center justify-between gap-2 border-b border-line bg-page px-2 lg:h-(--layout-header) lg:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <Link href="/app" aria-label="Back to projects" className="grid size-9 shrink-0 place-items-center rounded-md text-ink t-fast hover:bg-surface-hover pointer-coarse:size-11">
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
          <h1 className="min-w-0 truncate text-sm font-semibold lg:text-base">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 lg:gap-2">
          <UndoRedo />
          <SaveStatusText />
          <Button
            ref={exportButton}
            size="sm"
            icon={ex.state === "rendering" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
            onClick={() => void ex.start()}
            disabled={ex.state === "rendering"}
          >
            Export
          </Button>
        </div>
      </header>
      <SaveBanner onRetry={() => void flush()} />

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row-reverse">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col-reverse lg:flex-row-reverse">
          {tool ? (
            <ToolPanel title={TOOLS.find((t) => t.key === tool)!.label} onClose={() => setTool(null)}>
              <ToolBody tool={tool} />
            </ToolPanel>
          ) : null}
          <CanvasStage />
        </div>
        <ToolRail tools={TOOLS} active={tool} onChange={onToolChange} />
      </main>

      <ExportDialog ex={ex} restoreFocusTo={exportButton} />

      <Dialog
        open={saveStatus === "conflict"}
        onOpenChange={() => {}}
        dismissible={false}
        title="Edited somewhere else"
        description="This project was saved from another tab or window. Reload to see the latest version. Changes made here since then can't be merged."
        actions={<Button onClick={() => location.reload()}>Reload</Button>}
      />

      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

export default function EditorClient({ projectId }: { projectId: string }) {
  return (
    <TooltipProvider>
      <ToastProvider>
        <Editor projectId={projectId} />
      </ToastProvider>
    </TooltipProvider>
  );
}
