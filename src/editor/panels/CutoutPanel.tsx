"use client";
import { useEffect, useRef, useState } from "react";
import { data } from "@/data";
import { cropTo, finishCutout, placeCutout, type CutoutResult, type Rgba } from "@/lib/cutout";
import { layerName, type Element } from "@/lib/doc";
import { matteOutput } from "@/lib/matting";
import { Button, ColourPicker, EmptyState, Slider, SwitchField } from "@/ui";
import { adjustedSource } from "../adjusted";
import { drawPreview, loadImage, pngFile, readRegion } from "../cutout-io";
import { loadMatter } from "../matting-runtime";
import { useEditor } from "../store";

/** The longest side the photo is worked on at. Slides are 1080 wide, so more is wasted time. */
const WORK_EDGE = 1200;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Take the background away from a photo, so the object can be placed on its own. */
export function CutoutPanel() {
  const elements = useEditor((s) => s.doc.elements);
  const selectedId = useEditor((s) => s.selectedId);
  const el = elements.find((e) => e.id === selectedId);
  if (!el || el.type !== "image" || !el.mediaId) {
    return <EmptyState title="Select a photo" as="h3" body="Click a photo on the canvas, then remove its background to use the object on its own." />;
  }
  // A new panel for each photo, so nothing from one photo is shown for another.
  return <Cutter key={`${el.id}:${el.mediaId}`} el={el} />;
}

function Cutter({ el }: { el: Element }) {
  const url = useEditor((s) => s.mediaUrls[el.mediaId!]?.url);
  const updateElement = useEditor((s) => s.updateElement);
  const addMediaUrls = useEditor((s) => s.addMediaUrls);
  const announce = useEditor((s) => s.announce);

  const [phase, setPhase] = useState<"idle" | "working" | "ready" | "saving">("idle");
  const [error, setError] = useState<string>();
  const [strength, setStrength] = useState(50);
  const [border, setBorder] = useState(false);
  const [width, setWidth] = useState(10);
  const [colour, setColour] = useState("#ffffff");
  const [result, setResult] = useState<CutoutResult | null>(null);
  const job = useRef<{ rgba: Rgba; pred: ArrayLike<number> } | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  // Whenever the settings change, make the result again from the model's answer. This is quick, so no model run.
  useEffect(() => {
    if (phase !== "ready" || !job.current) return;
    const t = setTimeout(() => {
      const j = job.current!;
      setResult(finishCutout(j.rgba, matteOutput(j.pred, j.rgba.w, j.rgba.h, strength), border ? { width, color: colour } : null));
    }, 120);
    return () => clearTimeout(t);
  }, [phase, strength, border, width, colour]);

  useEffect(() => {
    if (result && preview.current) drawPreview(preview.current, result.image, 360);
  }, [result]);

  const start = async () => {
    if (!url) return setError("This photo isn't loaded yet. Try again in a moment.");
    setError(undefined);
    setPhase("working");
    try {
      const img = await loadImage(url);
      const rgba = readRegion(adjustedSource(img, el.adjust), el, WORK_EDGE);
      const matter = await loadMatter();
      const pred = await matter(rgba.data, rgba.w, rgba.h);
      if (!alive.current) return;
      job.current = { rgba, pred };
      setPhase("ready");
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : "That photo couldn't be cut out.");
      setPhase("idle");
    }
  };

  const startOver = () => {
    job.current = null;
    setResult(null);
    setPhase("idle");
  };

  const apply = async () => {
    const j = job.current;
    const b = result?.bounds;
    if (!j || !result || !b) return;
    setError(undefined);
    setPhase("saving");
    try {
      const file = await pngFile(cropTo(result.image, b), "cutout.png");
      const media = await data.uploadImage(file);
      addMediaUrls(await data.getMediaUrls([media.id]));
      const at = placeCutout(el, j.rgba, { x: b.x - result.pad, y: b.y - result.pad, w: b.w, h: b.h });
      updateElement(el.id, {
        mediaId: media.id,
        name: `${layerName(el).replace(/ cut out$/, "")} cut out`.slice(0, 200),
        x: round2(at.x),
        y: round2(at.y),
        w: Math.max(5, round2(at.w)),
        h: Math.max(5, round2(at.h)),
        // The new picture already is the part that was showing, so these no longer apply.
        crop: undefined,
        mask: undefined,
        outline: undefined,
        adjust: undefined,
      });
      announce("Background removed. Undo brings the photo back.");
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : "The cut-out couldn't be saved.");
      setPhase("ready");
    }
  };

  const nothing = !!result && (!result.bounds || result.share < 0.01);
  const everything = !!result && result.share > 0.97;

  if (phase === "idle" || phase === "working") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">Removes the background so the object stands on its own. It works best when the object is clear against what is behind it.</p>
        <Button loading={phase === "working"} disabled={el.locked} onClick={() => void start()}>
          {phase === "working" ? "Finding the object" : "Remove background"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-muted" aria-live="polite">
          {phase === "working" ? "The first time, this loads the cut-out tool (about 20 MB), which can take a little while." : "It runs on your device. Your photo isn't sent anywhere."}
        </p>
        {el.locked ? <p className="text-xs text-muted">This layer is locked. Unlock it to edit it.</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <canvas ref={preview} role="img" aria-label="Preview of the photo with its background removed" className="w-full rounded-md border border-line" />
      {nothing ? <p role="alert" className="text-sm text-danger">We couldn&apos;t find an object in this photo. Try a photo where the subject stands out, or cut a little less.</p> : null}
      {everything ? <p className="text-sm text-muted">Nearly the whole photo was kept. Try cutting closer, or a photo where the subject stands out from the background.</p> : null}

      <Slider label="Cut closer" min={0} max={100} value={strength} onValueChange={setStrength} />
      <SwitchField label="Outline" checked={border} onCheckedChange={setBorder} />
      {border ? (
        <>
          <Slider label="Outline width" min={2} max={40} value={width} onValueChange={setWidth} />
          <ColourPicker label="Outline colour" value={colour} onValueChange={setColour} />
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button loading={phase === "saving"} disabled={nothing || !result?.bounds} onClick={() => void apply()}>
          Use this
        </Button>
        <Button variant="secondary" disabled={phase === "saving"} onClick={startOver}>
          Start over
        </Button>
      </div>
      <p className="text-xs text-muted">Undo brings the original photo back.</p>
    </div>
  );
}
