/**
 * Highlighted words: in a text layer, words between stars (*like this*) are drawn bold in the accent colour. These
 * helpers split the text into runs and wrap them into lines. Measuring is passed in, so the wrapping can be tested
 * without a canvas.
 */

export type Run = { text: string; accent: boolean };
export type Piece = { text: string; accent: boolean; x: number; width: number };
export type RichLine = { pieces: Piece[]; width: number };

const MARK = /\*([^*\n]+)\*/g;

export const hasMarkup = (s: string | undefined) => !!s && /\*[^*\n]+\*/.test(s);
export const plainText = (s: string) => s.replace(MARK, "$1");

export const parseRuns = (s: string): Run[] => {
  const out: Run[] = [];
  let last = 0;
  for (const m of s.matchAll(MARK)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: s.slice(last, at), accent: false });
    out.push({ text: m[1], accent: true });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), accent: false });
  return out;
};

/**
 * Wraps the text into lines no wider than maxW. Lines break at spaces and at line breaks in the text; a word wider
 * than a whole line gets a line to itself. Spaces at the start and end of a line are dropped.
 */
export const layoutRich = (s: string, maxW: number, measure: (text: string, accent: boolean) => number): RichLine[] => {
  const tokens: { text: string; accent: boolean; kind: "word" | "space" | "break" }[] = [];
  for (const r of parseRuns(s)) {
    for (const part of r.text.split(/(\n| +)/)) {
      if (!part) continue;
      tokens.push({ text: part, accent: r.accent, kind: part === "\n" ? "break" : part.trim() === "" ? "space" : "word" });
    }
  }
  const lines: RichLine[] = [];
  let cur: Piece[] = [];
  let x = 0;
  const finish = () => {
    while (cur.length && cur[cur.length - 1].text.trim() === "") cur.pop();
    const end = cur[cur.length - 1];
    lines.push({ pieces: cur, width: end ? end.x + end.width : 0 });
    cur = [];
    x = 0;
  };
  for (const t of tokens) {
    if (t.kind === "break") {
      finish();
      continue;
    }
    if (t.kind === "space") {
      if (cur.length === 0) continue;
      const w = measure(t.text, t.accent);
      cur.push({ text: t.text, accent: t.accent, x, width: w });
      x += w;
      continue;
    }
    const w = measure(t.text, t.accent);
    if (x + w > maxW && cur.some((p) => p.text.trim() !== "")) {
      finish();
    }
    cur.push({ text: t.text, accent: t.accent, x, width: w });
    x += w;
  }
  finish();
  return lines;
};

/** The font size that makes the widest line fill the width, given each line's width at size 100. Kept between 20 and 300. */
export const fitFontSize = (widthsAt100: number[], width: number) => {
  const widest = Math.max(1, ...widthsAt100);
  return Math.max(20, Math.min(300, Math.floor((100 * width * 0.98) / widest)));
};