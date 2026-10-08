import { Button } from "./Button";
import { Slider } from "./Slider";
import { Switch } from "./Switch";
import { Input } from "./Input";
import { Layer, MASK_SHAPES } from "../helpers/carouselModel";
import { ADJUST_PRESETS, MAX_ZOOM, NO_ADJUST, isAdjusted } from "../helpers/photoStyle";
import { PEN_COLOURS, PenMode } from "../helpers/strokes";
import { STICKERS, STICKER_COLOURS, stickerSrc } from "../helpers/stickerArt";
import { THEMES } from "../helpers/themes";
import { MySticker } from "../helpers/myStickers";
import { patternTile } from "../helpers/patterns";
import { useMemo, useRef } from "react";
import { Scissors, X } from "lucide-react";
import styles from "./EditorPanels.module.css";

type Patch = (patch: Partial<Layer>, key?: string) => void;

/** Crop, frame and adjust, for the selected photo. */
export const PhotoStylePanel = ({ layer, onPatch, onFlip }: { layer: Layer; onPatch: Patch; onFlip: (axis: "horizontal" | "vertical") => void }) => {
  const crop = layer.crop ?? { zoom: 1, x: 0.5, y: 0.5 };
  const adj = layer.adjust ?? NO_ADJUST;
  const off = layer.locked;
  const setAdj = (a: typeof adj, key?: string) => onPatch({ adjust: isAdjusted(a) ? a : null }, key);
  return (
    <div className={styles.stack}>
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
          <Button key={m} size="sm" variant={(layer.mask ?? "none") === m ? "primary" : "outline"} disabled={off} onClick={() => onPatch({ mask: m === "none" ? undefined : m })}>
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
          <Button key={p.id} size="sm" variant={JSON.stringify(adj) === JSON.stringify(p.adjust) ? "primary" : "outline"} disabled={off} onClick={() => setAdj(p.adjust)}>
            {p.name}
          </Button>
        ))}
      </div>
      {(["brightness", "contrast", "saturation"] as const).map((k) => (
        <div className={styles.field} key={k}>
          <span id={`adj-${k}`}>
            {k[0].toUpperCase() + k.slice(1)} {adj[k]}
          </span>
          <Slider aria-labelledby={`adj-${k}`} min={-100} max={100} value={[adj[k]]} disabled={off} onValueChange={([v]) => setAdj({ ...adj, [k]: v }, `adj-${k}`)} />
        </div>
      ))}
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
  mine,
  onMake,
  onAddMine,
  onDeleteMine,
}: {
  selected: Layer | null;
  onAdd: (id: string, colour: string) => void;
  onRecolour: (colour: string) => void;
  mine: MySticker[];
  /** A picture chosen to make a sticker from, as an address. */
  onMake: (src: string) => void;
  onAddMine: (s: MySticker) => void;
  onDeleteMine: (id: string) => void;
}) => {
  const custom = selected?.type === "sticker" && selected.sticker === "custom";
  const colour = selected?.type === "sticker" && !custom ? (selected.color ?? "#f6d94a") : "#f6d94a";
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.stack}>
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
      <h3 className={styles.head}>Shapes</h3>
      <p className={styles.hint}>Click a sticker to add it to the slide in view. Select one on the canvas to change its colour.</p>
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
