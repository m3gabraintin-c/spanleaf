import { Layer, newDesign, trimWindow } from "./carouselModel";
import { arcFor, oneLine } from "./curvedText";
import { ADJUST_PRESETS, applyLook, fullAdjust, isAdjusted } from "./photoStyle";
import { STICKERS, STRETCHY, stickerSrc, tapeOutline } from "./stickerArt";
import { collageItemsOf, shuffleLayout } from "./collage";

describe("arcFor", () => {
  it("is a straight line at 0 and a half circle at 100 or -100", () => {
    expect(arcFor(800, 100, 0).data).toBe("M 0 105 L 800 105");
    expect(arcFor(800, 100, 100).radius).toBe(400);
    expect(arcFor(800, 100, -100).radius).toBe(400);
    expect(arcFor(800, 100, 100).data).toContain(" 0 0 1 800 ");
    expect(arcFor(800, 100, -100).data).toContain(" 0 0 0 800 ");
  });

  it("gets taller as it bends, and holds the curve to 100 either way", () => {
    const h = [0, 20, 50, 100].map((c) => arcFor(800, 100, c).height);
    expect(h).toEqual([...h].sort((a, b) => a - b));
    expect(new Set(h).size).toBe(4);
    expect(arcFor(800, 100, 400)).toEqual(arcFor(800, 100, 100));
    expect(arcFor(800, 100, -30).height).toBe(arcFor(800, 100, 30).height);
  });

  it("puts line breaks on one line", () => {
    expect(oneLine("Summer\n  in\nLisbon ")).toBe("Summer in Lisbon");
  });
});

describe("tapeOutline", () => {
  it("stays inside its box and keeps the same torn ends however long it is", () => {
    const short = tapeOutline(200, 60);
    const long = tapeOutline(900, 60);
    for (const [w, pts] of [[200, short], [900, long]] as const) {
      for (let i = 0; i < pts.length; i += 2) {
        expect(pts[i]).toBeGreaterThanOrEqual(0);
        expect(pts[i]).toBeLessThanOrEqual(w);
        expect(pts[i + 1]).toBeGreaterThanOrEqual(0);
        expect(pts[i + 1]).toBeLessThanOrEqual(60);
      }
    }
    const depth = (pts: number[]) => Math.max(...pts.filter((_, i) => i % 2 === 0 && i < pts.length / 2));
    expect(depth(long)).toBe(depth(short));
  });

  it("has brush strokes among the stickers, and the long ones stretch", () => {
    for (const id of ["brush", "ring", "underline", "arrow"]) expect(STICKERS.some((s) => s.id === id)).toBe(true);
    for (const id of STRETCHY) expect(STICKERS.some((s) => s.id === id)).toBe(true);
    expect(decodeURIComponent(stickerSrc("brush", "#e5484d"))).toContain("#e5484d");
  });
});

