import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Slider } from "./Slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import type { ExportOptions } from "../helpers/exportSlides";
import { Textarea } from "./Textarea";
import { instagramChecks } from "../helpers/instagram";
import styles from "./EditorDialogs.module.css";

/** Reads "1-3, 5" into slide numbers counting from 0. Numbers outside 1..total are dropped. */
export const parseSlideList = (text: string, total: number): number[] => {
  const out = new Set<number>();
  for (const part of text.split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i <= total; i++) if (i >= 1) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
};

/** Export settings: which slides, PNG or JPEG, quality and size, and a video of the current slide. */
export const ExportDialog = ({
  open,
  onOpenChange,
  slideCount,
  current,
  currentHasVideo,
  canRecord,
  busy,
  onExport,
  onExportVideo,
  caption,
  onCaption,
  storyShape,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slideCount: number;
  current: number;
  currentHasVideo: boolean;
  canRecord: boolean;
  busy: string | null;
  onExport: (o: ExportOptions) => void;
  onExportVideo: () => void;
  caption: string;
  onCaption: (text: string) => void;
  /** The slides are 9:16, which Instagram crops in a feed carousel. */
  storyShape: boolean;
}) => {
  const [which, setWhich] = useState<"all" | "current" | "some">("all");
  const [list, setList] = useState("");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [quality, setQuality] = useState(92);
  const [width, setWidth] = useState<1080 | 2160>(1080);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [caption]);
  const chosen = which === "all" ? undefined : which === "current" ? [current] : parseSlideList(list, slideCount);
  const none = which === "some" && (chosen?.length ?? 0) === 0;
  const count = chosen?.length ?? slideCount;
  const checks = instagramChecks({ caption, slides: count, storyShape });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Each slide is a separate picture. Several slides download as one zip.</DialogDescription>
        </DialogHeader>
        <div className={styles.form}>
          <div className={styles.field}>
            <span id="which-l">Slides</span>
            <Select value={which} onValueChange={(v) => setWhich(v as typeof which)}>
              <SelectTrigger aria-labelledby="which-l">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {slideCount} slides</SelectItem>
                <SelectItem value="current">Only slide {current + 1}</SelectItem>
                <SelectItem value="some">Some slides…</SelectItem>
              </SelectContent>
            </Select>
            {which === "some" && (
              <label className={styles.field}>
                <span>Slide numbers, like 1-3, 5</span>
                <Input value={list} onChange={(e) => setList(e.target.value)} placeholder="1-3, 5" />
              </label>
            )}
          </div>
          <div className={styles.field}>
            <span id="fmt-l">Format</span>
            <Select value={format} onValueChange={(v) => setFormat(v as "png" | "jpeg")}>
              <SelectTrigger aria-labelledby="fmt-l">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG (best quality, larger files)</SelectItem>
                <SelectItem value="jpeg">JPEG (smaller files)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {format === "jpeg" && (
            <div className={styles.field}>
              <span id="q-l">Quality {quality}%</span>
              <Slider aria-labelledby="q-l" min={50} max={100} value={[quality]} onValueChange={([v]) => setQuality(v)} />
            </div>
          )}
          <div className={styles.field}>
            <span id="size-l">Size</span>
            <Select value={String(width)} onValueChange={(v) => setWidth(Number(v) as 1080 | 2160)}>
              <SelectTrigger aria-labelledby="size-l">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1080">1080 pixels wide (what Instagram uses)</SelectItem>
                <SelectItem value="2160">2160 pixels wide (twice the detail)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {currentHasVideo && (
            <div className={styles.videoBox}>
              <p>Slide {current + 1} has a video. Pictures show the frame on screen. To keep the movement, export this slide as a video (silent, up to 60 seconds).</p>
              <Button variant="outline" size="sm" disabled={!canRecord || !!busy} onClick={onExportVideo}>
                Export slide {current + 1} as video
              </Button>
              {!canRecord && <small>This browser can't record video. Try Chrome, Edge or a recent Safari.</small>}
            </div>
          )}
          <div className={styles.field}>
            <span id="caption-l">Caption</span>
            <Textarea aria-labelledby="caption-l" rows={4} value={caption} placeholder="Write the caption here, then copy it when you post." onChange={(e) => onCaption(e.target.value)} />
            <div className={styles.captionRow}>
              <small>
                {checks.characters} of 2,200 characters · {checks.hashtags} of 30 hashtags
              </small>
              <Button
                variant="outline"
                size="sm"
                disabled={!caption.trim()}
                onClick={() =>
                  void navigator.clipboard.writeText(caption).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  )
                }
              >
                {copied ? "Copied" : "Copy caption"}
              </Button>
            </div>
          </div>
          {checks.warnings.length > 0 && (
            <ul className={styles.warnings} aria-label="Instagram checks">
              {checks.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={none || !!busy} onClick={() => onExport({ slides: chosen, format, quality: quality / 100, width })}>
            {busy ?? "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The carousel the way it will look in a phone feed: one slide at a time in a phone-sized frame. Swipe, use the
 * arrows, or the arrow keys. Each slide is drawn when it is shown.
 */
export const PhonePreview = ({
  open,
  onOpenChange,
  slideCount,
  aspect,
  start,
  render,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slideCount: number;
  /** Slide width over height. */
  aspect: number;
  start: number;
  render: (index: number) => Promise<string>;
}) => {
  const [index, setIndex] = useState(start);
  const [pictures, setPictures] = useState<Record<number, string>>({});
  const touch = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setIndex(start);
      setPictures({});
    }
  }, [open, start]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    for (const i of [index, index + 1, index - 1]) {
      if (i < 0 || i >= slideCount || pictures[i]) continue;
      void render(i).then((src) => alive && setPictures((p) => ({ ...p, [i]: src })));
    }
    return () => {
      alive = false;
    };
    // Pictures is read, not watched: each slide is drawn once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, slideCount, render]);

  const go = (d: number) => setIndex((i) => Math.min(slideCount - 1, Math.max(0, i + d)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.previewDialog}>
        <DialogHeader>
          <DialogTitle>Preview on a phone</DialogTitle>
          <DialogDescription>
            Slide {index + 1} of {slideCount}. Swipe, or use the arrows.
          </DialogDescription>
        </DialogHeader>
        <div
          className={styles.phone}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            touch.current = null;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          }}
          tabIndex={0}
          role="region"
          aria-label="Phone preview"
        >
          <div className={styles.feedTop}>
            <span className={styles.avatar} aria-hidden />
            <span>your_account</span>
          </div>
          <div className={styles.slideWrap} style={{ aspectRatio: String(aspect) }}>
            {pictures[index] ? <img src={pictures[index]} alt={`Slide ${index + 1}`} className={styles.slideImg} /> : <div className={styles.slideLoading}>Drawing slide…</div>}
            <span className={styles.counter}>
              {index + 1}/{slideCount}
            </span>
          </div>
          <div className={styles.dots} aria-hidden>
            {Array.from({ length: Math.min(slideCount, 10) }, (_, i) => (
              <span key={i} className={i === Math.min(index, 9) ? styles.dotOn : styles.dot} />
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="icon-sm" aria-label="Previous slide" disabled={index <= 0} onClick={() => go(-1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next slide" disabled={index >= slideCount - 1} onClick={() => go(1)}>
            <ChevronRight size={16} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const SHORTCUTS: [string, string][] = [
  ["Ctrl or ⌘ + Z", "Undo"],
  ["Ctrl or ⌘ + Shift + Z, or Ctrl + Y", "Redo"],
  ["Ctrl or ⌘ + D", "Duplicate the selected layer"],
  ["Shift + click", "Add a layer to the selection, or take it out"],
  ["Ctrl or ⌘ + A", "Select everything on the slide in view"],
  ["Ctrl or ⌘ + C, X, V", "Copy, cut and paste, also onto another slide"],
  ["Ctrl or ⌘ + scroll, or pinch", "Zoom the canvas"],
  ["Delete or Backspace", "Delete the selected layer"],
  ["Arrow keys", "Nudge the selected layer 1 pixel"],
  ["Shift + arrow keys", "Nudge 10 pixels"],
  ["] and [", "Bring forward, send backward"],
  ["Escape", "Deselect"],
  ["Alt while dragging", "Turn off snapping"],
  ["P", "Preview on a phone"],
  ["?", "Show these shortcuts"],
];

export const ShortcutsDialog = ({ open, onOpenChange, onTour }: { open: boolean; onOpenChange: (o: boolean) => void; onTour: () => void }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>These work when you aren't typing in a box.</DialogDescription>
      </DialogHeader>
      <dl className={styles.shortcuts}>
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys}>
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            onOpenChange(false);
            onTour();
          }}
        >
          Show the tour again
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
