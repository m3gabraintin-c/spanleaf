"use client";
import { ArrowLeft, ArrowRight, Copy, Plus, Trash2 } from "lucide-react";
import { MAX_SLIDES } from "@/lib/formats";
import { Button, IconButton } from "@/ui";
import { cn } from "@/ui/cn";
import { canvasRegistry } from "../registry";
import { useEditor } from "../store";

/** Add, copy, remove and reorder slides, and jump to one. The slide being edited is the one in the middle of the canvas. */
export function SlidesPanel() {
  const slideCount = useEditor((s) => s.slideCount);
  const addSlide = useEditor((s) => s.addSlide);
  const duplicateSlide = useEditor((s) => s.duplicateSlide);
  const deleteSlide = useEditor((s) => s.deleteSlide);
  const moveSlide = useEditor((s) => s.moveSlide);
  const announce = useEditor((s) => s.announce);
  // The slide in the middle of the canvas. Read when something is pressed, so it is always the one in view.
  const here = () => Math.min(slideCount - 1, canvasRegistry.currentSlide());
  const full = slideCount >= MAX_SLIDES;

  const go = (i: number) => {
    // The canvas has the new count only after this render, so wait a frame before scrolling.
    requestAnimationFrame(() => canvasRegistry.goToSlide(i));
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted" aria-live="polite">
        {slideCount} {slideCount === 1 ? "slide" : "slides"}. There is no limit on slides, up to {MAX_SLIDES} in one project.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={full}
          onClick={() => {
            const at = here() + 1;
            addSlide(at);
            announce(`Added slide ${at + 1}`);
            go(at);
          }}
        >
          <Plus aria-hidden className="mr-1 size-4" />
          Add slide
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={full}
          onClick={() => {
            const at = here();
            duplicateSlide(at);
            announce(`Copied slide ${at + 1}`);
            go(at + 1);
          }}
        >
          <Copy aria-hidden className="mr-1 size-4" />
          Copy slide
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={slideCount <= 1}
          onClick={() => {
            const at = here();
            deleteSlide(at);
            announce(`Deleted slide ${at + 1}. Undo brings it back.`);
            go(Math.min(at, slideCount - 2));
          }}
        >
          <Trash2 aria-hidden className="mr-1 size-4" />
          Delete slide
        </Button>
        <div className="flex items-center justify-end gap-1" role="group" aria-label="Move this slide">
          <IconButton
            label="Move slide earlier"
            disabled={slideCount <= 1}
            onClick={() => {
              const at = here();
              if (at <= 0) return;
              moveSlide(at, at - 1);
              announce(`Moved slide ${at + 1} earlier`);
              go(at - 1);
            }}
          >
            <ArrowLeft aria-hidden className="size-5" />
          </IconButton>
          <IconButton
            label="Move slide later"
            disabled={slideCount <= 1}
            onClick={() => {
              const at = here();
              if (at >= slideCount - 1) return;
              moveSlide(at, at + 1);
              announce(`Moved slide ${at + 1} later`);
              go(at + 1);
            }}
          >
            <ArrowRight aria-hidden className="size-5" />
          </IconButton>
        </div>
      </div>

      <ol aria-label="Slides" className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {Array.from({ length: slideCount }, (_, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => canvasRegistry.goToSlide(i)}
              className={cn("flex h-9 w-full items-center rounded-md px-3 text-left text-sm t-fast hover:bg-surface-hover", "text-ink")}
            >
              Slide {i + 1}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">Add, copy and delete work on the slide in the middle of the canvas. Undo brings back a deleted slide.</p>
    </div>
  );
}
