"use client";
import { SLIDE_WIDTH, FORMATS } from "@/lib/formats";
import { newStickerElement } from "@/lib/defaults";
import { DOODLE_IDS, STICKERS, TAPE_IDS, stickerDataUrl, parseSticker } from "@/lib/stickers";
import { ColourPicker } from "@/ui";
import { canvasRegistry } from "../registry";
import { useEditor } from "../store";

const LABEL_IDS = Object.keys(STICKERS).filter((id) => STICKERS[id].kind === "label");
const GROUPS = [
  { title: "Tape", ids: TAPE_IDS as readonly string[] },
  { title: "Doodles", ids: DOODLE_IDS as readonly string[] },
  { title: "Paper label", ids: LABEL_IDS },
];

/** Stickers are drawn in light colours that need something behind them to be seen. */
const PREVIEW_GROUND = "#8d8579";

export function StickersPanel() {
  const elements = useEditor((s) => s.doc.elements);
  const selectedId = useEditor((s) => s.selectedId);
  const addElement = useEditor((s) => s.addElement);
  const updateElement = useEditor((s) => s.updateElement);
  const format = useEditor((s) => s.format);
  const announce = useEditor((s) => s.announce);
  const selected = elements.find((e) => e.id === selectedId);
  const selectedSticker = selected?.type === "sticker" && parseSticker(selected.assetPath) ? selected : null;

  const add = (id: string) => {
    const f = FORMATS[format];
    const slide = canvasRegistry.currentSlide();
    const el = newStickerElement(id, slide * SLIDE_WIDTH + f.width / 2, f.height / 2, f.width);
    // stagger so a second sticker doesn't hide the first one
    const same = elements.filter((e) => Math.abs(e.x + e.w / 2 - (el.x + el.w / 2)) < 30 && Math.abs(e.y + e.h / 2 - (el.y + el.h / 2)) < 30).length;
    el.x += Math.min(same, 8) * 40;
    el.y += Math.min(same, 8) * 40;
    addElement(el);
    announce(`Added ${STICKERS[id].label.toLowerCase()} to slide ${slide + 1}`);
  };

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">{g.title}</h3>
          <ul className="grid grid-cols-3 gap-2">
            {g.ids.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  aria-label={`Add ${STICKERS[id].label.toLowerCase()}`}
                  onClick={() => add(id)}
                  style={{ background: PREVIEW_GROUND }}
                  className="grid aspect-square w-full place-items-center rounded-md border border-line p-2 t-fast hover:border-field"
                >
                  {/* A small drawing made in the app, not a photo, so next/image has nothing to optimise. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stickerDataUrl(id, STICKERS[id].defaultTint)} alt="" className="max-h-full max-w-full" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {selectedSticker ? (
        <ColourPicker
          key={selectedSticker.id}
          label="Sticker colour"
          value={selectedSticker.tint ?? STICKERS[parseSticker(selectedSticker.assetPath)!].defaultTint}
          onValueChange={(tint) => updateElement(selectedSticker.id, { tint }, { key: `tint:${selectedSticker.id}` })}
        />
      ) : (
        <p className="text-sm text-muted">Select a sticker on the canvas to change its colour. Drag its corners to resize and turn it.</p>
      )}
    </div>
  );
}
