"use client";
import { useEffect, useRef } from "react";
import { Bold, Type as TypeIcon } from "lucide-react";
import { SLIDE_WIDTH } from "@/lib/formats";
import { newTextElement } from "@/lib/defaults";
import { FONT_GROUPS, hasBold, loadFont } from "@/lib/fonts";
import type { Element } from "@/lib/doc";
import { Button, ColourPicker, IconButton, SegmentedControl } from "@/ui";
import { FORMATS } from "@/lib/formats";
import { canvasRegistry } from "../registry";
import { useEditor } from "../store";

const MAX = 2000;

function Editor({ el }: { el: Element }) {
  const update = useEditor((s) => s.updateElement);
  const t = el.text!;
  const area = useRef<HTMLTextAreaElement>(null);
  const k = (p: string) => ({ key: `text:${el.id}:${p}` });
  const set = (patch: Partial<NonNullable<Element["text"]>>, prop: string) => update(el.id, { text: { ...t, ...patch } }, k(prop));
  const locked = el.locked;

  useEffect(() => {
    canvasRegistry.focusTextField = () => {
      area.current?.focus();
      area.current?.select();
    };
    return () => {
      canvasRegistry.focusTextField = () => {};
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="text-value" className="text-sm font-medium text-ink">
          Text
        </label>
        <textarea
          id="text-value"
          ref={area}
          value={t.value}
          rows={3}
          maxLength={MAX}
          disabled={locked}
          onChange={(e) => set({ value: e.target.value }, "value")}
          className="w-full resize-y rounded-md border border-field bg-page px-3 py-2 text-base text-ink disabled:bg-surface disabled:text-muted"
        />
        <p className="text-xs text-muted tabular-nums">
          {t.value.length} of {MAX}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="text-font" className="text-sm font-medium text-ink">
          Font
        </label>
        <select
          id="text-font"
          value={t.font}
          disabled={locked}
          onChange={(e) => {
            const font = e.target.value;
            void loadFont(font, t.bold);
            // a family with no bold can't stay bold
            set({ font, bold: t.bold && hasBold(font) }, "font");
          }}
          className="h-10 rounded-md border border-field bg-page px-2 text-base text-ink disabled:bg-surface disabled:text-muted pointer-coarse:h-11"
        >
          {FONT_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-ink">
          Size
          <input
            type="number"
            inputMode="numeric"
            min={6}
            max={1200}
            value={Math.round(t.size)}
            disabled={locked}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) set({ size: Math.min(1200, Math.max(6, n)) }, "size");
            }}
            className="h-10 rounded-md border border-field bg-page px-3 text-base text-ink tabular-nums disabled:bg-surface disabled:text-muted pointer-coarse:h-11"
          />
        </label>
        <IconButton
          label={hasBold(t.font) ? "Bold" : "Bold (this font has no bold)"}
          pressed={t.bold}
          disabled={locked || !hasBold(t.font)}
          onClick={() => {
            void loadFont(t.font, !t.bold);
            set({ bold: !t.bold }, "bold");
          }}
          className="size-10 border border-field"
        >
          <Bold aria-hidden className="size-5" />
        </IconButton>
      </div>

      <SegmentedControl
        label="Alignment"
        value={t.align}
        onValueChange={(align) => set({ align }, "align")}
        options={[
          { value: "left", label: "Left" },
          { value: "center", label: "Centre" },
          { value: "right", label: "Right" },
        ]}
      />

      <ColourPicker label="Text colour" value={t.color} onValueChange={(color) => set({ color }, "color")} />
      {locked ? <p className="text-xs text-muted">This layer is locked. Unlock it to edit it.</p> : null}
      <p className="text-xs text-muted">Drag the side handles to change where lines wrap. Drag a corner to change the size.</p>
    </div>
  );
}

export function TextPanel() {
  const elements = useEditor((s) => s.doc.elements);
  const selectedId = useEditor((s) => s.selectedId);
  const addElement = useEditor((s) => s.addElement);
  const format = useEditor((s) => s.format);
  const announce = useEditor((s) => s.announce);
  const selected = elements.find((e) => e.id === selectedId);

  const add = () => {
    const f = FORMATS[format];
    const slide = canvasRegistry.currentSlide();
    const el = newTextElement(slide * SLIDE_WIDTH + f.width / 2, f.height / 2, f.width);
    // stagger so a second text layer doesn't hide the first one
    const same = elements.filter((e) => Math.abs(e.x + e.w / 2 - (el.x + el.w / 2)) < 30 && Math.abs(e.y - el.y) < 30).length;
    el.x += Math.min(same, 8) * 56;
    el.y += Math.min(same, 8) * 56;
    void loadFont(el.text!.font, el.text!.bold);
    addElement(el);
    announce(`Added text to slide ${slide + 1}`);
    setTimeout(() => canvasRegistry.focusTextField(), 50);
  };

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" icon={<TypeIcon aria-hidden className="size-4" />} onClick={add}>
        Add text
      </Button>
      {selected?.type === "text" && selected.text ? (
        <Editor key={selected.id} el={selected} />
      ) : (
        <p className="text-sm text-muted">Select a text layer to change its words, font, size and colour. Double click text on the canvas to edit it.</p>
      )}
    </div>
  );
}
