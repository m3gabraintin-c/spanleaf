import Konva from "konva";
import { zipSync } from "fflate";
import { Design, FORMATS, SLIDE_WIDTH } from "./carouselModel";

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
 * Draws every slide at 1080 pixels wide and downloads it: a PNG for one slide, a zip of PNGs for more.
 * The stage is put back as it was afterwards, even if something fails half way.
 */
export const exportSlides = async (
  stage: Konva.Stage,
  content: Konva.Layer,
  design: Design,
  title: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> => {
  const height = FORMATS[design.format].height;
  const saved = { sx: stage.scaleX(), sy: stage.scaleY(), x: stage.x(), y: stage.y() };
  stage.scale({ x: 1, y: 1 });
  stage.position({ x: 0, y: 0 });
  try {
    const base = slug(title);
    const width = String(design.slideCount).length;
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < design.slideCount; i++) {
      const url = content.toDataURL({
        x: i * SLIDE_WIDTH,
        y: 0,
        width: SLIDE_WIDTH,
        height,
        pixelRatio: 1,
        mimeType: "image/png",
      });
      files[`${base}-${String(i + 1).padStart(width, "0")}.png`] = bytesOf(url);
      onProgress?.(i + 1, design.slideCount);
      // Let the page breathe between slides.
      await new Promise((r) => setTimeout(r, 0));
    }
    const names = Object.keys(files);
    if (names.length === 1) {
      download(new Blob([files[names[0]] as BlobPart], { type: "image/png" }), names[0]);
    } else {
      download(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }), `${base}.zip`);
    }
  } finally {
    stage.scale({ x: saved.sx, y: saved.sy });
    stage.position({ x: saved.x, y: saved.y });
    stage.batchDraw();
  }
};
