import { Button } from "./Button";
import { Slider } from "./Slider";
import { Switch } from "./Switch";
import { Input } from "./Input";
import { Layer, MASK_SHAPES, SLIDE_WIDTH, ShapeKind, rotatedBy, trimWindow } from "../helpers/carouselModel";
import { ADJUST_PRESETS, MAX_ZOOM, fullAdjust, isAdjusted, polaroidBox } from "../helpers/photoStyle";
import { PEN_COLOURS, PenMode } from "../helpers/strokes";
import { STICKERS, STICKER_COLOURS, STRETCHY, stickerSrc } from "../helpers/stickerArt";
import { THEMES } from "../helpers/themes";
import { MySticker } from "../helpers/myStickers";
import { patternTile } from "../helpers/patterns";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, ImagePlus, Minus, RectangleHorizontal, Scissors, X } from "lucide-react";
import styles from "./EditorPanels.module.css";

type Patch = (patch: Partial<Layer>, key?: string) => void;

/** Crop, frame and adjust, for the selected photo. */
export const PhotoStylePanel = ({
  layer,
  onPatch,
  onFlip,
  onReplace,
}: {
  layer: Layer;
  onPatch: Patch;
  onFlip: (axis: "horizontal" | "vertical") => void;
  /** Choose another picture for this layer, keeping its frame, shape, tilt and look. */
  onReplace: () => void;
}) => {
  const crop = layer.crop ?? { zoom: 1, x: 0.5, y: 0.5 };
  const adj = fullAdjust(layer.adjust);
  const off = layer.locked;
  const setAdj = (a: typeof adj, key?: string) => onPatch({ adjust: isAdjusted(a) ? a : null }, key);
  // Turning the instant-photo card on or off keeps the photo itself the same shape.
  const setPolaroid = (on: boolean) => {
    const pb = polaroidBox(layer.w, layer.h);
    if (on) onPatch({ polaroid: { caption: "" }, mask: undefined, h: Math.round(pb.pad + (layer.h * pb.photo.w) / layer.w + Math.min(layer.w * 0.24, layer.h * 0.4)) });
    else onPatch({ polaroid: null, h: Math.max(24, Math.round((pb.photo.h * layer.w) / pb.photo.w)) });
  };
  return (
    <div className={styles.stack}>
      <Button variant="outline" size="sm" disabled={off} onClick={onReplace}>
        <ImagePlus size={14} /> Replace photo
      </Button>
      <p className={styles.hint}>Swaps the picture and keeps the frame, shape, tilt, look and position.</p>
      <h3 className={styles.head}>Crop</h3>
      <div className={styles.field}>
        <span id="zoom-l">Zoom {crop.zoom.toFixed(2)}x</span>
        <Slider aria-labelledby="zoom-l" min={1} max={MAX_ZOOM} step={0.05} value={[crop.zoom]} disabled={off} onValueChange={([v]) => onPatch({ crop: { ...crop, zoom: v } }, "crop")} />
      </div>
      <div className={styles.field}>
        <span id="cx-l">Left to right</span>
        <Slider aria-labelledby="cx-l" min={0} max={100} value={[Math.round(crop.x * 100)]} disabled={off} onValueChange={([v]) => onPatch({ crop: { ...crop, x: v / 100 } }, "crop")} />
      </div>
      <div className={styles.field}>
        <span id="cy-l">Top to bottom</span>
        <Slider aria-labelledby="cy-l" min={0} max={100} value={[Math.round(crop.y * 100)]} disabled={off} onValueChange={([v]) => onPatch({ crop: { ...crop, y: v / 100 } }, "crop")} />
      </div>
      <Button variant="outline" size="sm" disabled={off} onClick={() => onPatch({ crop: undefined })}>
        Fill the frame
      </Button>
      <h3 className={styles.head}>Shape</h3>
      <div className={styles.chips} role="group" aria-label="Photo shape">
        {MASK_SHAPES.map((m) => (
          <Button key={m} size="sm" variant={(layer.mask ?? "none") === m && !layer.polaroid ? "primary" : "outline"} disabled={off} onClick={() => (layer.polaroid ? setPolaroid(false) : undefined, onPatch({ mask: m === "none" ? undefined : m }))}>
            {{ none: "Rectangle", circle: "Circle", heart: "Heart", arch: "Arch", star: "Star", torn: "Torn paper" }[m]}
          </Button>
        ))}
      </div>
      <div className={styles.chips} role="group" aria-label="Flip">
        <Button variant="outline" size="sm" disabled={off} onClick={() => onFlip("horizontal")}>
          Flip left to right
        </Button>
        <Button variant="outline" size="sm" disabled={off} onClick={() => onFlip("vertical")}>
          Flip top to bottom
        </Button>
      </div>

      <h3 className={styles.head}>Frame</h3>
      <div className={styles.row}>
        <span id="pol-l">Instant photo card</span>
        <Switch aria-labelledby="pol-l" checked={!!layer.polaroid} disabled={off} onCheckedChange={setPolaroid} />
      </div>
      {layer.polaroid && (
        <label className={styles.field}>
          <span>Caption, written on the card</span>
          <Input value={layer.polaroid.caption} maxLength={60} placeholder="Summer '26" disabled={off} onChange={(e) => onPatch({ polaroid: { caption: e.target.value } }, "polaroid")} />
        </label>
      )}
      <div className={styles.field}>
        <span id="rad-l">Rounded corners {layer.radius ?? 0}</span>
        <Slider aria-labelledby="rad-l" min={0} max={200} value={[layer.radius ?? 0]} disabled={off} onValueChange={([v]) => onPatch({ radius: v }, "radius")} />
      </div>
      <div className={styles.row}>
        <span id="bd-l">Border</span>
        <Switch aria-labelledby="bd-l" checked={!!layer.border} disabled={off} onCheckedChange={(on) => onPatch({ border: on ? { color: "#ffffff", width: 12 } : null })} />
      </div>
      {layer.border && (
        <>
          <div className={styles.field}>
            <span id="bw-l">Border width {layer.border.width}</span>
            <Slider aria-labelledby="bw-l" min={1} max={60} value={[layer.border.width]} disabled={off} onValueChange={([v]) => onPatch({ border: { ...layer.border!, width: v } }, "border")} />
          </div>
          <label className={styles.row}>
            <span>Border colour</span>
            <Input type="color" className={styles.colour} value={layer.border.color} disabled={off} onChange={(e) => onPatch({ border: { ...layer.border!, color: e.target.value } }, "bordercolour")} />
          </label>
        </>
      )}
      <div className={styles.row}>
        <span id="sh-l">Shadow</span>
        <Switch aria-labelledby="sh-l" checked={!!layer.shadow} disabled={off} onCheckedChange={(on) => onPatch({ shadow: on })} />
      </div>
      <div className={styles.field}>
        <span id="op-l">Opacity {Math.round((layer.opacity ?? 1) * 100)}%</span>
        <Slider aria-labelledby="op-l" min={10} max={100} value={[Math.round((layer.opacity ?? 1) * 100)]} disabled={off} onValueChange={([v]) => onPatch({ opacity: v === 100 ? undefined : v / 100 }, "opacity")} />
      </div>

      <h3 className={styles.head}>Adjust</h3>
      <div className={styles.chips} role="group" aria-label="Looks">
        {ADJUST_PRESETS.map((p) => (
          <Button key={p.id} size="sm" variant={JSON.stringify(adj) === JSON.stringify(p.adjust) ? "primary" : "outline"} aria-pressed={JSON.stringify(adj) === JSON.stringify(p.adjust)} disabled={off} onClick={() => setAdj(p.adjust)}>
            {p.name}
          </Button>
        ))}
      </div>
      {(
        [
          ["brightness", "Brightness", -100],
          ["contrast", "Contrast", -100],
          ["saturation", "Saturation", -100],
          ["warmth", "Warmth (blue to orange)", -100],
          ["tint", "Tint (green to magenta)", -100],
          ["vignette", "Vignette", 0],
          ["grain", "Grain", 0],
        ] as const
      ).map(([k, label, min]) => (
        <div className={styles.field} key={k}>
          <span id={`adj-${k}`}>
            {label} {adj[k]}
          </span>
          <Slider aria-labelledby={`adj-${k}`} min={min} max={100} value={[adj[k]]} disabled={off} onValueChange={([v]) => setAdj({ ...adj, [k]: v }, `adj-${k}`)} />
        </div>
      ))}
    </div>
  );
};