describe("looks", () => {
  it("has at least 6 new looks beyond the first five, each different", () => {
    expect(ADJUST_PRESETS.length).toBeGreaterThanOrEqual(11);
    expect(new Set(ADJUST_PRESETS.map((p) => JSON.stringify(p.adjust))).size).toBe(ADJUST_PRESETS.length);
  });

  it("treats older projects' three settings as complete, and counts the new ones as changes", () => {
    expect(fullAdjust({ brightness: 5, contrast: 0, saturation: 0 })).toEqual({ brightness: 5, contrast: 0, saturation: 0, warmth: 0, tint: 0, vignette: 0, grain: 0 });
    expect(isAdjusted({ brightness: 0, contrast: 0, saturation: 0 })).toBe(false);
    expect(isAdjusted({ brightness: 0, contrast: 0, saturation: 0, grain: 10 })).toBe(true);
  });

  const grey = (w: number, h: number) => new Uint8ClampedArray(w * h * 4).fill(128);

  it("warmth turns grey orange, coolness blue, and tint magenta", () => {
    const warm = grey(1, 1);
    applyLook(warm, 1, 1, { warmth: 100 });
    expect(warm[0]).toBeGreaterThan(128);
    expect(warm[2]).toBeLessThan(128);
    const cool = grey(1, 1);
    applyLook(cool, 1, 1, { warmth: -100 });
    expect(cool[2]).toBeGreaterThan(cool[0]);
    const tint = grey(1, 1);
    applyLook(tint, 1, 1, { tint: 100 });
    expect(tint[1]).toBeLessThan(tint[0]);
  });

  it("a vignette darkens the corners and leaves the middle", () => {
    const px = grey(21, 21);
    applyLook(px, 21, 21, { vignette: 100 });
    const at = (x: number, y: number) => px[(y * 21 + x) * 4];
    expect(at(10, 10)).toBe(128);
    expect(at(0, 0)).toBeLessThan(60);
  });

  it("grain is the same every time and leaves alpha alone", () => {
    const a = grey(8, 8);
    const b = grey(8, 8);
    applyLook(a, 8, 8, { grain: 80 });
    applyLook(b, 8, 8, { grain: 80 });
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(new Set(Array.from(a).filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(5);
    expect(Array.from(a).filter((_, i) => i % 4 === 3).every((v) => v === 128)).toBe(true);
  });

  it("does nothing with everything at 0", () => {
    const px = grey(4, 4);
    applyLook(px, 4, 4, {});
    expect(Array.from(px).every((v) => v === 128)).toBe(true);
  });
});

describe("trimWindow", () => {
  it("is the whole clip by default and stays inside it", () => {
    expect(trimWindow({ duration: 12 })).toEqual({ start: 0, end: 12, length: 12 });
    expect(trimWindow({ duration: 12, trimStart: 3, trimEnd: 7.5 })).toEqual({ start: 3, end: 7.5, length: 4.5 });
    expect(trimWindow({ duration: 12, trimStart: -4, trimEnd: 40 })).toEqual({ start: 0, end: 12, length: 12 });
  });

  it("is at least half a second long, and zero for a clip of unknown length", () => {
    expect(trimWindow({ duration: 12, trimStart: 11.9 })).toEqual({ start: 11.5, end: 12, length: 0.5 });
    expect(trimWindow({ duration: 12, trimStart: 5, trimEnd: 5 }).length).toBe(0.5);
    expect(trimWindow({ duration: 0.3 })).toEqual({ start: 0, end: 0.3, length: 0.3 });
    expect(trimWindow({})).toEqual({ start: 0, end: 0, length: 0 });
  });
});

describe("collage with videos", () => {
  const item = (id: string, type: "image" | "video"): Layer => ({
    id,
    type,
    name: id,
    src: type === "image" ? "data:image/jpeg;base64,AAAA" : undefined,
    mediaKey: type === "video" ? `k-${id}` : undefined,
    duration: type === "video" ? 8 : undefined,
    natural: { w: 1080, h: 1920 },
    x: 0,
    y: 0,
    w: 300,
    h: 533,
    rotation: 0,
    locked: false,
  });

  it("moves videos with the photos and keeps their trim", () => {
    const v = { ...item("v1", "video"), trimStart: 2, trimEnd: 5 };
    const d = { ...newDesign("portrait_4_5", 1), layers: [item("a", "image"), v, item("b", "image"), item("v2", "video")] };
    expect(collageItemsOf(d).map((l) => l.id)).toEqual(["a", "v1", "b", "v2"]);
    const { design, order } = shuffleLayout(d, 4);
    expect([...order].sort()).toEqual(["a", "b", "v1", "v2"]);
    const moved = design.layers.find((l) => l.id === "v1")!;
    expect(moved.trimStart).toBe(2);
    expect(moved.trimEnd).toBe(5);
    expect(Math.abs(moved.w / moved.h - 1080 / 1920)).toBeLessThan(0.02);
  });
});