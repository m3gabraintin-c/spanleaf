import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drawLine, drawStroke, tracePath } from "@/editor/draw";
import { DocSchema, MAX_ELEMENTS, type Element } from "@/lib/doc";
import { seeded } from "@/lib/geometry";
import { StrokeSchema } from "@/lib/look";
import {
  DEFAULT_PEN, eraserRadius, localPoints, MAX_STROKE_POINTS, PEN_COLOURS, penStyle, simplify, simplifyTo, StrokeRecorder, strokeElement, strokeHit, type Point,
} from "@/lib/stroke";

const P = (x: number, y: number): Point => ({ x, y });
const doc = (elements: unknown[]) => ({ v: 1 as const, background: { type: "color" as const, value: "#ffffff" }, elements: elements as never });
const style = { color: "#e5484d", width: 12, opacity: 1 };
let n = 0;
const newId = () => `s${++n}`;

/** Distance from p to the polyline, the slow and obvious way. */
function distToLine(p: Point, line: Point[]) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return line.length === 1 ? Math.hypot(p.x - line[0].x, p.y - line[0].y) : best;
}
const walk = (count: number, seed: number, step = 6): Point[] => {
  const r = seeded(seed);
  const out = [P(500, 500)];
  for (let i = 1; i < count; i++) out.push(P(out[i - 1].x + (r() - 0.5) * step * 2, out[i - 1].y + (r() - 0.5) * step * 2));
  return out;
};

describe("StrokeRecorder", () => {
  it("keeps the first point, skips points that are too close, and keeps ones that are far enough", () => {
    const r = new StrokeRecorder(5);
    assert.equal(r.add(P(0, 0)), true);
    assert.equal(r.add(P(1, 1)), false);
    assert.equal(r.add(P(4.9, 0)), false);
    assert.equal(r.add(P(5, 0)), true);
    assert.equal(r.add(P(5, 4)), false, "5 is measured from the last kept point");
    assert.deepEqual(r.points, [P(0, 0), P(5, 0)]);
  });
  it("finishing adds the spot where the pointer lifted, even when it is close, but never repeats the last point", () => {
    const r = new StrokeRecorder(5);
    r.add(P(0, 0));
    assert.deepEqual(r.finish(P(1, 1)), [P(0, 0), P(1, 1)]);
    const same = new StrokeRecorder(5);
    same.add(P(3, 3));
    assert.deepEqual(same.finish(P(3, 3)), [P(3, 3)], "a tap is one point");
  });
  it("finishing a stroke that never started still gives the point", () => {
    assert.deepEqual(new StrokeRecorder(5).finish(P(7, 8)), [P(7, 8)]);
  });
  it("what it returns and what it was given are separate copies", () => {
    const given = P(1, 1);
    const r = new StrokeRecorder(1);
    r.add(given);
    given.x = 99;
    assert.equal(r.points[0].x, 1);
    const out = r.finish(P(5, 5));
    out[0].x = -1;
    assert.equal(r.points[0].x, 1);
  });
});

describe("simplify", () => {
  it("collapses a straight line to its two ends and keeps a corner", () => {
    assert.deepEqual(simplify([P(0, 0), P(1, 0), P(2, 0), P(3, 0)], 0.1), [P(0, 0), P(3, 0)]);
    assert.deepEqual(simplify([P(0, 0), P(5, 0), P(5, 5)], 0.1), [P(0, 0), P(5, 0), P(5, 5)]);
  });
  it("leaves one point, two points and nothing alone, and always keeps both ends", () => {
    assert.deepEqual(simplify([], 1), []);
    assert.deepEqual(simplify([P(1, 1)], 1), [P(1, 1)]);
    assert.deepEqual(simplify([P(1, 1), P(2, 2)], 1), [P(1, 1), P(2, 2)]);
    const w = walk(300, 4);
    const s = simplify(w, 5);
    assert.deepEqual([s[0], s.at(-1)], [w[0], w.at(-1)]);
  });
  it("never drifts further than the tolerance from what was drawn", () => {
    for (const seed of [1, 2, 3]) for (const eps of [0.5, 2, 8]) {
      const w = walk(400, seed);
      const s = simplify(w, eps);
      for (const p of w) assert.ok(distToLine(p, s) <= eps + 1e-9, `seed ${seed} eps ${eps}`);
      assert.ok(s.length <= w.length);
    }
  });
  it("a looser tolerance never keeps more points", () => {
    const w = walk(500, 9);
    const counts = [0.5, 1, 2, 4, 8, 16].map((e) => simplify(w, e).length);
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1]);
  });
  it("copes with repeated points, where a segment has no length", () => {
    const dup = [P(0, 0), P(0, 0), P(0, 0), P(10, 0), P(10, 0)];
    const out = simplify(dup, 0.5);
    assert.deepEqual([out[0], out.at(-1)], [P(0, 0), P(10, 0)]);
    assert.ok(out.length <= dup.length);
    assert.deepEqual(simplify([P(3, 3), P(3, 3), P(3, 3)], 1), [P(3, 3), P(3, 3)]);
  });
  it("copes with a very long stroke without running out of stack", () => {
    const long = Array.from({ length: 100_000 }, (_, i) => P(i, Math.sin(i / 50) * 40));
    assert.ok(simplify(long, 1).length < long.length);
  });
});

