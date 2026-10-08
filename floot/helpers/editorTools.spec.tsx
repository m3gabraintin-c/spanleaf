import { Layer, SLIDE_WIDTH, newDesign } from "./carouselModel";
import { MAX_ZOOM, cropRect, isAdjusted } from "./photoStyle";
import { snapBox } from "./snapping";
import { MAX_STROKE_POINTS, simplify, strokeHit, strokeLayer, localPoints } from "./strokes";
import { STICKERS, stickerSrc } from "./stickerArt";
import { THEMES, applyTheme, arrangePhotos } from "./themes";

const photo = (id: string, w = 4000, h = 3000): Layer => ({
  id,
  type: "image",
  name: id,
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  rotation: 0,
  locked: false,
  natural: { w, h },
});

describe("cropRect", () => {
  it("at zoom 1 is the largest piece that fits the frame, never squashed", () => {
    for (const [bw, bh] of [
      [800, 800],
      [1080, 1350],
      [1200, 240],
    ]) {
      const c = cropRect(4000, 3000, bw, bh);
      expect(Math.abs(c.width / c.height - bw / bh)).toBeLessThan(1e-9);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(4000 + 1e-9);
      expect(c.y + c.height).toBeLessThanOrEqual(3000 + 1e-9);
    }
  });

  it("zoom shrinks the part shown by exactly that much, and is held between 1 and the most", () => {
    const one = cropRect(4000, 3000, 800, 800);
    expect(cropRect(4000, 3000, 800, 800, { zoom: 2, x: 0.5, y: 0.5 }).width).toBeCloseTo(one.width / 2, 6);
    expect(cropRect(4000, 3000, 800, 800, { zoom: 99, x: 0.5, y: 0.5 }).width).toBeCloseTo(one.width / MAX_ZOOM, 6);
    expect(cropRect(4000, 3000, 800, 800, { zoom: 0.1, x: 0.5, y: 0.5 }).width).toBeCloseTo(one.width, 6);
  });

  it("stops at the photo's edges when moved to either side", () => {
    const left = cropRect(4000, 3000, 800, 800, { zoom: 2, x: 0, y: 0.5 });
    const right = cropRect(4000, 3000, 800, 800, { zoom: 2, x: 1, y: 0.5 });
    expect(left.x).toBe(0);
    expect(right.x + right.width).toBeCloseTo(4000, 6);
  });
});

describe("isAdjusted", () => {
  it("is false for nothing or all zeros and true for any change", () => {
    expect(isAdjusted(null)).toBe(false);
    expect(isAdjusted({ brightness: 0, contrast: 0, saturation: 0 })).toBe(false);
    expect(isAdjusted({ brightness: 0, contrast: 0, saturation: 1 })).toBe(true);
  });
});

describe("snapBox", () => {
  const slide = { left: 0, width: 1080, height: 1350 };

  it("snaps a box's middle to the slide's middle when close", () => {
    const t = snapBox({ x: 500, y: 100, w: 70, h: 70 }, [], slide, 8);
    expect(t.x).toBe(505);
    expect(t.guides.some((g) => g.axis === "x" && g.at === 540)).toBe(true);
  });

  it("does nothing when nothing is within the distance", () => {
    const s = snapBox({ x: 300, y: 300, w: 70, h: 70 }, [], slide, 8);
    expect(s).toEqual({ x: 300, y: 300, guides: [] });
  });

  it("snaps to another layer's edge", () => {
    const s = snapBox({ x: 405, y: 600, w: 100, h: 100 }, [{ x: 100, y: 100, w: 300, h: 200 }], slide, 8);
    expect(s.x).toBe(400);
  });
});

describe("strokes", () => {
  const line = Array.from({ length: 400 }, (_, i) => ({ x: 100 + i * 2, y: 300 + Math.sin(i / 20) * 40 }));

  it("simplify keeps the ends and drops points near a straight line", () => {
    const out = simplify([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], 0.1);
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }]);
    const s = simplify(line, 1);
    expect(s[0]).toEqual(line[0]);
    expect(s[s.length - 1]).toEqual(line[line.length - 1]);
  });

  it("a stroke layer is within the saved limits and its points read back where they were drawn", () => {
    const l = strokeLayer(line, { color: "#111111", width: 12, opacity: 1 });
    expect(l.stroke!.points.length).toBeLessThanOrEqual(MAX_STROKE_POINTS * 2);
    expect(l.stroke!.points.every((v) => v >= 0 && v <= 1)).toBe(true);
    const abs = localPoints(l).map((p) => ({ x: l.x + p.x, y: l.y + p.y }));
    expect(Math.abs(abs[0].x - line[0].x)).toBeLessThan(1);
    expect(Math.abs(abs[abs.length - 1].x - line[line.length - 1].x)).toBeLessThan(1);
  });

  it("a dot has a box as wide as its pen, with its one point in the middle", () => {
    const l = strokeLayer([{ x: 100, y: 200 }], { color: "#111111", width: 20, opacity: 1 });
    expect(l.w).toBeGreaterThanOrEqual(20);
    expect(l.stroke!.points).toEqual([0.5, 0.5]);
  });

  it("only a see-through pen sets an opacity", () => {
    expect(strokeLayer(line, { color: "#111111", width: 12, opacity: 1 }).opacity).toBeUndefined();
    expect(strokeLayer(line, { color: "#111111", width: 12, opacity: 0.4 }).opacity).toBe(0.4);
  });

  it("the eraser hits near the line and misses far from it, also after the layer is moved or turned", () => {
    const l = strokeLayer(line, { color: "#111111", width: 12, opacity: 1 });
    expect(strokeHit(l, line[100], 4)).toBe(true);
    expect(strokeHit(l, { x: 5000, y: 5000 }, 4)).toBe(false);
    const moved = { ...l, x: l.x + 500 };
    expect(strokeHit(moved, { x: line[100].x + 500, y: line[100].y }, 4)).toBe(true);
    expect(strokeHit(moved, line[100], 4)).toBe(false);
  });
});

