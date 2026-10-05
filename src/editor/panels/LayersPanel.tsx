"use client";
import { useMemo, type ChangeEvent } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Copy, Frame, GripVertical, Image as ImageIcon, Lock, LockOpen, Pencil, Sticker, Trash2, Type, Video } from "lucide-react";
import { layerName, type Element } from "@/lib/doc";
import { FORMATS } from "@/lib/formats";
import { Button, EmptyState, IconButton } from "@/ui";
import { cn } from "@/ui/cn";
import { useEditor } from "../store";

const ICONS = { image: ImageIcon, video: Video, text: Type, sticker: Sticker, frame: Frame, drawing: Pencil };

function Row({ el, selected, position, total }: { el: Element; selected: boolean; position: number; total: number }) {
  const select = useEditor((s) => s.select);
  const toggleLock = useEditor((s) => s.toggleLock);
  const moveLayer = useEditor((s) => s.moveLayer);
  const announce = useEditor((s) => s.announce);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el.id });
  const Icon = ICONS[el.type];
  const name = layerName(el);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-layer-id={el.id}
      className={cn(
        "flex h-10 items-center gap-1 rounded-md px-1 t-fast pointer-coarse:h-11",
        selected ? "bg-accent-soft" : "hover:bg-surface-hover",
        isDragging && "relative z-10 bg-page shadow-pop",
      )}
    >
      <button
        type="button"
        ref={undefined}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${name}`}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-sm text-muted active:cursor-grabbing pointer-coarse:size-11"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        onClick={() => select(el.id)}
        onKeyDown={(e) => {
          if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
          e.preventDefault();
          if (el.locked) return announce(`${name} is locked.`);
          moveLayer(el.id, e.key === "ArrowUp" ? "forward" : "backward");
          announce(`${name} moved ${e.key === "ArrowUp" ? "up" : "down"}`);
        }}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
      >
        <Icon aria-hidden className="size-4 shrink-0 text-muted" />
        <span className={cn("min-w-0 flex-1 truncate text-sm", el.locked ? "text-muted" : "text-ink")}>{name}</span>
        <span className="sr-only">{`Layer ${position} of ${total}`}</span>
      </button>
      <IconButton label={el.locked ? `Unlock ${name}` : `Lock ${name}`} pressed={el.locked} onClick={() => toggleLock(el.id)} className="size-8">
        {el.locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
      </IconButton>
    </li>
  );
}

function Num({ label, value, onChange, step = 1, min, max, disabled, readOnly }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; disabled?: boolean; readOnly?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink">
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-9 w-full rounded-md border border-field bg-page px-2 text-sm text-ink tabular-nums read-only:bg-surface read-only:text-muted disabled:bg-surface disabled:text-muted pointer-coarse:h-11"
      />
    </label>
  );
}

/** Position, size and order of the selected layer as numbers and buttons, for anyone who can't or won't drag. */
function Properties({ el }: { el: Element }) {
  const update = useEditor((s) => s.updateElement);
  const moveLayer = useEditor((s) => s.moveLayer);
  const duplicate = useEditor((s) => s.duplicateElement);
  const remove = useEditor((s) => s.removeElement);
  const format = useEditor((s) => s.format);
  const slideCount = useEditor((s) => s.slideCount);
  const announce = useEditor((s) => s.announce);
  const art = { w: FORMATS[format].width * slideCount, h: FORMATS[format].height };
  const key = (p: string) => ({ key: `field:${el.id}:${p}` });
  const name = layerName(el);
  const text = el.type === "text";
  const locked = el.locked;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="text-sm font-semibold text-ink">Position and size</h3>
      <div className="grid grid-cols-2 gap-2">
        <Num label="X" value={el.x} disabled={locked} onChange={(n) => update(el.id, { x: Math.min(art.w - 40, Math.max(40 - el.w, n)) }, key("x"))} />
        <Num label="Y" value={el.y} disabled={locked} onChange={(n) => update(el.id, { y: Math.min(art.h - 40, Math.max(40 - el.h, n)) }, key("y"))} />
        <Num
          label="Width"
          value={el.w}
          min={5}
          disabled={locked}
          onChange={(n) => {
            const w = Math.max(5, n);
            // photos keep their shape. Text only changes where its lines wrap
            update(el.id, text ? { w } : { w, h: Math.max(5, (el.h * w) / el.w) }, key("w"));
          }}
        />
        <Num label="Height" value={el.h} min={5} disabled={locked || text} readOnly={text} onChange={(n) => update(el.id, { h: Math.max(5, n), w: Math.max(5, (el.w * n) / el.h) }, key("h"))} />
        <Num label="Rotation" value={el.rotation} step={1} min={-360} max={360} disabled={locked} onChange={(n) => update(el.id, { rotation: Math.min(360, Math.max(-360, n)) }, key("r"))} />
      </div>

      <h3 className="text-sm font-semibold text-ink">Order</h3>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["Bring forward", "Forward", "forward", ArrowUp],
            ["Send backward", "Backward", "backward", ArrowDown],
            ["Bring to front", "To front", "front", ArrowUpToLine],
            ["Send to back", "To back", "back", ArrowDownToLine],
          ] as const
        ).map(([label, short, how, Icon]) => (
          <Button
            key={how}
            variant="secondary"
            size="sm"
            aria-label={label}
            disabled={locked}
            icon={<Icon aria-hidden className="size-4" />}
            onClick={() => {
              moveLayer(el.id, how);
              announce(`${name} moved ${label.toLowerCase().replace("bring ", "").replace("send ", "")}`);
            }}
          >
            {short}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" icon={<Copy aria-hidden className="size-4" />} onClick={() => duplicate(el.id, 48, art)}>
          Duplicate
        </Button>
        <Button variant="secondary" size="sm" disabled={locked} icon={<Trash2 aria-hidden className="size-4" />} onClick={() => remove(el.id)}>
          Delete
        </Button>
      </div>
      {locked ? <p className="text-xs text-muted">This layer is locked. Unlock it to change it.</p> : null}
    </div>
  );
}

export function LayersPanel() {
  const elements = useEditor((s) => s.doc.elements);
  const selectedId = useEditor((s) => s.selectedId);
  const reorder = useEditor((s) => s.reorderLayer);
  // Front layer first, like every design tool
  const list = useMemo(() => [...elements].reverse(), [elements]);
  const selected = elements.find((e) => e.id === selectedId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = list.findIndex((x) => x.id === active.id);
    const to = list.findIndex((x) => x.id === over.id);
    const moved = arrayMove(list, from, to);
    // the list is front first, the document is back first
    reorder(String(active.id), elements.length - 1 - moved.findIndex((x) => x.id === active.id));
  };

  const nameOf = (id: string | number) => {
    const el = elements.find((e) => e.id === id);
    return el ? layerName(el) : "layer";
  };

  if (elements.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon aria-hidden className="size-6" />}
        title="No layers yet"
        body="Photos and text you add will show up here, front first."
        as="h3"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable: "To reorder, press Space on the reorder button, then the up or down arrow, then Space again to drop. Press Escape to cancel.",
          },
          announcements: {
            onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
            onDragOver: ({ active, over }) => (over && over.id !== active.id ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : undefined),
            onDragEnd: ({ active, over }) => (over ? `Dropped ${nameOf(active.id)} on ${nameOf(over.id)}.` : `Dropped ${nameOf(active.id)}.`),
            onDragCancel: ({ active }) => `Reordering ${nameOf(active.id)} was cancelled.`,
          },
        }}
      >
        <SortableContext items={list.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <ul aria-label="Layers, front first" className="flex flex-col gap-1 rounded-md border border-line p-1">
            {list.map((el, i) => (
              <Row key={el.id} el={el} selected={el.id === selectedId} position={i + 1} total={list.length} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="text-xs text-muted">Drag the handle, or focus it and press Space, then the arrow keys. Alt plus the arrow keys on a layer also moves it.</p>
      {selected ? <Properties el={selected} /> : <p className="text-sm text-muted">Select a layer to change its position, size and order.</p>}
    </div>
  );
}
