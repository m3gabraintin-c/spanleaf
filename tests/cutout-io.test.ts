import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drawPreview, pngFile, readRegion } from "@/editor/cutout-io";
import type { Rgba } from "@/lib/cutout";

/** A stand-in canvas that records what is done to it, so the browser steps run without a browser. */
function fakeCanvas(pixels?: Uint8ClampedArray, blob: Blob | null = new Blob(["png"], { type: "image/png" })) {
  const made: Fake[] = [];
  interface Fake {
    width: number;
    height: number;
    drawn: unknown[][];
    filled: unknown[][];
    put: Uint8ClampedArray[];
    fills: string[];
    toBlob: (cb: (b: Blob | null) => void, type: string) => void;
    getContext: (kind: string) => unknown;
  }
  const make = () => {
    const c: Fake = {
      width: 0,
      height: 0,
      drawn: [],
      filled: [],
      put: [],
      fills: [],
      toBlob: (cb) => cb(blob),
      getContext: () => {
        const ctx = {
          set fillStyle(v: string) {
            c.fills.push(v);
          },
          drawImage: (...a: unknown[]) => c.drawn.push(a),
          fillRect: (...a: unknown[]) => c.filled.push(a),
          getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: pixels ?? new Uint8ClampedArray(w * h * 4) }),
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: (d: { data: Uint8ClampedArray }) => c.put.push(Uint8ClampedArray.from(d.data)),
          imageSmoothingQuality: "low",
        };
        return ctx;
      },
    };
    made.push(c);
    return c as unknown as HTMLCanvasElement;
  };
  return { made, make };
}
const img = (w: number, h: number) => ({ naturalWidth: w, naturalHeight: h }) as HTMLImageElement;

describe("readRegion", () => {
  it("draws what the layer shows (its crop of the photo) into a canvas of the working size, and reads the pixels back", () => {
    const px = Uint8ClampedArray.from([1, 2, 3, 4]);
    const { made, make } = fakeCanvas(px);
    const photo = img(4000, 3000);
    const out = readRegion(photo, { crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } }, 1000, make);
    assert.deepEqual([out.w, out.h], [1000, 750]);
    assert.equal(out.data, px);
    assert.deepEqual(made[0].drawn[0], [photo, 1000, 1500, 2000, 1500, 0, 0, 1000, 750]);
    assert.deepEqual([made[0].width, made[0].height], [1000, 750]);
  });
  it("with no crop it is the whole photo, and a small photo isn't made bigger", () => {
    const { made, make } = fakeCanvas();
    const out = readRegion(img(600, 400), {}, 1200, make);
    assert.deepEqual([out.w, out.h], [600, 400]);
    assert.deepEqual(made[0].drawn[0].slice(1), [0, 0, 600, 400, 0, 0, 600, 400]);
  });
  it("reads an adjusted copy, which is a canvas and may be smaller than the photo, in the same way", () => {
    const { made, make } = fakeCanvas();
    const copy = { width: 1600, height: 1200 } as HTMLCanvasElement;
    const out = readRegion(copy, { crop: { x: 0, y: 0, w: 0.5, h: 1 } }, 2000, make);
    assert.deepEqual([out.w, out.h], [800, 1200]);
    assert.deepEqual(made[0].drawn[0].slice(1), [0, 0, 800, 1200, 0, 0, 800, 1200]);
  });
});

describe("pngFile", () => {
  const picture: Rgba = { data: Uint8ClampedArray.from([1, 2, 3, 4, 5, 6, 7, 8]), w: 2, h: 1 };
  it("puts the pixels on a canvas of the picture's size and makes a PNG file with the name given", async () => {
    const { made, make } = fakeCanvas();
    const f = await pngFile(picture, "cutout.png", make);
    assert.ok(f instanceof File);
    assert.equal(f.name, "cutout.png");
    assert.equal(f.type, "image/png");
    assert.deepEqual([made[0].width, made[0].height], [2, 1]);
    assert.deepEqual([...made[0].put[0]], [...picture.data]);
  });
  it("says so when the browser can't make the file", async () => {
    const { make } = fakeCanvas(undefined, null);
    await assert.rejects(pngFile(picture, "x.png", make), /couldn't be saved/);
  });
});

describe("drawPreview", () => {
  const big: Rgba = { data: new Uint8ClampedArray(600 * 300 * 4), w: 600, h: 300 };
  it("fits the picture inside the size given without changing its shape, and never makes it bigger", () => {
    const a = fakeCanvas();
    const canvas = a.make();
    drawPreview(canvas, big, 300, a.make);
    assert.deepEqual([canvas.width, canvas.height], [300, 150]);
    const small = fakeCanvas();
    const c2 = small.make();
    drawPreview(c2, { data: new Uint8ClampedArray(40 * 20 * 4), w: 40, h: 20 }, 300, small.make);
    assert.deepEqual([c2.width, c2.height], [40, 20]);
  });
  it("paints a chequerboard under the picture, with both colours, and then the picture once", () => {
    const a = fakeCanvas();
    const canvas = a.make();
    drawPreview(canvas, big, 300, a.make);
    const board = (a.made[0] as unknown as { filled: unknown[][]; fills: string[]; drawn: unknown[][] });
    assert.equal(board.filled.length, Math.ceil(300 / 12) * Math.ceil(150 / 12));
    assert.deepEqual([...new Set(board.fills)].sort(), ["#bdbdbd", "#e6e6e6"]);
    assert.equal(board.drawn.length, 1);
    assert.deepEqual(board.drawn[0].slice(1), [0, 0, 300, 150]);
  });
  it("never makes a canvas with no size", () => {
    const a = fakeCanvas();
    const canvas = a.make();
    drawPreview(canvas, { data: new Uint8ClampedArray(4), w: 1, h: 1 }, 300, a.make);
    assert.ok(canvas.width >= 1 && canvas.height >= 1);
  });
});
