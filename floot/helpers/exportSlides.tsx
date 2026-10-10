import Konva from "konva";
import { zipSync } from "fflate";
import { Design, FORMATS, SLIDE_WIDTH } from "./carouselModel";
import { PdfPage, makePdf } from "./pdfExport";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "carousel";

const bytesOf = (dataUrl: string): Uint8Array => {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/**
 * Runs fn with the stage at full size and empty photo frames hidden, then puts everything back as it was, even if
 * fn fails half way.
 */
export const withExportView = async <T,>(stage: Konva.Stage, content: Konva.Layer, fn: () => Promise<T> | T): Promise<T> => {
  const saved = { sx: stage.scaleX(), sy: stage.scaleY(), x: stage.x(), y: stage.y() };
  stage.scale({ x: 1, y: 1 });
  stage.position({ x: 0, y: 0 });
  // Empty photo frames are for editing only, so they are left out of the pictures.
  const frames = content.find(".placeholder");
  frames.forEach((n) => n.visible(false));
  try {
    return await fn();
  } finally {
    frames.forEach((n) => n.visible(true));
    stage.scale({ x: saved.sx, y: saved.sy });
    stage.position({ x: saved.x, y: saved.y });
    stage.batchDraw();
  }
};

/** One slide as a picture address, at ratio times full size (1 is 1080 pixels wide). */
export const renderSlide = (stage: Konva.Stage, content: Konva.Layer, design: Design, index: number, ratio: number) =>
  withExportView(stage, content, () =>
    content.toDataURL({ x: index * SLIDE_WIDTH, y: 0, width: SLIDE_WIDTH, height: FORMATS[design.format].height, pixelRatio: ratio, mimeType: "image/jpeg", quality: 0.85 }),
  );

export type ExportOptions = {
  /** Which slides, counting from 0. Leave out for all of them. */
  slides?: number[];
  /** PDF puts every chosen slide in one file, a page each (as JPEG pictures). */
  format: "png" | "jpeg" | "pdf";
  /** JPEG and PDF, 0.5 to 1. */
  quality: number;
  /** Width of each picture: 1080, or 2160 for twice the detail. */
  width: 1080 | 2160;
};

/**
 * Draws the chosen slides and downloads them: one picture for one slide, a zip for more. A video shows the frame
 * that is on screen at the time.
 */
export const exportSlides = async (
  stage: Konva.Stage,
  content: Konva.Layer,
  design: Design,
  title: string,
  options: ExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<void> => {
  const height = FORMATS[design.format].height;
  const chosen = (options.slides ?? Array.from({ length: design.slideCount }, (_, i) => i)).filter((i) => i >= 0 && i < design.slideCount);
  if (chosen.length === 0) throw new Error("Choose at least one slide to export.");
  const ext = options.format === "png" ? "png" : "jpg";
  const mime = options.format === "png" ? "image/png" : "image/jpeg";
  const pdf = options.format === "pdf";
  await withExportView(stage, content, async () => {
    const base = slug(title);
    const width = String(design.slideCount).length;
    const files: Record<string, Uint8Array> = {};
    const pages: PdfPage[] = [];
    for (let k = 0; k < chosen.length; k++) {
      const i = chosen[k];
      const url = content.toDataURL({
        x: i * SLIDE_WIDTH,
        y: 0,
        width: SLIDE_WIDTH,
        height,
        pixelRatio: options.width / SLIDE_WIDTH,
        mimeType: mime,
        quality: Math.min(1, Math.max(0.5, options.quality)),
      });
      if (pdf) pages.push({ jpeg: bytesOf(url), width: options.width, height: Math.round((height * options.width) / SLIDE_WIDTH) });
      else files[`${base}-${String(i + 1).padStart(width, "0")}.${ext}`] = bytesOf(url);
      onProgress?.(k + 1, chosen.length);
      // Let the page breathe between slides.
      await new Promise((r) => setTimeout(r, 0));
    }
    if (pdf) return download(new Blob([makePdf(pages) as BlobPart], { type: "application/pdf" }), `${base}.pdf`);
    const names = Object.keys(files);
    if (names.length === 1) download(new Blob([files[names[0]] as BlobPart], { type: mime }), names[0]);
    else download(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }), `${base}.zip`);
  });
};

