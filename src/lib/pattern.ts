import { mix } from "./colour";
import type { Pattern } from "./look";

/** A quiet pattern for a background: lines or dots a little way from the background colour towards the ink. */
export const makePattern = (kind: Pattern["kind"], background: string, ink: string): Pattern => ({
  kind,
  color: mix(background, ink, 0.12),
  size: kind === "dots" ? 40 : 54,
  thickness: kind === "dots" ? 2 : 1.2,
});