describe("simplifyTo", () => {
  it("brings any stroke down to the limit and keeps its ends", () => {
    for (const seed of [1, 2, 3]) {
      const w = walk(5000, seed, 20);
      const s = simplifyTo(w, MAX_STROKE_POINTS);
      assert.ok(s.length <= MAX_STROKE_POINTS);
      assert.deepEqual([s[0], s.at(-1)], [w[0], w.at(-1)]);
    }
    assert.equal(simplifyTo(walk(100, 1), 2).length, 2);
  });
  it("leaves a short stroke as simple as it already is", () => {
    assert.deepEqual(simplifyTo([P(0, 0), P(10, 10)], 200), [P(0, 0), P(10, 10)]);
  });
});

describe("strokeElement", () => {
  it("is always a valid layer, for dots, straight lines, tiny and huge strokes, at every pen width", () => {
    const shapes: Point[][] = [
      [P(10, 10)],
      [P(10, 10), P(10, 10)],
      [P(0, 0), P(500, 0)],
      [P(0, 0), P(0, 500)],
      [P(-300, -300), P(40, 90), P(2000, 1200)],
      walk(3000, 5, 30),
    ];
    for (const pts of shapes) for (const width of [1, 2, 12, 80, 160, 200]) for (const opacity of [1, 0.4]) {
      const el = strokeElement(pts, { color: "#112233", width, opacity }, newId);
      assert.ok(DocSchema.safeParse(doc([el])).success, `${pts.length} points, width ${width}`);
      assert.ok(StrokeSchema.safeParse(el.stroke).success);
      assert.ok(el.stroke!.points.length <= MAX_STROKE_POINTS * 2);
      assert.ok(el.stroke!.points.every((v) => v >= 0 && v <= 1));
    }
  });

  it("puts the box round the stroke with room for the pen's width, and the points read back where they were drawn", () => {
    // A smooth stroke like a hand makes, with more points than a saved stroke keeps.
    const original = Array.from({ length: 800 }, (_, i) => P(100 + i * 1.5, 400 + Math.sin(i / 40) * 90));
    for (const width of [4, 12, 40]) {
      const el = strokeElement(original, { ...style, width }, newId);
      const absolute = localPoints(el).map((p) => P(el.x + p.x, el.y + p.y));
      for (const p of original) assert.ok(distToLine(p, absolute) <= Math.max(0.5, width * 0.12) + 0.2, `width ${width}`);
      for (const p of absolute) {
        assert.ok(p.x >= el.x + width / 2 && p.x <= el.x + el.w - width / 2, "the pen's width fits inside the box");
        assert.ok(p.y >= el.y + width / 2 && p.y <= el.y + el.h - width / 2);
      }
    }
  });

  it("a dot has a box as wide as its pen and its one point in the middle", () => {
    const el = strokeElement([P(100, 200)], style, newId);
    assert.ok(el.w >= style.width && el.h >= style.width);
    assert.deepEqual(el.stroke!.points, [0.5, 0.5]);
    assert.ok(Math.abs(el.x + el.w / 2 - 100) < 0.01 && Math.abs(el.y + el.h / 2 - 200) < 0.01);
  });

  it("only a see-through pen sets an opacity, and a new layer is unlocked and unturned", () => {
    assert.equal("opacity" in strokeElement([P(0, 0), P(9, 9)], style, newId), false);
    assert.equal(strokeElement([P(0, 0), P(9, 9)], { ...style, opacity: 0.4 }, newId).opacity, 0.4);
    const el = strokeElement([P(0, 0), P(9, 9)], style, newId);
    assert.equal(el.type, "drawing");
    assert.equal(el.locked, false);
    assert.equal(el.rotation, 0);
    assert.deepEqual([el.stroke!.color, el.stroke!.width], [style.color, style.width]);
  });

  it("gives each stroke its own id", () => {
    assert.notEqual(strokeElement([P(0, 0)], style).id, strokeElement([P(0, 0)], style).id);
  });

  it("500 of the busiest possible strokes still fit in a saved project (2 MB)", () => {
    const r = seeded(3);
    const busy = Array.from({ length: MAX_ELEMENTS }, () => strokeElement(Array.from({ length: 4000 }, () => P(r() * 5000, r() * 1350)), { ...style, width: 3 }, newId));
    assert.ok(busy.every((e) => e.stroke!.points.length <= 400));
    assert.ok(JSON.stringify(doc(busy)).length < 2 * 1024 * 1024, `${JSON.stringify(doc(busy)).length} bytes`);
    assert.ok(DocSchema.safeParse(doc(busy)).success);
  });
});

