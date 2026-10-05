import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seeded } from "@/lib/geometry";
import {
  addOutline, applyMask, cleanMask, cropTo, dropSpecks, finishCutout, pad, placeCutout, squaredDistanceToSet, subjectBounds, visibleRegion, type Rgba,
} from "@/lib/cutout";

const grid = (w: number, h: number, on: (x: number, y: number) => boolean) => {
  const a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = on(x, y) ? 1 : 0;
  return a;
};
const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const solid = (w: number, h: number, rgba: number[]): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { data, w, h };
};
const alphaAt = (img: Rgba, x: number, y: number) => img.data[(y * img.w + x) * 4 + 3];
const count = (a: ArrayLike<number>) => Array.from(a).filter((v) => v).length;

describe("dropSpecks", () => {
  it("keeps a big piece and drops a speck", () => {
    const fg = grid(100, 100, (x, y) => rect(20, 20, 80, 80)(x, y) || rect(2, 2, 5, 5)(x, y));
    const out = dropSpecks(fg, 100, 100);
    assert.equal(out[50 * 100 + 50], 1);
    assert.equal(out[3 * 100 + 3], 0);
    assert.equal(count(out), 60 * 60);
  });
  it("keeps every big piece, so two objects both stay", () => {
    const out = dropSpecks(grid(200, 100, (x, y) => rect(10, 10, 80, 90)(x, y) || rect(120, 20, 190, 80)(x, y)), 200, 100);
    assert.equal(out[50 * 200 + 40], 1);
    assert.equal(out[50 * 200 + 150], 1);
  });
  it("drops a piece much smaller than the biggest, even when it isn't tiny", () => {
    const out = dropSpecks(grid(200, 200, (x, y) => rect(0, 0, 150, 150)(x, y) || rect(170, 170, 180, 180)(x, y)), 200, 200);
    assert.equal(out[175 * 200 + 175], 0);
    assert.equal(out[75 * 200 + 75], 1);
  });
  it("joins by sides only, so pieces touching at a corner are separate pieces", () => {
    const fg = grid(200, 200, (x, y) => rect(0, 0, 100, 100)(x, y) || (x >= 100 && x < 104 && y >= 100 && y < 104));
    assert.equal(dropSpecks(fg, 200, 200)[101 * 200 + 101], 0);
  });
  it("copes with nothing, and with everything", () => {
    assert.equal(count(dropSpecks(new Uint8Array(50 * 50), 50, 50)), 0);
    assert.equal(count(dropSpecks(new Uint8Array(50 * 50).fill(1), 50, 50)), 2500);
  });
  it("a very long thin object isn't mistaken for a speck", () => {
    const out = dropSpecks(grid(500, 100, rect(0, 50, 500, 52)), 500, 100);
    assert.equal(count(out), 1000);
  });
});

describe("cleanMask", () => {
  const mask = (w: number, h: number, f: (x: number, y: number) => number) => {
    const m = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = f(x, y);
    return m;
  };
  it("drops specks, keeps the object's values, and reports the share kept", () => {
    const m = mask(100, 100, (x, y) => (rect(20, 20, 80, 80)(x, y) ? 255 : rect(2, 2, 6, 6)(x, y) ? 255 : 0));
    const { mask: out, share } = cleanMask(m, 100, 100);
    assert.equal(out[50 * 100 + 50], 255);
    assert.equal(out[3 * 100 + 3], 0);
    assert.ok(Math.abs(share - 0.36) < 1e-9);
  });
  it("keeps the soft edge of the object and not the soft edge of a dropped speck", () => {
    const m = mask(100, 100, (x, y) => (rect(20, 20, 80, 80)(x, y) ? 255 : x === 19 && y >= 20 && y < 80 ? 100 : x === 6 && y === 3 ? 100 : 0));
    const { mask: out } = cleanMask(m, 100, 100);
    assert.equal(out[40 * 100 + 19], 100, "the object's soft edge stays");
    assert.equal(out[3 * 100 + 6], 0, "a faint dot far from the object goes");
  });
  it("doesn't change what it was given", () => {
    const m = mask(30, 30, (x, y) => (rect(5, 5, 25, 25)(x, y) ? 255 : 0));
    const frozen = Uint8ClampedArray.from(m);
    cleanMask(m, 30, 30);
    assert.deepEqual(m, frozen);
  });
  it("an empty mask is an empty result", () => {
    const { mask: out, share } = cleanMask(new Uint8ClampedArray(400), 20, 20);
    assert.equal(count(out), 0);
    assert.equal(share, 0);
  });
});