/** The video format this browser can record: MP4 where it can (what Instagram wants), otherwise WebM. */
export const recordingType = () => {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
};

/**
 * A clip on the slide being recorded, and the part of it that plays (its trim), in seconds.
 */
export type ClipPlay = { el: HTMLVideoElement; start: number; end: number };

const seekTo = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((resolve) => {
    if (Math.abs(v.currentTime - t) < 0.01) return resolve();
    const done = () => resolve();
    v.addEventListener("seeked", done, { once: true });
    setTimeout(done, 1500);
    v.currentTime = t;
  });

/**
 * Records one slide as a silent video while its clips play from their trim start, for as long as the longest
 * trimmed clip (at most 60 seconds). Shorter clips loop within their trim. The editor shows the recording at full
 * size while it runs.
 */
export const exportSlideVideo = async (
  stage: Konva.Stage,
  content: Konva.Layer,
  design: Design,
  slide: number,
  title: string,
  clips: ClipPlay[],
  onProgress?: (fraction: number) => void,
): Promise<void> => {
  const type = recordingType();
  if (!type) throw new Error("This browser can't record video. Try Chrome, Edge or a recent Safari.");
  if (clips.length === 0) throw new Error("This slide has no video on it.");
  const videos = clips.map((c) => c.el);
  const height = FORMATS[design.format].height;
  const seconds = Math.min(60, Math.max(...clips.map((c) => (c.end > c.start ? c.end - c.start : c.el.duration || 0))));
  if (!seconds) throw new Error("The video on this slide hasn't loaded yet. Try again in a moment.");

  await withExportView(stage, content, async () => {
    // Make the stage exactly one slide, showing this slide, so each frame is a straight copy of the layer's own
    // canvas. Drawing a fresh picture of the slide every frame is too slow to keep up with the video.
    const size = { width: stage.width(), height: stage.height() };
    stage.size({ width: SLIDE_WIDTH, height });
    stage.position({ x: -slide * SLIDE_WIDTH, y: 0 });
    const layerCanvas = content.getCanvas()._canvas as HTMLCanvasElement;

    const record = async (mimeType: string): Promise<Blob> => {
      const canvas = document.createElement("canvas");
      canvas.width = SLIDE_WIDTH;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser can't record video.");
      const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
      for (const v of videos) v.pause();
      await Promise.all(clips.map((c) => seekTo(c.el, c.start)));
      await Promise.all(videos.map((v) => v.play().catch(() => undefined)));
      recorder.start(250);
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const frame = () => {
          const t = (performance.now() - started) / 1000;
          // A clip that reaches the end of its trim goes back to its start, as it does in the editor.
          for (const c of clips) if (c.end > c.start && c.el.currentTime >= c.end - 0.02) c.el.currentTime = c.start;
          content.draw();
          ctx.drawImage(layerCanvas, 0, 0, SLIDE_WIDTH, height);
          onProgress?.(Math.min(1, t / seconds));
          if (t >= seconds) return resolve();
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      recorder.stop();
      await done;
      return new Blob(chunks, { type: mimeType.split(";")[0] });
    };

    try {
      // Some browsers say they can record MP4 and then hand back nothing. WebM is the fallback.
      const tries = [...new Set([type, MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : type])];
      for (const t of tries) {
        const blob = await record(t);
        if (blob.size > 0) {
          download(blob, `${slug(title)}-slide-${slide + 1}.${t.startsWith("video/mp4") ? "mp4" : "webm"}`);
          return;
        }
      }
      throw new Error("The recording came out empty. Try again, or try another browser.");
    } finally {
      for (const v of videos) v.pause();
      stage.size(size);
    }
  });
};
