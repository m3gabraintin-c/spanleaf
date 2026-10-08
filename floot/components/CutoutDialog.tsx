import { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Slider } from "./Slider";
import { Switch } from "./Switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Matte, composeSticker, dropSpecks, findSubject, keptShare, matteMask, toPng } from "../helpers/cutout";
import { MySticker, saveMySticker } from "../helpers/myStickers";
import styles from "./CutoutDialog.module.css";

/**
 * Makes a sticker from a picture: finds the main subject, takes the background away, and adds a white die-cut
 * border if you like. Everything happens on this device.
 */
export const CutoutDialog = ({
  source,
  onClose,
  onDone,
  className,
}: {
  /** The picture to cut out, or null when the dialog is closed. */
  source: string | null;
  onClose: () => void;
  onDone: (sticker: MySticker) => void;
  className?: string;
}) => {
  const [matte, setMatte] = useState<Matte | null>(null);
  const [error, setError] = useState<string>();
  const [strength, setStrength] = useState(50);
  const [border, setBorder] = useState(true);
  const [width, setWidth] = useState(14);
  const [colour, setColour] = useState("#ffffff");
  const [preview, setPreview] = useState<{ src: string; w: number; h: number; share: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMatte(null);
    setPreview(null);
    setError(undefined);
    if (!source) return;
    let alive = true;
    findSubject(source).then(
      (m) => alive && setMatte(m),
      (e) => alive && setError(e instanceof Error ? e.message : "The background couldn't be removed."),
    );
    return () => {
      alive = false;
    };
  }, [source]);

  const settings = useMemo(() => ({ strength, outline: border ? { width, color: colour } : null }), [strength, border, width, colour]);

  useEffect(() => {
    if (!matte) return;
    const t = setTimeout(() => {
      const mask = dropSpecks(matteMask(matte.pred, matte.img.w, matte.img.h, settings.strength), matte.img.w, matte.img.h);
      const out = composeSticker(matte.img, mask, settings.outline);
      setPreview(out ? { src: toPng(out), w: out.w, h: out.h, share: keptShare(mask) } : { src: "", w: 0, h: 0, share: 0 });
    }, 150);
    return () => clearTimeout(t);
  }, [matte, settings]);

  const save = async () => {
    if (!preview?.src) return;
    setSaving(true);
    try {
      onDone(await saveMySticker(preview.src, preview.w, preview.h));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sticker couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  const empty = !!preview && (!preview.src || preview.share < 0.01);
  const whole = !!preview && preview.share > 0.97;

  return (
    <Dialog open={!!source} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`${styles.dialog} ${className ?? ""}`}>
        <DialogHeader>
          <DialogTitle>Make a sticker</DialogTitle>
          <DialogDescription>The background is taken away on this device. Your picture isn't uploaded anywhere.</DialogDescription>
        </DialogHeader>

        <div className={styles.stage} aria-live="polite">
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : !matte ? (
            <p className={styles.wait}>Finding the main subject… The first time, the cut-out tool downloads (about 7 MB).</p>
          ) : preview?.src ? (
            <img src={preview.src} alt="Your sticker, with the background removed" className={styles.preview} />
          ) : (
            <p className={styles.wait}>Working…</p>
          )}
        </div>
        {empty && <p className={styles.error}>No clear subject was found. Try cutting less closely, or a picture where the subject stands out.</p>}
        {whole && <p className={styles.note}>Almost the whole picture was kept. Try cutting closer.</p>}

        <div className={styles.controls}>
          <div className={styles.field}>
            <span id="cut-strength">Cut closer {strength}</span>
            <Slider aria-labelledby="cut-strength" min={0} max={100} value={[strength]} disabled={!matte} onValueChange={([v]) => setStrength(v)} />
          </div>
          <div className={styles.row}>
            <span id="cut-border">White border, like a die-cut sticker</span>
            <Switch aria-labelledby="cut-border" checked={border} disabled={!matte} onCheckedChange={setBorder} />
          </div>
          {border && (
            <>
              <div className={styles.field}>
                <span id="cut-width">Border width {width}</span>
                <Slider aria-labelledby="cut-width" min={2} max={40} value={[width]} disabled={!matte} onValueChange={([v]) => setWidth(v)} />
              </div>
              <label className={styles.row}>
                <span>Border colour</span>
                <Input type="color" className={styles.colour} value={colour} disabled={!matte} onChange={(e) => setColour(e.target.value)} />
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!preview?.src || empty || saving} onClick={() => void save()}>
            Save and add sticker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
