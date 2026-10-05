import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createMatter, type OrtLike } from "@/editor/matting-runtime";
import { cleanMask } from "@/lib/cutout";
import { MATTE_SIZE, matteOutput } from "@/lib/matting";

const MODEL = "public/models/u2netp.onnx";
const script = readFileSync("scripts/fetch-model.mjs", "utf8");
const expected = /MODEL_SHA256 = "([0-9a-f]{64})"/.exec(script)?.[1];
const have = existsSync(MODEL);

describe("the model download script", () => {
  it("names a checksum, a download address and the runtime files, and checks the download against the checksum", () => {
    assert.match(expected ?? "", /^[0-9a-f]{64}$/);
    assert.match(script, /MODEL_URL = "https:\/\/github\.com\/danielgatis\/rembg\/releases\/download\/[^"]+\/u2netp\.onnx"/);
    assert.match(script, /ort-wasm-simd-threaded\.wasm/);
    assert.match(script, /sha256\(bytes\) !== MODEL_SHA256/);
    assert.match(script, /process\.exit\(1\)/);
  });
  it("is in the build, so a deploy has the model", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    assert.match(pkg.scripts.build, /scripts\/fetch-model\.mjs/);
    assert.equal(pkg.scripts.models, "node scripts/fetch-model.mjs");
    assert.ok(pkg.dependencies["onnxruntime-web"]);
  });
  it("the model that is here (if there is one) is the one the checksum names", { skip: !have && "run npm run models to get the model" }, () => {
    assert.equal(createHash("sha256").update(readFileSync(MODEL)).digest("hex"), expected);
  });
  it("is not committed: the downloaded files are ignored by git", () => {
    assert.match(readFileSync(".gitignore", "utf8"), /^public\/models\/$/m);
  });
});

/** A photo of a clear object on a plain background: an orange ball, shaded, on pale grey. */
function ball(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.32;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const i = (y * w + x) * 4;
      if (d <= r) {
        const light = 1 - (d / r) * 0.45 - ((x - cx) / r) * 0.12;
        data.set([255 * light, 130 * light, 30 * light, 255], i);
      } else data.set([222, 224, 226, 255], i);
    }
  }
  return data;
}

/** The package on one thread with no worker, so it runs the same way under test as in a page's worker. */
async function runtime() {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  return ort as unknown as OrtLike;
}

describe("the real model on a real run", { skip: !have && "run npm run models to get the model" }, () => {
  it("finds a clear object: solid in the middle, clear at the corners, and a sensible share of the photo", async () => {
    const matter = await createMatter(await runtime(), new Uint8Array(readFileSync(MODEL)));
    const [w, h] = [400, 300];
    const pred = await matter(ball(w, h), w, h);
    assert.equal(pred.length, MATTE_SIZE * MATTE_SIZE);
    assert.ok(Array.from(pred).every(Number.isFinite));

    const { mask, share } = cleanMask(matteOutput(pred, w, h), w, h);
    assert.ok(mask[(h / 2) * w + w / 2] >= 200, "the middle of the ball is kept");
    for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) assert.ok(mask[y * w + x] <= 40, `the corner ${x},${y} is cleared`);
    assert.ok(share > 0.1 && share < 0.6, `the ball covers about a third of the photo, got ${share}`);
  });

  it("gives the same answer for the same photo twice", async () => {
    const matter = await createMatter(await runtime(), new Uint8Array(readFileSync(MODEL)));
    const a = Array.from(await matter(ball(200, 150), 200, 150));
    const b = Array.from(await matter(ball(200, 150), 200, 150));
    assert.deepEqual(a, b);
  });
});