/** Trim for the selected video: which part of the clip plays in the editor, the preview and the video export. */
export const VideoPanel = ({ layer, onPatch }: { layer: Layer; onPatch: Patch }) => {
  const d = layer.duration ?? 0;
  const t = trimWindow(layer);
  const off = layer.locked;
  const s = (n: number) => `${n.toFixed(1)}s`;
  if (!d) return <p className={styles.hint}>This clip's length isn't known, so it can't be trimmed. Add it again to trim it.</p>;
  return (
    <div className={styles.stack}>
      <h3 className={styles.head}>Trim</h3>
      <p className={styles.hint}>
        Plays {s(t.start)} to {s(t.end)} of {s(d)}, so {s(t.length)} long. The editor, the phone preview and the video export all use this part, and it loops.
      </p>
      <div className={styles.field}>
        <span id="trim-start">Start {s(t.start)}</span>
        <Slider aria-labelledby="trim-start" min={0} max={d} step={0.1} value={[t.start]} disabled={off} onValueChange={([v]) => onPatch({ trimStart: Math.min(v, t.end - 0.5) }, "trim")} />
      </div>
      <div className={styles.field}>
        <span id="trim-end">End {s(t.end)}</span>
        <Slider aria-labelledby="trim-end" min={0} max={d} step={0.1} value={[t.end]} disabled={off} onValueChange={([v]) => onPatch({ trimEnd: Math.max(v, t.start + 0.5) }, "trim")} />
      </div>
      <Button variant="outline" size="sm" disabled={off || (t.start === 0 && t.end === d)} onClick={() => onPatch({ trimStart: undefined, trimEnd: undefined })}>
        Use the whole clip
      </Button>
    </div>
  );
};

