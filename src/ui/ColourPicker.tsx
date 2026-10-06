"use client";
import { Check } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "./cn";

// These are user content colours (what goes on a slide), not interface colours.
// Raw hex is correct here. They are data, and the UI tokens never reference them.
const SWATCHES = [
  "#ffffff", "#f2efe9", "#d9d9d9", "#808080", "#1a1a1a", "#000000",
  "#e63946", "#f4a261", "#f2cc3a", "#2a9d8f", "#3a86ff", "#8338ec",
];

const HEX = /^#([0-9a-fA-F]{6})$/;

export function ColourPicker({
  value,
  onValueChange,
  label,
}: {
  value: string;
  onValueChange: (hex: string) => void;
  label: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  // Undo, redo or another panel can change the value. Keep the typed box in step with it.
  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const commit = (v: string) => {
    const withHash = v.startsWith("#") ? v : `#${v}`;
    setDraft(withHash);
    if (HEX.test(withHash)) {
      setInvalid(false);
      onValueChange(withHash.toLowerCase());
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={label} className="grid grid-cols-6 gap-2">
        {SWATCHES.map((hex) => {
          const selected = hex.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={hex}
              onClick={() => {
                setDraft(hex);
                setInvalid(false);
                onValueChange(hex);
              }}
              className={cn(
                "relative grid size-9 place-items-center rounded-pill border border-field pointer-coarse:size-11",
                selected && "outline-2 outline-offset-2 outline-accent",
              )}
              style={{ background: hex }}
            >
              {selected ? (
                <Check
                  aria-hidden
                  className="size-4"
                  strokeWidth={3}
                  // Pick a check colour that reads on the swatch.
                  color={parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114 > 150 ? "#000000" : "#ffffff"}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          Hex
        </label>
        <input
          id={id}
          value={draft}
          onChange={(e) => commit(e.target.value)}
          aria-invalid={invalid || undefined}
          maxLength={7}
          spellCheck={false}
          className={cn(
            "h-10 w-32 rounded-md border bg-page px-3 font-mono text-sm text-ink pointer-coarse:h-11",
            invalid ? "border-danger" : "border-field",
          )}
        />
      </div>
    </div>
  );
}
