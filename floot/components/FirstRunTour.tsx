import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import styles from "./FirstRunTour.module.css";

const KEY = "spanleaf:tour-done";

const STEPS = [
  {
    title: "Welcome to Spanleaf",
    body: "Your carousel is one long canvas. The dashed lines show where each slide ends, and anything that crosses a line comes out split across two slides, so a photo can run seamlessly from one to the next.",
  },
  {
    title: "Start with your photos",
    body: "Add photos in the Photos tab, then press Shuffle collage for a ready-made layout with tilts, tape and flowers. Press it again for a different look; undo always goes back.",
  },
  {
    title: "Give it a look",
    body: "Pick one of 16 themes in the Themes tab, add text, and make your own stickers from any picture in the Stickers tab. Click something on the canvas to change it; shift-click to select several.",
  },
  {
    title: "Check it, then export",
    body: "Preview shows the carousel as it will look in a feed. Export saves each slide as a picture, and keeps your caption ready to copy. Your work saves in this browser, so download a backup from the projects page now and then.",
  },
];

/** A short tour the first time someone opens the editor. It can be opened again from the shortcuts list. */
export const FirstRunTour = ({ forceOpen, onClose, className }: { forceOpen: boolean; onClose: () => void; className?: string }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* storage blocked: skip the tour rather than show it every time */
    }
  }, []);

  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setOpen(true);
    }
  }, [forceOpen]);

  const finish = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* fine */
    }
    setOpen(false);
    onClose();
  };

  const s = STEPS[step];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish()}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}
          </DialogDescription>
        </DialogHeader>
        <p className={styles.body}>{s.body}</p>
        <div className={styles.dots} aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? styles.dotOn : styles.dot} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={finish}>
            Skip
          </Button>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? <Button onClick={() => setStep(step + 1)}>Next</Button> : <Button onClick={finish}>Start making</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
