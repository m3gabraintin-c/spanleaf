import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMatter, loadMatter, MatterUnavailable, type OrtLike } from "@/editor/matting-runtime";
import { MATTE_SIZE } from "@/lib/matting";

/** Stands in for onnxruntime-web, recording how it is used. */
function fakeOrt(opts: { fail?: "create" | "run"; outputs?: string[] } = {}) {
  const log: { created: unknown[][]; tensors: unknown[][]; runs: Record<string, unknown>[]; instances: unknown[] } = { created: [], tensors: [], runs: [], instances: [] };
  const outputNames = opts.outputs ?? ["a", "b", "c"];
  const ort: OrtLike = {
    InferenceSession: {
      async create(model, options) {
        log.created.push([model, options]);
        if (opts.fail === "create") throw new Error("bad model");
        return {
          inputNames: ["input.1"],
          outputNames,
          async run(feeds) {
            log.runs.push(feeds);
            if (opts.fail === "run") throw new Error("ran out of memory");
            return Object.fromEntries(outputNames.map((n, i) => [n, { data: Float32Array.from([i, i, i]) }]));
          },
        };
      },
    },
    Tensor: class {
      constructor(...args: unknown[]) {
        log.tensors.push(args);
        log.instances.push(this);
      }
    } as unknown as OrtLike["Tensor"],
  };
  return { ort, log };
}

describe("createMatter", () => {
  it("makes a session from the model's bytes on the WebAssembly runtime", async () => {
    const { ort, log } = fakeOrt();
    const bytes = new Uint8Array([1, 2, 3]);
    await createMatter(ort, bytes);
    assert.equal(log.created.length, 1);
    assert.equal(log.created[0][0], bytes);
    assert.deepEqual(log.created[0][1], { executionProviders: ["wasm"] });
  });

  it("feeds the network a 1 by 3 by 320 by 320 tensor of the photo, under the network's own input name, and gives back the first answer", async () => {
    const { ort, log } = fakeOrt();
    const matter = await createMatter(ort, new Uint8Array(1));
    const photo = new Uint8ClampedArray(64 * 48 * 4).fill(120);
    const answer = await matter(photo, 64, 48);
    const [type, data, dims] = log.tensors[0] as [string, Float32Array, number[]];
    assert.equal(type, "float32");
    assert.equal(data.length, 3 * MATTE_SIZE * MATTE_SIZE);
    assert.deepEqual(dims, [1, 3, MATTE_SIZE, MATTE_SIZE]);
    assert.deepEqual(Object.keys(log.runs[0]), ["input.1"]);
    assert.equal(log.runs[0]["input.1"], log.instances[0], "the tensor that was made is the one fed in");
    assert.deepEqual(Array.from(answer), [0, 0, 0], "the first of the network's answers, not the last");
  });

  it("can be used again and again with the one session", async () => {
    const { ort, log } = fakeOrt();
    const matter = await createMatter(ort, new Uint8Array(1));
    const photo = new Uint8ClampedArray(16 * 16 * 4);
    await matter(photo, 16, 16);
    await matter(photo, 16, 16);
    assert.equal(log.created.length, 1);
    assert.equal(log.runs.length, 2);
  });

  it("passes on a model that won't load, and a run that fails", async () => {
    await assert.rejects(createMatter(fakeOrt({ fail: "create" }).ort, new Uint8Array(1)), /bad model/);
    const matter = await createMatter(fakeOrt({ fail: "run" }).ort, new Uint8Array(1));
    await assert.rejects(matter(new Uint8ClampedArray(4), 1, 1), /ran out of memory/);
  });
});

describe("loadMatter", () => {
  it("says in plain words that the tool couldn't start when the model can't be fetched, and tries again next time", async () => {
    const real = globalThis.fetch;
    const realError = console.error;
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => (urls.push(String(url)), new Response("not found", { status: 404 }))) as unknown as typeof fetch;
    console.error = () => {};
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        await assert.rejects(loadMatter(), (e: Error) => e instanceof MatterUnavailable && /couldn't start/.test(e.message) && !/404/.test(e.message));
      }
    } finally {
      globalThis.fetch = real;
      console.error = realError;
    }
    assert.deepEqual(urls, ["/models/u2netp.onnx", "/models/u2netp.onnx"], "asked twice, so a failure isn't remembered");
  });
});