describe("strokeHit", () => {
  const line = (over: Partial<Element> = {}): Element => ({
    id: "a", type: "drawing", x: 200, y: 300, w: 100, h: 40, rotation: 0, locked: false,
    stroke: { color: "#000000", width: 10, points: [0.1, 0.5, 0.9, 0.5] }, ...over,
  });
  it("hits on the line and within the pen's width and the eraser's reach, and misses beyond", () => {
    const el = line(); // the line runs from (210, 320) to (290, 320)
    assert.equal(strokeHit(el, P(250, 320), 0), true);
    assert.equal(strokeHit(el, P(250, 325), 0), true, "half the pen's width");
    assert.equal(strokeHit(el, P(250, 326), 0), false);
    assert.equal(strokeHit(el, P(250, 336), 10), false);
    assert.equal(strokeHit(el, P(250, 335), 10), true, "pen 5 plus eraser 10");
    assert.equal(strokeHit(el, P(295, 320), 0), true, "the round end reaches as far as the pen's half width");
    assert.equal(strokeHit(el, P(296, 320), 0), false);
  });
  it("follows the layer when it is moved", () => {
    assert.equal(strokeHit(line({ x: 600, y: 700 }), P(650, 720), 0), true);
    assert.equal(strokeHit(line({ x: 600, y: 700 }), P(250, 320), 0), false);
  });
  it("follows the layer when it is turned about its top-left corner", () => {
    const el = line({ rotation: 90 }); // the line now runs down from (180, 310) to (180, 390)
    assert.equal(strokeHit(el, P(180, 350), 0), true);
    assert.equal(strokeHit(el, P(230, 350), 0), false);
    assert.equal(strokeHit(el, P(250, 320), 0), false, "where it used to be");
    const back = line({ rotation: -45 });
    const a = (-45 * Math.PI) / 180;
    const mid = P(200 + 50 * Math.cos(a) - 20 * Math.sin(a), 300 + 50 * Math.sin(a) + 20 * Math.cos(a));
    assert.equal(strokeHit(back, mid, 0), true);
  });
  it("follows the layer when it is resized", () => {
    assert.equal(strokeHit(line({ w: 200 }), P(380, 320), 0), true, "the line now reaches x = 380");
    assert.equal(strokeHit(line(), P(380, 320), 0), false);
  });
  it("a dot is hit near its centre only, and a layer with no stroke is never hit", () => {
    const dot = line({ stroke: { color: "#000000", width: 10, points: [0.5, 0.5] } });
    assert.equal(strokeHit(dot, P(250, 320), 0), true);
    assert.equal(strokeHit(dot, P(256, 320), 0), false);
    assert.equal(strokeHit({ ...line(), stroke: undefined }, P(250, 320), 100), false);
  });
  it("a stroke made by strokeElement is hit where it was drawn", () => {
    const pts = walk(200, 11, 8);
    const el = strokeElement(pts, style, newId);
    for (const p of pts.filter((_, i) => i % 20 === 0)) assert.equal(strokeHit(el, p, 2), true);
    assert.equal(strokeHit(el, P(pts[0].x + 5000, pts[0].y), 2), false);
  });
});

describe("localPoints", () => {
  it("is nothing for a layer with no stroke, and drops a stray last number", () => {
    assert.deepEqual(localPoints({ w: 10, h: 10 }), []);
    assert.deepEqual(localPoints({ w: 10, h: 20, stroke: { color: "#000000", width: 3, points: [0.5, 0.5, 1] } }), [P(5, 10)]);
  });
});