/** Pen, highlighter and eraser. */
export const DrawPanel = ({
  pen,
  onPen,
  drawingCount,
  onClear,
}: {
  pen: { mode: PenMode; color: string; size: number };
  onPen: (p: Partial<{ mode: PenMode; color: string; size: number }>) => void;
  drawingCount: number;
  onClear: () => void;
}) => (
  <div className={styles.stack}>
    <p className={styles.hint}>{pen.mode === "eraser" ? "Drag over a drawing to rub it out." : "Draw on the slides with a finger, a pen or a mouse. While this tab is open, photos can't be moved."}</p>
    <div className={styles.chips} role="group" aria-label="Tool">
      {(["pen", "highlighter", "eraser"] as const).map((m) => (
        <Button key={m} size="sm" variant={pen.mode === m ? "primary" : "outline"} onClick={() => onPen({ mode: m })}>
          {m[0].toUpperCase() + m.slice(1)}
        </Button>
      ))}
    </div>
    {pen.mode !== "eraser" && (
      <div className={styles.swatches} role="group" aria-label="Colours">
        {PEN_COLOURS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={pen.color === c} className={styles.swatch} style={{ background: c }} onClick={() => onPen({ color: c })} />
        ))}
        <Input type="color" className={styles.colour} aria-label="Other colour" value={pen.color} onChange={(e) => onPen({ color: e.target.value })} />
      </div>
    )}
    <div className={styles.field}>
      <span id="pen-size">{pen.mode === "eraser" ? "Eraser size" : "Size"} {pen.size}</span>
      <Slider aria-labelledby="pen-size" min={2} max={80} value={[pen.size]} onValueChange={([v]) => onPen({ size: v })} />
    </div>
    <Button variant="outline" size="sm" disabled={drawingCount === 0} onClick={onClear}>
      Clear all drawings ({drawingCount})
    </Button>
  </div>
);

