"use client";
import { useCallback, useRef, useState } from "react";
import { waitForFonts } from "@/lib/fonts";
import { downloadBlob, renderSlides, slugify, waitForImages, zipSlides } from "./export";
import { useEditor } from "./store";

export type ExportState = "idle" | "rendering" | "done" | "failed";

export function useExport() {
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const zip = useRef<{ blob: Blob; name: string } | null>(null);
  const running = useRef(false);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState("rendering");
    setProgress(0);
    setError(null);
    zip.current = null;
    try {
      const { format, slideCount, title, doc } = useEditor.getState();
      await waitForImages();
      // Text is drawn in whatever font is ready at that moment, so wait for every font the project uses.
      await waitForFonts(doc.elements.flatMap((e) => (e.type === "text" && e.text ? [{ font: e.text.font, bold: e.text.bold }] : [])));
      await new Promise((r) => requestAnimationFrame(() => r(null))); // let the canvas redraw with the loaded fonts
      const blobs = await renderSlides({ format, slideCount, onProgress: (d, t) => setProgress((d / t) * 100) });
      const blob = await zipSlides(blobs);
      zip.current = { blob, name: `${slugify(title)}.zip` };
      downloadBlob(zip.current.blob, zip.current.name);
      setState("done");
      useEditor.getState().announce(`Exported ${slideCount} slides`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
      setState("failed");
    } finally {
      running.current = false;
    }
  }, []);

  const again = useCallback(() => {
    if (zip.current) downloadBlob(zip.current.blob, zip.current.name);
  }, []);

  const close = useCallback(() => {
    if (!running.current) setState("idle");
  }, []);

  return { state, progress, error, start, again, close };
}