describe("pens", () => {
  it("a pen draws as chosen, a highlighter is wider and see-through, and a pen starts black", () => {
    assert.deepEqual(penStyle({ mode: "pen", color: "#112233", size: 10 }), { color: "#112233", width: 10, opacity: 1 });
    assert.deepEqual(penStyle({ mode: "highlighter", color: "#ffd60a", size: 10 }), { color: "#ffd60a", width: 25, opacity: 0.4 });
    assert.deepEqual(DEFAULT_PEN, { mode: "pen", color: "#111111", size: 12 });
  });
  it("an eraser always reaches far enough to aim", () => {
    assert.equal(eraserRadius(2), 8);
    assert.equal(eraserRadius(40), 40);
  });
  it("the colours are valid, different from each other, and named", () => {
    assert.equal(new Set(PEN_COLOURS.map((c) => c.value)).size, PEN_COLOURS.length);
    assert.equal(new Set(PEN_COLOURS.map((c) => c.name)).size, PEN_COLOURS.length);
    for (const c of PEN_COLOURS) assert.match(c.value, /^#[0-9a-f]{6}$/);
  });
});

describe("what a saved stroke may be", () => {
  const ok = { color: "#112233", width: 10, points: [0.1, 0.2, 0.3, 0.4] };
  it("accepts a stroke, and a dot", () => {
    assert.ok(StrokeSchema.safeParse(ok).success);
    assert.ok(StrokeSchema.safeParse({ ...ok, points: [0.5, 0.5] }).success);
    assert.ok(StrokeSchema.safeParse({ ...ok, points: Array(400).fill(0.5) }).success);
  });
  it("refuses an odd count, too few or too many numbers, numbers outside the box, a bad colour or width", () => {
    for (const bad of [{ points: [0.1, 0.2, 0.3] }, { points: [] }, { points: [0.5] }, { points: Array(402).fill(0.5) }, { points: [0.1, 1.01] }, { points: [-0.01, 0.5] }, { points: [NaN, 0.5] }, { color: "red" }, { width: 0.5 }, { width: 201 }]) {
      assert.ok(!StrokeSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad).slice(0, 60));
    }
  });
  it("a project holds 500 layers and not 501", () => {
    const el = (i: number) => ({ id: `e${i}`, type: "drawing", x: 0, y: 0, w: 10, h: 10, rotation: 0, locked: false });
    assert.ok(DocSchema.safeParse(doc(Array.from({ length: MAX_ELEMENTS }, (_, i) => el(i)))).success);
    assert.ok(!DocSchema.safeParse(doc(Array.from({ length: MAX_ELEMENTS + 1 }, (_, i) => el(i)))).success);
    assert.equal(MAX_ELEMENTS, 500);
  });
});

/** Records the canvas calls, so drawing can be checked without a browser. */
function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => (...args: unknown[]) => void calls.push([name, ...args]),
    set: (_t, name: string, v) => ((props[name] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, props };
}

describe("drawing a stroke", () => {
  it("one point is a dot: a move and a tiny line, which round ends make into a circle", () => {
    const { ctx, calls } = recorder();
    tracePath(ctx, [P(5, 6)]);
    assert.deepEqual(calls, [["beginPath"], ["moveTo", 5, 6], ["lineTo", 5.01, 6]]);
  });
  it("two points are a straight line", () => {
    const { ctx, calls } = recorder();
    tracePath(ctx, [P(0, 0), P(10, 20)]);
    assert.deepEqual(calls, [["beginPath"], ["moveTo", 0, 0], ["lineTo", 10, 20]]);
  });
  it("more points are curves through the middle of each pair, ending on the last point", () => {
    const { ctx, calls } = recorder();
    tracePath(ctx, [P(0, 0), P(10, 0), P(10, 10), P(20, 10)]);
    assert.deepEqual(calls, [["beginPath"], ["moveTo", 0, 0], ["quadraticCurveTo", 10, 0, 10, 5], ["quadraticCurveTo", 10, 10, 15, 10], ["lineTo", 20, 10]]);
  });
  it("a line is drawn round-ended with the colour and width, and the canvas is left as it was found", () => {
    const { ctx, calls, props } = recorder();
    drawLine(ctx, [P(0, 0), P(5, 5), P(9, 2)], "#e5484d", 14);
    assert.deepEqual([props.strokeStyle, props.lineWidth, props.lineCap, props.lineJoin], ["#e5484d", 14, "round", "round"]);
    const names = calls.map((c) => c[0]);
    assert.equal(names.filter((x) => x === "stroke").length, 1);
    assert.equal(names.filter((x) => x === "save").length, names.filter((x) => x === "restore").length);
  });
  it("nothing is drawn for no points or a layer with no stroke", () => {
    const a = recorder();
    drawLine(a.ctx, [], "#000000", 5);
    assert.deepEqual(a.calls, []);
    const b = recorder();
    drawStroke(b.ctx, { id: "a", type: "drawing", x: 0, y: 0, w: 10, h: 10, rotation: 0, locked: false });
    assert.deepEqual(b.calls, []);
  });
  it("a layer's stroke is drawn in the layer's own pixels, so resizing the layer resizes the drawing", () => {
    const el = strokeElement([P(100, 100), P(200, 100)], style, newId);
    const draw = (w: number) => {
      const { ctx, calls } = recorder();
      drawStroke(ctx, { ...el, w });
      return calls.find((c) => c[0] === "lineTo")!;
    };
    const [, x1] = draw(el.w);
    const [, x2] = draw(el.w * 2);
    assert.ok(Math.abs((x2 as number) - (x1 as number) * 2) < 1e-9);
  });
});