/** Built-in stickers, in any colour. */
export const StickerPanel = ({
  selected,
  onAdd,
  onRecolour,
  onPatch,
  onAddShape,
  mine,
  onMake,
  onAddMine,
  onDeleteMine,
}: {
  selected: Layer | null;
  onAdd: (id: string, colour: string) => void;
  onRecolour: (colour: string) => void;
  /** Changes the selected sticker or shape. */
  onPatch: Patch;
  onAddShape: (kind: ShapeKind) => void;
  mine: MySticker[];
  /** A picture chosen to make a sticker from, as an address. */
  onMake: (src: string) => void;
  onAddMine: (s: MySticker) => void;
  onDeleteMine: (id: string) => void;
}) => {
  const custom = selected?.type === "sticker" && selected.sticker === "custom";
  const colour = selected?.type === "sticker" && !custom ? (selected.color ?? "#f6d94a") : "#f6d94a";
  const file = useRef<HTMLInputElement>(null);
  const edgeable = selected?.type === "sticker" && selected.sticker !== "tape";
  const shape = selected?.type === "shape" ? selected : null;
  return (
    <div className={styles.stack}>
      {edgeable && (
        <>
          <h3 className={styles.head}>Sticker edge</h3>
          <div className={styles.row}>
            <span id="edge-l">Die-cut edge</span>
            <Switch aria-labelledby="edge-l" checked={!!selected.edge} disabled={selected.locked} onCheckedChange={(on) => onPatch({ edge: on ? { color: "#ffffff", width: 10 } : null })} />
          </div>
          {selected.edge && (
            <>
              <div className={styles.field}>
                <span id="edgew-l">Edge width {selected.edge.width}</span>
                <Slider aria-labelledby="edgew-l" min={2} max={40} value={[selected.edge.width]} disabled={selected.locked} onValueChange={([v]) => onPatch({ edge: { ...selected.edge!, width: v } }, "edge")} />
              </div>
              <label className={styles.row}>
                <span>Edge colour</span>
                <Input type="color" className={styles.colour} value={selected.edge.color} disabled={selected.locked} onChange={(e) => onPatch({ edge: { ...selected.edge!, color: e.target.value } }, "edgecolour")} />
              </label>
            </>
          )}
          <div className={styles.row}>
            <span id="ssh-l">Shadow</span>
            <Switch aria-labelledby="ssh-l" checked={!!selected.shadow} disabled={selected.locked} onCheckedChange={(on) => onPatch({ shadow: on })} />
          </div>
        </>
      )}
      {shape && (
        <>
          <h3 className={styles.head}>{shape.shape === "ellipse" ? "Circle" : shape.shape === "line" ? "Line" : "Rectangle"}</h3>
          <label className={styles.row}>
            <span>Fill</span>
            <Input type="color" className={styles.colour} value={shape.color ?? "#1f6f54"} disabled={shape.locked} onChange={(e) => onPatch({ color: e.target.value }, "fill")} />
          </label>
          {shape.shape === "rect" && (
            <div className={styles.field}>
              <span id="srad-l">Rounded corners {shape.radius ?? 0}</span>
              <Slider aria-labelledby="srad-l" min={0} max={400} value={[shape.radius ?? 0]} disabled={shape.locked} onValueChange={([v]) => onPatch({ radius: v }, "radius")} />
            </div>
          )}
          <div className={styles.row}>
            <span id="sbd-l">Border</span>
            <Switch aria-labelledby="sbd-l" checked={!!shape.border} disabled={shape.locked} onCheckedChange={(on) => onPatch({ border: on ? { color: "#1d211e", width: 8 } : null })} />
          </div>
          {shape.border && (
            <>
              <div className={styles.field}>
                <span id="sbw-l">Border width {shape.border.width}</span>
                <Slider aria-labelledby="sbw-l" min={1} max={60} value={[shape.border.width]} disabled={shape.locked} onValueChange={([v]) => onPatch({ border: { ...shape.border!, width: v } }, "border")} />
              </div>
              <label className={styles.row}>
                <span>Border colour</span>
                <Input type="color" className={styles.colour} value={shape.border.color} disabled={shape.locked} onChange={(e) => onPatch({ border: { ...shape.border!, color: e.target.value } }, "bordercolour")} />
              </label>
            </>
          )}
          <div className={styles.field}>
            <span id="sop-l">Opacity {Math.round((shape.opacity ?? 1) * 100)}%</span>
            <Slider aria-labelledby="sop-l" min={10} max={100} value={[Math.round((shape.opacity ?? 1) * 100)]} disabled={shape.locked} onValueChange={([v]) => onPatch({ opacity: v === 100 ? undefined : v / 100 }, "opacity")} />
          </div>
        </>
      )}
      <h3 className={styles.head}>Make your own</h3>
      <p className={styles.hint}>Pick a picture and the background is taken away, leaving the main subject as a sticker. It runs on this device.</p>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label="Choose a picture for a sticker"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" && onMake(reader.result);
          reader.readAsDataURL(f);
        }}
      />
      <div className={styles.chips}>
        <Button size="sm" onClick={() => file.current?.click()}>
          <Scissors size={14} /> From a picture
        </Button>
        {selected?.type === "image" && selected.src && (
          <Button size="sm" variant="outline" onClick={() => onMake(selected.src!)}>
            <Scissors size={14} /> From the selected photo
          </Button>
        )}
      </div>
      {mine.length > 0 && (
        <>
          <h3 className={styles.head}>My stickers ({mine.length})</h3>
          <div className={styles.stickerGrid}>
            {mine.map((s) => (
              <div key={s.id} className={styles.mineCell}>
                <button type="button" className={styles.stickerButton} aria-label="Add my sticker" onClick={() => onAddMine(s)}>
                  <img src={s.src} alt="" className={styles.mineImg} />
                </button>
                <button type="button" className={styles.mineDelete} aria-label="Delete this sticker" onClick={() => onDeleteMine(s.id)}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <h3 className={styles.head}>Basic shapes</h3>
      <div className={styles.chips}>
        <Button size="sm" variant="outline" onClick={() => onAddShape("rect")}>
          <RectangleHorizontal size={14} /> Rectangle
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAddShape("ellipse")}>
          <Circle size={14} /> Circle
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAddShape("line")}>
          <Minus size={14} /> Line
        </Button>
      </div>
      <p className={styles.hint}>Shapes stretch to any size from their side handles. Put one behind text for a label or a banner.</p>
      <h3 className={styles.head}>Stickers</h3>
      <p className={styles.hint}>Click a sticker to add it to the slide in view. Select one on the canvas to change its colour. Tape, brush strokes and underlines stretch to any length: drag a side handle.</p>
      <div className={styles.stickerGrid}>
        {STICKERS.map((s) => (
          <button key={s.id} type="button" className={styles.stickerButton} aria-label={`Add ${s.name}`} onClick={() => onAdd(s.id, colour)}>
            <img src={stickerSrc(s.id, colour)} alt="" width={56} height={56} />
          </button>
        ))}
      </div>
      <div className={styles.swatches} role="group" aria-label="Sticker colour">
        {STICKER_COLOURS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={colour === c} disabled={custom} className={styles.swatch} style={{ background: c }} onClick={() => selected?.type === "sticker" && !custom && onRecolour(c)} />
        ))}
      </div>
    </div>
  );
};

