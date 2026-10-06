import {
  ALIGNMENTS,
  Layer,
  SLIDE_WIDTH,
  alignedPosition,
  boundsOf,
  duplicateSlide,
  gradientLine,
  insertSlide,
  moveSlide,
  removeSlide,
  slideOf,
} from "./carouselModel";

const W = SLIDE_WIDTH;
const on = (id: string, slide: number, f = 0.5, w = 200): Layer => ({
  id,
  type: "sticker",
  name: id,
  x: slide * W + f * W - w / 2,
  y: 100,
  w,
  h: 100,
  rotation: 0,
  locked: false,
});
const where = (ls: Layer[]) => Object.fromEntries(ls.map((l) => [l.id, slideOf(l)]));

describe("slideOf", () => {
  it("is the slide under a layer's middle", () => {
    expect(slideOf(on("a", 0))).toBe(0);
    expect(slideOf(on("a", 3, 0.99))).toBe(3);
    expect(slideOf({ x: W - 100, w: 200 })).toBe(1);
    expect(slideOf({ x: W - 101, w: 200 })).toBe(0);
    expect(slideOf({ x: -500, w: 100 })).toBe(-1);
  });
});

describe("slide operations", () => {
  const ls = [on("a", 0), on("b", 1), on("c", 2), on("d", 3)];

  it("insert opens a blank slide and moves later layers along", () => {
    expect(where(insertSlide(ls, 2))).toEqual({ a: 0, b: 1, c: 3, d: 4 });
    expect(where(insertSlide(ls, 4))).toEqual({ a: 0, b: 1, c: 2, d: 3 });
  });

  it("remove takes the slide's layers and brings later ones back", () => {
    const out = removeSlide([...ls, on("b2", 1, 0.2)], 1);
    expect(where(out)).toEqual({ a: 0, c: 1, d: 2 });
  });

  it("insert then remove gives the layers back exactly", () => {
    for (const at of [0, 1, 2, 3]) expect(removeSlide(insertSlide(ls, at), at)).toEqual(ls);
  });

  it("duplicate puts a copy after the slide, with new ids", () => {
    const out = duplicateSlide(ls, 1);
    expect(out.length).toBe(5);
    expect(new Set(out.map((l) => l.id)).size).toBe(5);
    expect(slideOf(out[4])).toBe(2);
    expect(slideOf(out.find((l) => l.id === "c")!)).toBe(3);
  });

  it("move reorders slides and moving back restores them", () => {
    expect(where(moveSlide(ls, 4, 1, 3))).toEqual({ a: 0, b: 3, c: 1, d: 2 });
    for (let from = 0; from < 4; from++) {
      for (let to = 0; to < 4; to++) expect(moveSlide(moveSlide(ls, 4, from, to), 4, to, from)).toEqual(ls);
    }
  });

  it("leaves a layer off the end alone when moving", () => {
    const stray = { ...on("far", 0), x: 12 * W };
    expect(moveSlide([stray, on("a", 1)], 3, 1, 2)[0].x).toBe(12 * W);
  });
});

describe("alignment", () => {
  it("bounds allow for turning about the top-left corner", () => {
    const b = boundsOf({ x: 500, y: 100, w: 300, h: 50, rotation: 90 });
    expect(Math.round(b.l)).toBe(450);
    expect(Math.round(b.r)).toBe(500);
    expect(Math.round(b.b)).toBe(400);
  });

  it("lines up with the slide it is on, not slide 0", () => {
    const e = { x: 1300, y: 400, w: 200, h: 100, rotation: 0 };
    expect(alignedPosition(e, "left", 3, 1350).x).toBe(W);
    expect(alignedPosition(e, "right", 3, 1350).x).toBe(2 * W - 200);
    expect(alignedPosition(e, "centre", 3, 1350).x).toBe(W + W / 2 - 100);
    expect(alignedPosition(e, "top", 3, 1350).y).toBe(0);
    expect(alignedPosition(e, "bottom", 3, 1350).y).toBe(1250);
    expect(alignedPosition(e, "middle", 3, 1350).y).toBe(625);
  });

  it("doing it twice changes nothing more", () => {
    const e = { x: 1300, y: 400, w: 200, h: 100, rotation: 30 };
    for (const how of ALIGNMENTS) {
      const once = alignedPosition(e, how, 3, 1350);
      const twice = alignedPosition({ ...e, ...once }, how, 3, 1350);
      expect(Math.abs(twice.x - once.x)).toBeLessThan(0.02);
      expect(Math.abs(twice.y - once.y)).toBeLessThan(0.02);
    }
  });
});

describe("gradientLine", () => {
  it("runs left to right at 0 and top to bottom at 90", () => {
    const h = gradientLine(0, 400, 200);
    expect([h.start.x, h.start.y, h.end.x, h.end.y]).toEqual([0, 100, 400, 100]);
    const v = gradientLine(90, 400, 200);
    expect(Math.round(v.start.y)).toBe(0);
    expect(Math.round(v.end.y)).toBe(200);
  });

  it("puts the first colour exactly at one corner and the last at the opposite, at any angle", () => {
    for (let angle = 0; angle <= 360; angle += 15) {
      const { start, end } = gradientLine(angle, 3240, 1350);
      const len = Math.hypot(end.x - start.x, end.y - start.y);
      const t = [
        [0, 0],
        [3240, 0],
        [0, 1350],
        [3240, 1350],
      ].map(([x, y]) => ((x - start.x) * (end.x - start.x) + (y - start.y) * (end.y - start.y)) / (len * len));
      expect(Math.abs(Math.min(...t))).toBeLessThan(1e-9);
      expect(Math.abs(Math.max(...t) - 1)).toBeLessThan(1e-9);
    }
  });
});
