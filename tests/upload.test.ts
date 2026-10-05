import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uploadMany, type BatchProgress } from "@/lib/upload";

const files = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `p${i}.jpg` }) as File);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("uploadMany", () => {
  it("never runs more uploads at once than the limit, and uses the whole limit", async () => {
    let running = 0;
    let peak = 0;
    const r = await uploadMany(files(10), async (f) => {
      running++;
      peak = Math.max(peak, running);
      await wait(5);
      running--;
      return f.name;
    }, { concurrency: 3 });
    assert.equal(peak, 3);
    assert.equal(r.ok.length, 10);
  });

  it("returns results in the order the files were given, however they finish", async () => {
    const delays = [40, 5, 25, 1, 15];
    const r = await uploadMany(files(5), async (f) => {
      await wait(delays[Number(f.name[1])]);
      return f.name;
    }, { concurrency: 5 });
    assert.deepEqual(r.ok.map((x) => x.value), ["p0.jpg", "p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg"]);
  });

  it("calls onSettled in file order, one at a time, even when a later file finishes first", async () => {
    const delays = [30, 1, 1, 10];
    const seen: string[] = [];
    let inHandler = 0;
    await uploadMany(files(4), async (f) => {
      await wait(delays[Number(f.name[1])]);
      return f.name;
    }, {
      concurrency: 4,
      onSettled: async (s) => {
        inHandler++;
        assert.equal(inHandler, 1, "handlers overlapped");
        await wait(2);
        seen.push(s.file.name);
        inHandler--;
      },
    });
    assert.deepEqual(seen, ["p0.jpg", "p1.jpg", "p2.jpg", "p3.jpg"]);
  });

  it("one failure doesn't stop the others, and its message comes back", async () => {
    const settled: (string | undefined)[] = [];
    const r = await uploadMany(files(4), async (f) => {
      if (f.name === "p1.jpg") throw new Error("That file type isn't supported.");
      if (f.name === "p2.jpg") throw "not an Error";
      return f.name;
    }, { onSettled: (s) => void settled.push(s.error) });
    assert.deepEqual(r.ok.map((x) => x.index), [0, 3]);
    assert.deepEqual(r.failed.map((x) => [x.index, x.message]), [[1, "That file type isn't supported."], [2, "That photo couldn't be added."]]);
    assert.deepEqual(settled, [undefined, "That file type isn't supported.", "That photo couldn't be added.", undefined]);
  });

  it("takes only the first maxFiles and says how many it left out", async () => {
    const started: string[] = [];
    const r = await uploadMany(files(35), async (f) => (started.push(f.name), f.name), { maxFiles: 30 });
    assert.equal(r.ok.length, 30);
    assert.equal(r.skipped, 5);
    assert.ok(!started.includes("p30.jpg"));
  });

  it("reports progress from zero to finished, counting failures", async () => {
    const seen: BatchProgress[] = [];
    await uploadMany(files(3), async (f) => {
      if (f.name === "p0.jpg") throw new Error("bad");
      return 1;
    }, { concurrency: 1, onProgress: (p) => seen.push(p) });
    assert.deepEqual(seen[0], { total: 3, finished: 0, failed: 0 });
    assert.deepEqual(seen.at(-1), { total: 3, finished: 3, failed: 1 });
    assert.equal(seen.length, 4);
  });

  it("an empty list resolves at once", async () => {
    const r = await uploadMany([], async () => 1);
    assert.deepEqual(r, { ok: [], failed: [], skipped: 0 });
  });

  it("a handler that throws stops delivery, lets uploads finish, and rejects with that error", async () => {
    let uploaded = 0;
    await assert.rejects(
      uploadMany(files(5), async () => void uploaded++, {
        concurrency: 1,
        onSettled: (s) => {
          if (s.index === 1) throw new Error("canvas broke");
        },
      }),
      /canvas broke/,
    );
    assert.equal(uploaded, 5);
  });
});
