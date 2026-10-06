"use client";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "./cn";

/** "custom" is shown as having no theme selected: it is a built-in theme the person has changed. */
type ThemeValue = ThemeId | "auto" | "custom";

/** One choice per built-in theme, and optionally "Auto", which leaves the pick to the photos. */
export function ThemePicker({
  label,
  value,
  onValueChange,
  auto = false,
  disabled = false,
}: {
  label: string;
  value: ThemeValue;
  onValueChange: (v: ThemeId | "auto") => void;
  auto?: boolean;
  disabled?: boolean;
}) {
  const options: { id: ThemeId | "auto"; name: string; blurb: string }[] = [
    ...(auto ? [{ id: "auto" as const, name: "Auto", blurb: "We pick the theme that suits your photos." }] : []),
    ...THEME_IDS.map((id) => ({ id, name: THEMES[id].name, blurb: THEMES[id].description })),
  ];
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          onClick={() => onValueChange(o.id)}
          className={cn(
            "flex flex-col gap-1 rounded-md border-2 bg-page p-3 text-left t-fast disabled:opacity-50",
            value === o.id ? "border-accent shadow-card" : "border-line hover:border-field",
          )}
        >
          <span className="text-sm font-semibold text-ink">{o.name}</span>
          <span className="text-xs text-muted">{o.blurb}</span>
        </button>
      ))}
    </div>
  );
}