describe("applyMask", () => {
  it("makes the mask the transparency, keeps the colours, and scales a photo's own transparency", () => {
    const img = solid(2, 1, [10, 20, 30, 255]);
    img.data[7] = 128;
    const out = applyMask(img, Uint8ClampedArray.from([0, 255]));
    assert.deepEqual([...out.data], [10, 20, 30, 0, 10, 20, 30, 128]);
    const half = applyMask(solid(1, 1, [1, 2, 3, 200]), Uint8ClampedArray.from([128]));
    assert.equal(half.data[3], Math.round((200 * 128) / 255));
  });
  it("doesn't change the photo it was given", () => {
    const img = solid(3, 3, [9, 9, 9, 255]);
    applyMask(img, new Uint8ClampedArray(9));
    assert.ok(img.data.every((v, i) => (i % 4 === 3 ? v === 255 : v === 9)));
  });
});

describe("squaredDistanceToSet", () => {
  const brute = (on: Uint8Array, w: number, h: number) => {
    const out = new Float32Array(w * h);
    const pts: [number, number][] = [];
    for (let i = 0; i < w * h; i++) if (on[i]) pts.push([i % w, Math.floor(i / w)]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = pts.length ? Math.min(...pts.map(([px, py]) => (x - px) ** 2 + (y - py) ** 2)) : Infinity;
    return out;
  };
  it("agrees with checking every pair, for random shapes, thin ones and single points", () => {
    const r = seeded(5);
    const cases: [number, number, Uint8Array][] = [];
    for (let k = 0; k < 20; k++) {
      const w = 3 + Math.floor(r() * 25);
      const h = 3 + Math.floor(r() * 25);
      const p = [0.02, 0.1, 0.5][k % 3];
      cases.push([w, h, grid(w, h, () => r() < p)]);
    }
    cases.push([9, 7, grid(9, 7, (x, y) => x === 4 && y === 3)], [30, 5, grid(30, 5, (x) => x === 29)], [1, 1, new Uint8Array([1])]);
    for (const [w, h, on] of cases) {
      const got = squaredDistanceToSet(on, w, h);
      const want = brute(on, w, h);
      for (let i = 0; i < w * h; i++) {
        if (want[i] === Infinity) assert.ok(got[i] > 1e10, `${w}x${h} empty`);
        else assert.ok(Math.abs(got[i] - want[i]) < 1e-3, `${w}x${h} at ${i}: ${got[i]} vs ${want[i]}`);
      }
    }
  });
  it("is 0 on the set and grows away from it", () => {
    const d = squaredDistanceToSet(grid(20, 20, (x, y) => x === 10 && y === 10), 20, 20);
    assert.equal(d[10 * 20 + 10], 0);
    assert.equal(d[10 * 20 + 13], 9);
    assert.equal(d[13 * 20 + 14], 25);
  });
});

describe("pad", () => {
  it("returns the same picture for no margin, and otherwise adds clear space round it", () => {
    const img = solid(4, 3, [5, 6, 7, 255]);
    assert.equal(pad(img, 0), img);
    const out = pad(img, 2);
    assert.deepEqual([out.w, out.h], [8, 7]);
    assert.equal(alphaAt(out, 0, 0), 0);
    assert.equal(alphaAt(out, 2, 2), 255);
    assert.equal(alphaAt(out, 5, 4), 255);
    assert.equal(alphaAt(out, 6, 4), 0);
    assert.equal(count(Array.from({ length: out.w * out.h }, (_, i) => out.data[i * 4 + 3])), 12);
  });
});

describe("addOutline", () => {
  const square = () => {
    const img = pad(solid(10, 10, [200, 50, 20, 255]), 8);
    return img;
  };
  it("draws a solid ring round the object, softening at its outer edge, and leaves the object as it was", () => {
    const out = addOutline(square(), 4, "#00ff00");
    const row = 13; // through the middle of the square, which runs from x = 8 to x = 17
    assert.deepEqual([...out.data.subarray((row * out.w + 12) * 4, (row * out.w + 12) * 4 + 4)], [200, 50, 20, 255], "inside the object");
    for (const d of [1, 2, 3]) assert.deepEqual([...out.data.subarray((row * out.w + (8 - d)) * 4, (row * out.w + (8 - d)) * 4 + 4)].map(Math.round), [0, 255, 0, 255], `${d} px out`);
    assert.equal(Math.round(alphaAt(out, 4, row)), 128, "half way across the soft edge");
    assert.equal(alphaAt(out, 3, row), 0, "beyond the ring");
  });
  it("is round at the corners, not square", () => {
    const out = addOutline(square(), 5, "#ffffff");
    assert.equal(alphaAt(out, 8 - 4, 8 - 4), 0, "the diagonal is 5.6 away, out of reach");
    assert.equal(alphaAt(out, 8 - 3, 8 - 3), 255, "the diagonal is 4.2 away, inside");
  });
  it("a width of 0 adds nothing", () => {
    const out = addOutline(square(), 0, "#ffffff");
    assert.equal(alphaAt(out, 7, 13), 0);
    assert.equal(alphaAt(out, 8, 13), 255);
  });
  it("blends under a soft edge instead of making it hard", () => {
    const img = pad(solid(6, 6, [200, 50, 20, 255]), 6);
    img.data[(9 * img.w + 6) * 4 + 3] = 100; // one half see-through pixel on the left edge
    const out = addOutline(img, 3, "#0000ff");
    const i = (9 * out.w + 6) * 4;
    assert.ok(out.data[i + 3] > 100, "the outline shows through behind it");
    assert.ok(out.data[i + 2] > 0 && out.data[i] > 0, "a mix of the two colours");
  });
  it("doesn't change the picture it was given", () => {
    const img = square();
    const frozen = Uint8ClampedArray.from(img.data);
    addOutline(img, 4, "#ffffff");
    assert.deepEqual(img.data, frozen);
  });
});

describe("subjectBounds and cropTo", () => {
  it("find the box round the object and nothing for an empty picture", () => {
    const img = pad(solid(5, 4, [1, 2, 3, 255]), 3);
    assert.deepEqual(subjectBounds(img), { x: 3, y: 3, w: 5, h: 4 });
    assert.equal(subjectBounds({ data: new Uint8ClampedArray(40), w: 5, h: 2 }), null);
  });
  it("ignore nearly clear pixels, by the limit given", () => {
    const img = pad(solid(1, 1, [1, 2, 3, 7]), 2);
    assert.equal(subjectBounds(img), null);
    assert.deepEqual(subjectBounds(img, 7), { x: 2, y: 2, w: 1, h: 1 });
  });
  it("crop to exactly the box, in every corner, and the whole picture", () => {
    const img = solid(6, 5, [0, 0, 0, 0]);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) img.data.set([x, y, 9, 255], (y * 6 + x) * 4);
    const c = cropTo(img, { x: 2, y: 1, w: 3, h: 2 });
    assert.deepEqual([c.w, c.h], [3, 2]);
    assert.deepEqual([...c.data.subarray(0, 4)], [2, 1, 9, 255]);
    assert.deepEqual([...c.data.subarray(20, 24)], [4, 2, 9, 255]);
    assert.deepEqual(cropTo(img, { x: 0, y: 0, w: 6, h: 5 }).data, img.data);
    assert.deepEqual([...cropTo(img, { x: 5, y: 4, w: 1, h: 1 }).data], [5, 4, 9, 255]);
    assert.deepEqual([...cropTo(img, { x: 0, y: 0, w: 1, h: 1 }).data], [0, 0, 9, 255]);
  });
});

