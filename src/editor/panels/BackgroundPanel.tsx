"use client";
import { Button, ColourPicker } from "@/ui";
import { useEditor } from "../store";

const WHITE = "#ffffff";

export function BackgroundPanel() {
  const colour = useEditor((s) => s.doc.background.value);
  const setBackground = useEditor((s) => s.setBackground);
  return (
    <div className="flex flex-col gap-4">
      <ColourPicker label="Slide background" value={colour} onValueChange={setBackground} />
      <Button variant="secondary" size="sm" disabled={colour.toLowerCase() === WHITE} onClick={() => setBackground(WHITE)}>
        Reset to white
      </Button>
      <p className="text-sm text-muted">The colour behind every slide. Photos and text sit on top of it.</p>
    </div>
  );
}