describe("stickers", () => {
  it("every sticker draws as a picture in any colour", () => {
    for (const s of STICKERS) {
      const src = stickerSrc(s.id, "#ff0000");
      expect(src.startsWith("data:image/svg+xml")).toBe(true);
      expect(decodeURIComponent(src)).toContain("#ff0000");
    }
  });
});

describe("themes", () => {
  const base = { ...newDesign("portrait_4_5", 3), layers: [photo("a"), photo("b")] };

  it("each theme sets the background and gives every photo its look", () => {
    for (const t of THEMES) {
      const d = applyTheme(base, t.id);
      expect(d.background).toBe(t.background);
      expect(d.gradient).toEqual(t.gradient);
      expect(d.pattern).toEqual(t.pattern);
      for (const l of d.layers.filter((x) => x.type === "image")) {
        expect(l.radius).toBe(t.radius);
        expect(l.border).toEqual(t.border);
        expect(Math.abs(l.rotation)).toBeLessThanOrEqual(t.tilt + 1e-9);
        expect(l.adjust).toEqual(t.adjust);
      }
    }
  });

  it("scatters the theme's decorations on every slide, marked as the theme's, and swaps them when the theme changes", () => {
    const d3 = { ...base, slideCount: 3 };
    for (const t of THEMES) {
      const d = applyTheme(d3, t.id);
      const decor = d.layers.filter((l) => l.themeDecor);
      if (t.decor.length === 0) {
        expect(decor.length).toBe(0);
        continue;
      }
      expect(decor.length).toBeGreaterThanOrEqual(6);
      for (const l of decor) expect(t.decor.some((x) => x.sticker === l.sticker && x.colour === l.color)).toBe(true);
      const again = applyTheme(applyTheme(d, "clean"), t.id);
      expect(again.layers.filter((l) => l.themeDecor).length).toBe(decor.length);
      expect(applyTheme(d, "clean").layers.some((l) => l.themeDecor)).toBe(false);
    }
  });

  it("keeps your own stickers and stays within the layer limit on a very long project", () => {
    const mine = { ...photo("mine"), type: "sticker" as const };
    const long = { ...base, slideCount: 500, layers: [...base.layers, mine] };
    const d = applyTheme(long, "y2k");
    expect(d.layers.some((l) => l.id === "mine")).toBe(true);
    expect(d.layers.length).toBeLessThanOrEqual(500);
  });

  it("has at least 16 themes, each with a name, a blurb and a unique id", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    for (const t of THEMES) expect(t.name && t.blurb.length > 20).toBeTruthy();
  });

  it("is the same every time, and an unknown theme changes nothing", () => {
    let n = 0;
    const ids = () => `d${++n}`;
    const a = applyTheme(base, "scrapbook", ids);
    n = 0;
    expect(applyTheme(base, "scrapbook", ids)).toEqual(a);
    expect(applyTheme(base, "nope")).toBe(base);
  });
});

describe("arrangePhotos", () => {
  it("places every photo inside the canvas without squashing it, and adds the slides it needs", () => {
    const d = { ...newDesign("portrait_4_5", 1), layers: ["a", "b", "c", "d", "e", "f"].map((id) => photo(id)) };
    const out = arrangePhotos(d);
    expect(out.slideCount).toBeGreaterThanOrEqual(3);
    for (const l of out.layers) {
      expect(Math.abs(l.w / l.h - 4 / 3)).toBeLessThan(0.02);
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w).toBeLessThanOrEqual(out.slideCount * SLIDE_WIDTH + 1);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y + l.h).toBeLessThanOrEqual(1350 + 1);
    }
  });

  it("does nothing when there are no photos", () => {
    const d = newDesign("square", 2);
    expect(arrangePhotos(d)).toBe(d);
  });
});