describe("finishCutout", () => {
  const photo = solid(120, 100, [30, 120, 220, 255]);
  const disc = (cx: number, cy: number, r: number) => {
    const m = new Uint8ClampedArray(120 * 100);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 120; x++) m[y * 120 + x] = Math.hypot(x - cx, y - cy) <= r ? 255 : 0;
    return m;
  };

  it("makes the background clear and keeps the object, with no margin when there is no outline", () => {
    const out = finishCutout(photo, disc(60, 50, 30), null);
    assert.deepEqual([out.image.w, out.image.h, out.pad], [120, 100, 0]);
    assert.equal(alphaAt(out.image, 60, 50), 255);
    assert.equal(alphaAt(out.image, 5, 5), 0);
    assert.ok(out.bounds && Math.abs(out.bounds.w - 61) <= 2 && Math.abs(out.bounds.h - 61) <= 2);
    assert.ok(Math.abs(out.share - (Math.PI * 900) / 12000) < 0.01);
  });

  it("an outline adds room all round, and the object's box includes the ring", () => {
    const out = finishCutout(photo, disc(60, 50, 30), { width: 8, color: "#ffffff" });
    assert.equal(out.pad, 10);
    assert.deepEqual([out.image.w, out.image.h], [140, 120]);
    assert.ok(out.bounds && out.bounds.w >= 61 + 2 * 8 - 3 && out.bounds.w <= 61 + 2 * 8 + 3, `${out.bounds?.w}`);
    const i = ((50 + 10) * 140 + (60 - 30 - 4 + 10)) * 4; // in the ring, left of the disc
    assert.deepEqual([...out.image.data.subarray(i, i + 4)].map(Math.round), [255, 255, 255, 255]);
  });

  it("an outline of 0 width is no outline", () => {
    assert.equal(finishCutout(photo, disc(60, 50, 30), { width: 0, color: "#ffffff" }).pad, 0);
  });

  it("drops specks from the mask before cutting", () => {
    const m = disc(60, 50, 30);
    for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) m[y * 120 + x] = 255;
    const out = finishCutout(photo, m, null);
    assert.equal(alphaAt(out.image, 3, 3), 0);
  });

  it("an empty mask leaves nothing, with no bounds", () => {
    const out = finishCutout(photo, new Uint8ClampedArray(12000), { width: 6, color: "#ffffff" });
    assert.equal(out.bounds, null);
    assert.equal(out.share, 0);
  });

  it("doesn't change the photo or the mask", () => {
    const m = disc(60, 50, 30);
    const frozen = [Uint8ClampedArray.from(photo.data), Uint8ClampedArray.from(m)];
    finishCutout(photo, m, { width: 5, color: "#ffffff" });
    assert.deepEqual([photo.data, m], frozen);
  });
});

