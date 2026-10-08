import { Design, Layer, SLIDE_WIDTH, FORMATS, newDesign, slideOf } from "./carouselModel";
import { SPOTS, SPOT_NAMES, applyPlan, cleanPlan, photosOf, randomPlan, seeded, shuffleLayout } from "./collage";

const photo = (id: string, w = 4000, h = 3000, extra: Partial<Layer> = {}): Layer => ({
  id,
  type: "image",
  name: id,
  src: "data:image/jpeg;base64,AAAA",
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  rotation: 0,
  locked: false,
  natural: { w, h },
  ...extra,
});
const design = (layers: Layer[], slides = 1): Design => ({ ...newDesign("portrait_4_5", slides), layers });
const H = FORMATS.portrait_4_5.height;
let n = 0;
const newId = () => `s${++n}`;

describe("seeded", () => {
  it("gives the same numbers for the same seed, different ones for another, all from 0 to 1", () => {
    const a = seeded(5);
    const b = seeded(5);
    const c = seeded(6);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("shuffleLayout", () => {
  const many = Array.from({ length: 11 }, (_, i) => photo(`p${i}`, i % 2 ? 3000 : 4000, i % 2 ? 4000 : 3000));

  it("keeps every photo, upright, inside a slide, at its own shape, and adds the slides it needs", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const { design: d, order } = shuffleLayout(design(many), seed);
      expect([...order].sort()).toEqual(many.map((p) => p.id).sort());
      expect(d.slideCount).toBeGreaterThanOrEqual(4);
      for (const l of photosOf(d)) {
        const s = slideOf(l);
        expect(l.rotation).toBe(0);
        expect(l.x).toBeGreaterThanOrEqual(s * SLIDE_WIDTH - 1);
        expect(l.x + l.w).toBeLessThanOrEqual((s + 1) * SLIDE_WIDTH + 1);
        expect(l.y).toBeGreaterThanOrEqual(-1);
        expect(l.y + l.h).toBeLessThanOrEqual(H + 1);
        expect(Math.abs(l.w / l.h - l.natural!.w / l.natural!.h)).toBeLessThan(0.02);
      }
      // no slide has more than three photos
      const counts = new Map<number, number>();
      for (const l of photosOf(d)) counts.set(slideOf(l), (counts.get(slideOf(l)) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    }
  });

  it("is the same for the same seed and usually different for another", () => {
    const a = shuffleLayout(design(many), 7);
    const b = shuffleLayout(design(many), 7);
    const c = shuffleLayout(design(many), 8);
    expect(a).toEqual(b);
    expect(c.order).not.toEqual(a.order);
  });

  it("never removes slides, removes stickers an earlier shuffle placed, and leaves the person's own layers alone", () => {
    const mine = { ...photo("t"), type: "text" as const, src: undefined, text: "Hi" };
    const myStar = { ...photo("star"), type: "sticker" as const };
    const autoTape = { ...photo("tape"), type: "sticker" as const, auto: true };
    const frame = { ...photo("frame"), src: undefined };
    const { design: d } = shuffleLayout(design([mine, photo("a"), myStar, autoTape, frame], 9), 3);
    expect(d.slideCount).toBe(9);
    const ids = d.layers.map((l) => l.id);
    expect(ids).toContain("t");
    expect(ids).toContain("star");
    expect(ids).toContain("frame");
    expect(ids).not.toContain("tape");
    expect(d.layers.find((l) => l.id === "t")).toEqual(mine);
    expect(d.layers.find((l) => l.id === "frame")).toEqual(frame);
  });

  it("does nothing without photos", () => {
    const d = design([]);
    expect(shuffleLayout(d, 1)).toEqual({ design: d, order: [] });
  });
});

describe("plans", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];

  it("a random plan tilts some photos, in both directions, within 7 degrees, and only uses spots that suit the sticker", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const p = cleanPlan(randomPlan(ids, seed), ids);
      const tilts = Object.values(p.tilts);
      expect(tilts.every((t) => Math.abs(t) <= 7)).toBe(true);
      expect(randomPlan(ids, seed)).toEqual(randomPlan(ids, seed));
      expect(p.stickers.length).toBe(randomPlan(ids, seed).stickers.length);
    }
    const all = ids.flatMap((_, k) => Object.values(randomPlan(ids, k + 10).tilts));
    expect(all.some((t) => t > 0)).toBe(true);
    expect(all.some((t) => t < 0)).toBe(true);
    expect(all.some((t) => t === 0)).toBe(true);
  });

  it("cleanPlan holds tilts to 12 degrees, drops stickers on unknown photos or in the wrong spot, and caps them at 4 a photo", () => {
    const p = cleanPlan(
      {
        tilts: { a: 40, b: -40, z: 5 },
        stickers: [
          { photoId: "z", spot: "tape-top", sticker: "tape", colour: "#ffffff", extraRotation: 0 },
          { photoId: "a", spot: "tape-top", sticker: "daisy", colour: "#ffffff", extraRotation: 0 },
          { photoId: "a", spot: "accent-top-right", sticker: "daisy", colour: "nope", extraRotation: 500 },
          ...Array.from({ length: 6 }, () => ({ photoId: "b", spot: "tape-top" as const, sticker: "tape" as const, colour: "#ffffff", extraRotation: 0 })),
        ],
      },
      ["a", "b"],
    );
    expect(p.tilts).toEqual({ a: 12, b: -12 });
    expect(p.stickers.filter((s) => s.photoId === "a")).toEqual([{ photoId: "a", spot: "accent-top-right", sticker: "daisy", colour: "#f3ead7", extraRotation: 40 }]);
    expect(p.stickers.filter((s) => s.photoId === "b").length).toBe(4);
    expect(p.stickers.some((s) => s.photoId === "z")).toBe(false);
  });
});