/** Exact place, size and angle for one layer, in pixels from its slide's top-left corner. */
export const ExactBox = ({ layer, slide, onCommit }: { layer: Layer; slide: number; onCommit: (patch: Partial<Layer>) => void }) => {
  const values = { x: Math.round(layer.x - slide * SLIDE_WIDTH), y: Math.round(layer.y), w: Math.round(layer.w), h: Math.round(layer.h), r: Math.round(layer.rotation * 10) / 10 };
  const [draft, setDraft] = useState<Partial<Record<keyof typeof values, string>>>({});
  const free = layer.type === "text" || layer.type === "shape" || layer.type === "drawing" || (layer.type === "sticker" && STRETCHY.includes(layer.sticker ?? ""));
  const [keep, setKeep] = useState(!free);
  useEffect(() => setDraft({}), [layer.id, layer.x, layer.y, layer.w, layer.h, layer.rotation]);
  useEffect(() => setKeep(!free), [layer.id, free]);
  const commit = (k: keyof typeof values) => {
    const raw = draft[k];
    if (raw === undefined) return;
    setDraft((d) => ({ ...d, [k]: undefined }));
    const n = Number(raw);
    if (!Number.isFinite(n) || n === values[k]) return;
    if (k === "x") onCommit({ x: n + slide * SLIDE_WIDTH });
    if (k === "y") onCommit({ y: n });
    if (k === "w") {
      const w = Math.max(8, Math.min(20000, n));
      onCommit(keep && layer.type !== "text" ? { w, h: Math.max(4, Math.round((layer.h * w) / layer.w)) } : { w });
    }
    if (k === "h") {
      const h = Math.max(4, Math.min(20000, n));
      onCommit(keep ? { h, w: Math.max(8, Math.round((layer.w * h) / layer.h)) } : { h });
    }
    if (k === "r") onCommit(rotatedBy(layer, n - layer.rotation));
  };
  const field = (k: keyof typeof values, label: string, disabled = false) => (
    <label className={styles.field} key={k}>
      <span>{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        value={draft[k] ?? String(values[k])}
        disabled={disabled || layer.locked}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
        onBlur={() => commit(k)}
        onKeyDown={(e) => e.key === "Enter" && commit(k)}
      />
    </label>
  );
  return (
    <div className={styles.stack}>
      <div className={styles.exactGrid}>
        {field("x", "Left")}
        {field("y", "Top")}
        {field("w", "Width")}
        {field("h", layer.type === "text" ? "Height (from the words)" : "Height", layer.type === "text")}
        {field("r", "Angle °")}
      </div>
      {layer.type !== "text" && (
        <div className={styles.row}>
          <span id="keep-l">Keep its shape when resizing</span>
          <Switch aria-labelledby="keep-l" checked={keep} onCheckedChange={setKeep} />
        </div>
      )}
      <p className={styles.hint}>Pixels from the top-left corner of slide {slide + 1}. Each slide is 1080 wide.</p>
    </div>
  );
};

/** Small pictures of the slides. Click one to go to it; drag one onto another to move it there. */
export const SlideStrip = ({
  count,
  current,
  thumbs,
  aspect,
  onGo,
  onMove,
}: {
  count: number;
  current: number;
  thumbs: Record<number, string>;
  aspect: number;
  onGo: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) => {
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <ol className={styles.strip} aria-label="Slides">
      {Array.from({ length: Math.min(count, 200) }, (_, i) => (
        <li
          key={i}
          draggable
          className={over === i && from !== null && from !== i ? styles.stripOver : undefined}
          onDragStart={(e) => {
            setFrom(i);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(i));
          }}
          onDragOver={(e) => {
            if (from === null) return;
            e.preventDefault();
            setOver(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (from !== null && from !== i) onMove(from, i);
            setFrom(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setFrom(null);
            setOver(null);
          }}
        >
          <button type="button" className={styles.thumb} aria-current={i === current ? "true" : undefined} aria-label={`Slide ${i + 1}`} style={{ aspectRatio: String(aspect) }} onClick={() => onGo(i)}>
            {thumbs[i] && <img src={thumbs[i]} alt="" draggable={false} />}
            <span className={styles.thumbNo}>{i + 1}</span>
          </button>
        </li>
      ))}
    </ol>
  );
};

/** Whole-carousel looks, and arranging the photos. */
export const ThemePanel = ({ photoCount, onTheme, onArrange }: { photoCount: number; onTheme: (id: string) => void; onArrange: () => void }) => (
  <div className={styles.stack}>
    <p className={styles.hint}>
      A theme sets the background, pattern and colours, gives every photo its frame, corners, shadow, tilt and tone, styles your text, and scatters a few matching decorations. Your own stickers are kept, and undo takes it
      back.
    </p>
    <ul className={styles.themeList}>
      {THEMES.map((t) => (
        <li key={t.id}>
          <ThemeCard theme={t} onPick={() => onTheme(t.id)} />
        </li>
      ))}
    </ul>
    <Button variant="outline" disabled={photoCount === 0} onClick={onArrange}>
      Arrange my {photoCount} {photoCount === 1 ? "photo" : "photos"} across the slides
    </Button>
    <p className={styles.hint}>Arranging places photos in the order you added them: one large, two stacked, then one that runs across a slide edge. It adds slides if it needs them.</p>
  </div>
);

/** A small picture of a theme: its background and pattern, two framed photo shapes, and its decorations. */
const ThemeCard = ({ theme: t, onPick }: { theme: (typeof THEMES)[number]; onPick: () => void }) => {
  const pattern = useMemo(() => (t.pattern ? `url(${patternTile({ ...t.pattern, opacity: Math.min(1, t.pattern.opacity * 1.4) }).toDataURL()})` : "none"), [t.pattern]);
  const ground = t.gradient ? `linear-gradient(${t.gradient.angle}deg, ${t.gradient.from}, ${t.gradient.to})` : t.background;
  const frame = {
    border: t.border ? `${Math.max(2, Math.round(t.border.width / 5))}px solid ${t.border.color}` : "none",
    borderRadius: Math.round(t.radius / 6),
    boxShadow: t.shadow ? "0 2px 5px rgba(0,0,0,0.25)" : "none",
  };
  return (
    <button type="button" className={styles.themeButton} onClick={onPick}>
      <span className={styles.themePreview} style={{ background: `${pattern}, ${ground}`, backgroundSize: "18px 18px, auto" }} aria-hidden>
        <span className={styles.themePhotoA} style={{ ...frame, transform: `rotate(${-t.tilt}deg)` }} />
        <span className={styles.themePhotoB} style={{ ...frame, transform: `rotate(${t.tilt}deg)` }} />
        {t.decor.slice(0, 2).map((d, i) => (
          <img key={d.sticker} src={stickerSrc(d.sticker, d.colour)} alt="" className={i === 0 ? styles.themeDecorA : styles.themeDecorB} />
        ))}
      </span>
      <span className={styles.themeText}>
        <strong style={{ fontFamily: t.fontFamily }}>{t.name}</strong>
        <small>{t.blurb}</small>
      </span>
    </button>
  );
};