describe("visibleRegion", () => {
  it("without a crop it is the whole photo, scaled down to the longest side and never up", () => {
    assert.deepEqual(visibleRegion({}, 4000, 3000, 1200), { sx: 0, sy: 0, sw: 4000, sh: 3000, w: 1200, h: 900 });
    assert.deepEqual(visibleRegion({}, 600, 400, 1200), { sx: 0, sy: 0, sw: 600, sh: 400, w: 600, h: 400 });
  });
  it("with a crop it is that part of the photo, scaled on its own size", () => {
    const r = visibleRegion({ crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } }, 4000, 3000, 1000);
    assert.deepEqual(r, { sx: 1000, sy: 1500, sw: 2000, sh: 1500, w: 1000, h: 750 });
  });
  it("is never smaller than one pixel", () => {
    const r = visibleRegion({}, 100000, 3, 1200);
    assert.deepEqual([r.w, r.h], [1200, 1]);
  });
});

describe("placeCutout", () => {
  const old = { x: 10, y: 20, w: 100, h: 50, rotation: 0 };
  it("a piece that is the whole working picture stays exactly where the layer was", () => {
    assert.deepEqual(placeCutout(old, { w: 200, h: 100 }, { x: 0, y: 0, w: 200, h: 100 }), { x: 10, y: 20, w: 100, h: 50 });
  });
  it("a smaller piece sits where that part of the picture was, at the layer's scale", () => {
    assert.deepEqual(placeCutout(old, { w: 200, h: 100 }, { x: 40, y: 20, w: 80, h: 40 }), { x: 30, y: 30, w: 40, h: 20 });
  });
  it("a piece that starts outside the picture (a border) goes outside the old layer", () => {
    const p = placeCutout(old, { w: 200, h: 100 }, { x: -10, y: -10, w: 220, h: 120 });
    assert.deepEqual(p, { x: 5, y: 15, w: 110, h: 60 });
  });
  it("works for a layer that is stretched, because each direction is scaled on its own", () => {
    const p = placeCutout({ x: 0, y: 0, w: 300, h: 100, rotation: 0 }, { w: 100, h: 100 }, { x: 50, y: 50, w: 10, h: 10 });
    assert.deepEqual(p, { x: 150, y: 50, w: 30, h: 10 });
  });
  it("keeps the object in place on the slide for every turn of the layer: the middle of the piece doesn't move", () => {
    const r = seeded(8);
    for (let k = 0; k < 300; k++) {
      const el = { x: r() * 800, y: r() * 800, w: 50 + r() * 600, h: 50 + r() * 600, rotation: (r() - 0.5) * 360 };
      const work = { w: 100 + Math.floor(r() * 900), h: 100 + Math.floor(r() * 900) };
      const piece = { x: r() * work.w * 0.5 - 10, y: r() * work.h * 0.5 - 10, w: 5 + r() * work.w * 0.5, h: 5 + r() * work.h * 0.5 };
      const turn = (e: { x: number; y: number; rotation: number }, lx: number, ly: number) => {
        const a = (e.rotation * Math.PI) / 180;
        return [e.x + lx * Math.cos(a) - ly * Math.sin(a), e.y + lx * Math.sin(a) + ly * Math.cos(a)];
      };
      // where the middle of the piece was on the slide, inside the old layer
      const was = turn(el, (piece.x + piece.w / 2) * (el.w / work.w), (piece.y + piece.h / 2) * (el.h / work.h));
      const p = placeCutout(el, work, piece);
      const now = turn({ x: p.x, y: p.y, rotation: el.rotation }, p.w / 2, p.h / 2);
      assert.ok(Math.hypot(was[0] - now[0], was[1] - now[1]) < 1e-6, `case ${k}`);
    }
  });
  it("turned a quarter, the piece's corner is carried round with the layer", () => {
    const p = placeCutout({ x: 100, y: 100, w: 100, h: 100, rotation: 90 }, { w: 100, h: 100 }, { x: 20, y: 0, w: 10, h: 10 });
    assert.ok(Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y - 120) < 1e-9);
  });
});
