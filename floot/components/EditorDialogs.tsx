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
import type { ShareRecord } from "../helpers/shareLink";
import { shareUrl } from "../helpers/shareLink";
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
  shares,
  sharing,
  onShare,
  onDeleteShare,
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
  /** Links made for this project, newest first. */
  shares: ShareRecord[];
  /** What making a link is doing right now, or null. */
  sharing: string | null;
  onShare: () => void;
  onDeleteShare: (record: ShareRecord) => void;
}) => {
  const [which, setWhich] = useState<"all" | "current" | "some">("all");
  const [list, setList] = useState("");
  const [format, setFormat] = useState<"png" | "jpeg" | "pdf">("png");
  const [quality, setQuality] = useState(92);
  const [width, setWidth] = useState<1080 | 2160>(1080);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
          <DialogDescription>
            {format === "pdf" ? "Every chosen slide goes into one PDF, a page each. LinkedIn takes carousels this way." : "Each slide is a separate picture. Several slides download as one zip."}
          </DialogDescription>
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
            <Select value={format} onValueChange={(v) => setFormat(v as "png" | "jpeg" | "pdf")}>
              <SelectTrigger aria-labelledby="fmt-l">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG (best quality, larger files)</SelectItem>
                <SelectItem value="jpeg">JPEG (smaller files)</SelectItem>
                <SelectItem value="pdf">PDF (one file, for LinkedIn)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {format !== "png" && (
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
          <div className={styles.videoBox}>
            <strong>Share for comments</strong>
            <p>
              Make a link to show friends before you post. They swipe through the slides and leave comments, no account needed. Anyone with the link can see it. Pictures of the slides
              {slideCount > 30 ? " (the first 30)" : ""} are kept on Spanleaf's server for 30 days, or until you delete the link.
            </p>
            <Button variant="outline" size="sm" disabled={!!sharing || !!busy} onClick={onShare}>
              {sharing ?? "Make a link"}
            </Button>
            {shares.length > 0 && (
              <ul className={styles.links} aria-label="Your links">
                {shares.map((s) => (
                  <li key={s.id}>
                    <a href={shareUrl(s.id)} target="_blank" rel="noreferrer">
                      /s/{s.id}
                    </a>
                    <small>until {new Date(s.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void navigator.clipboard.writeText(shareUrl(s.id)).then(
                          () => setLinkCopied(s.id),
                          () => setLinkCopied(null),
                        )
                      }
                    >
                      {linkCopied === s.id ? "Copied" : "Copy"}
                    </Button>
                    {confirmDelete === s.id ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setConfirmDelete(null);
                          onDeleteShare(s);
                        }}
                      >
                        Delete for good
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(s.id)}>
                        Delete
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
 * The carousel the way it will look in a phone feed: a phone-sized frame you swipe through like the real thing, so
 * you can see a photo running across a slide edge line up. Arrows and arrow keys work too. Slides are drawn as they
 * come near.
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
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setIndex(start);
      setPictures({});
      // Wait for the dialog to lay out, then start on the slide in view.
      const t = setTimeout(() => {
        const el = track.current;
        if (el) el.scrollTo({ left: start * el.clientWidth });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [open, start]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    for (const i of [index, index + 1, index - 1, index + 2]) {
      if (i < 0 || i >= slideCount || pictures[i]) continue;
      void render(i).then((src) => alive && setPictures((p) => ({ ...p, [i]: src })));
    }
    return () => {
      alive = false;
    };
    // Pictures is read, not watched: each slide is drawn once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, slideCount, render]);

  const go = (d: number) => {
    const el = track.current;
    const to = Math.min(slideCount - 1, Math.max(0, index + d));
    if (el) el.scrollTo({ left: to * el.clientWidth, behavior: "smooth" });
    setIndex(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.previewDialog}>
        <DialogHeader>
          <DialogTitle>Preview on a phone</DialogTitle>
          <DialogDescription>
            Slide {index + 1} of {slideCount}. Swipe or scroll sideways, or use the arrows.
          </DialogDescription>
        </DialogHeader>
        <div
          className={styles.phone}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
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
            <div
              ref={track}
              className={styles.track}
              onScroll={(e) => {
                const el = e.currentTarget;
                const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                if (i !== index && i >= 0 && i < slideCount) setIndex(i);
              }}
            >
              {Array.from({ length: slideCount }, (_, i) => (
                <div key={i} className={styles.cell}>
                  {pictures[i] ? <img src={pictures[i]} alt={`Slide ${i + 1}`} className={styles.slideImg} draggable={false} /> : <div className={styles.slideLoading}>Drawing slide…</div>}
                </div>
              ))}
            </div>
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