describe("applyPlan", () => {
  const centre = (l: Layer) => {
    const a = (l.rotation * Math.PI) / 180;
    return { x: l.x + (l.w / 2) * Math.cos(a) - (l.h / 2) * Math.sin(a), y: l.y + (l.w / 2) * Math.sin(a) + (l.h / 2) * Math.cos(a) };
  };

  it("tilts photos about their middles, so they stay where they were", () => {
    const p = photo("a", 4000, 3000, { x: 1300, y: 400, w: 600, h: 450 });
    const out = applyPlan(design([p], 3), { tilts: { a: 6 }, stickers: [] }, newId);
    const t = out.layers[0];
    expect(t.rotation).toBe(6);
    expect(Math.abs(centre(t).x - centre(p).x)).toBeLessThan(0.05);
    expect(Math.abs(centre(t).y - centre(p).y)).toBeLessThan(0.05);
  });

  it("puts each sticker's middle on its spot of the photo, turned with the photo, marked as placed by the shuffle", () => {
    const p = photo("a", 4000, 3000, { x: 1300, y: 400, w: 600, h: 450 });
    for (const spot of SPOT_NAMES) {
      const kind = SPOTS[spot].kind;
      const sticker = kind === "tape" ? "tape" : kind === "pin" ? "pin" : "daisy";
      for (const tilt of [0, 7, -5]) {
        const out = applyPlan(design([p], 3), { tilts: { a: tilt }, stickers: [{ photoId: "a", spot, sticker, colour: "#ffffff", extraRotation: 0 }] }, newId);
        const [ph, st] = out.layers;
        expect(st.auto).toBe(true);
        expect(st.type).toBe("sticker");
        expect(st.rotation).toBeCloseTo(ph.rotation + SPOTS[spot].turn, 5);
        const a = (ph.rotation * Math.PI) / 180;
        const lx = SPOTS[spot].x * ph.w;
        const ly = SPOTS[spot].y * ph.h;
        const want = { x: ph.x + lx * Math.cos(a) - ly * Math.sin(a), y: ph.y + lx * Math.sin(a) + ly * Math.cos(a) };
        const got = centre(st);
        expect(Math.abs(got.x - want.x)).toBeLessThan(1.01);
        expect(Math.abs(got.y - want.y)).toBeLessThan(1.01);
      }
    }
  });

  it("puts stickers on top of everything and skips stickers for photos that aren't there", () => {
    const out = applyPlan(design([photo("a"), photo("b")]), { tilts: {}, stickers: [{ photoId: "a", spot: "pin-top", sticker: "pin", colour: "#e5484d", extraRotation: 0 }, { photoId: "gone", spot: "pin-top", sticker: "pin", colour: "#e5484d", extraRotation: 0 }] }, newId);
    expect(out.layers.map((l) => l.type)).toEqual(["image", "image", "sticker"]);
  });

  it("a shuffle then a plan, again and again, never piles up stickers", () => {
    let d = design([photo("a"), photo("b"), photo("c")]);
    for (let seed = 1; seed <= 6; seed++) {
      const { design: laid, order } = shuffleLayout(d, seed);
      d = applyPlan(laid, cleanPlan(randomPlan(order, seed), order), newId);
      expect(d.layers.filter((l) => l.auto).length).toBeLessThanOrEqual(order.length * 2);
    }
  });
});
