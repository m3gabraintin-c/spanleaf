import { zipSync } from "fflate";
import { FORMATS, type FormatKey } from "@/lib/formats";
import { canvasRegistry } from "./registry";

/** Wait until every image on the canvas has loaded, or fail with a plain message. */
export async function waitForImages(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const states = [...canvasRegistry.imageStatus.values()];
    if (states.includes("error")) throw new Error("Some photos are missing or didn't load, so we can't export yet. Remove them and try again.");
    if (!states.includes("loading")) return;
    if (Date.now() - start > timeoutMs) throw new Error("Some images are still loading. Try again in a moment.");
    await new Promise((r) => setTimeout(r, 50));
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser couldn't create the image."))), "image/png"),
  );
}

/**
 * Renders each slide on its own. The full strip is never drawn into one canvas, because browsers
 * cap canvas size and a 20 slide strip is 21,600 px wide. Each slide is a 1080 px wide region of
 * the content layer, rendered at scale 1 whatever the on-screen zoom or device pixel ratio.
 */
export async function renderSlides(opts: {
  format: FormatKey;
  slideCount: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<Blob[]> {
  const { stage, content } = canvasRegistry;
  if (!stage || !content) throw new Error("The canvas isn't ready yet.");
  const f = FORMATS[opts.format];
  const blobs: Blob[] = [];

  for (let i = 0; i < opts.slideCount; i++) {
    const prevScale = { ...stage.scale() };
    const prevPos = { ...stage.position() };
    let canvas: HTMLCanvasElement;
    try {
      // Drawing is synchronous, so the on-screen canvas never repaints at scale 1.
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: 0, y: 0 });
      canvas = content.toCanvas({ x: i * f.width, y: 0, width: f.width, height: f.height, pixelRatio: 1 });
    } finally {
      stage.scale(prevScale);
      stage.position(prevPos);
    }
    blobs.push(await canvasToBlob(canvas));
    canvas.width = 0; // free the pixel buffer before the next slide
    canvas.height = 0;
    opts.onProgress?.(i + 1, opts.slideCount);
    await new Promise((r) => setTimeout(r, 0)); // let the progress bar paint
  }
  return blobs;
}

export async function zipSlides(blobs: Blob[]): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < blobs.length; i++) {
    const name = `slide-${String(i + 1).padStart(2, "0")}.png`;
    files[name] = new Uint8Array(await blobs[i].arrayBuffer());
  }
  // PNG is already compressed, so store without deflating.
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
}

export function slugify(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // é becomes e, ñ becomes n
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "project"
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
