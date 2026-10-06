// Gets the files the Cut out tool needs into public/models, which is not committed:
//   u2netp.onnx   the small U²-Net model (Apache 2.0 licence), about 4.6 MB, from the rembg project's release
//   ort/          the WebAssembly runtime from the onnxruntime-web package (MIT licence)
// The model is checked against a checksum, so a damaged or swapped download is refused.
// Run: npm run models   (the build runs it too)
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx";
const MODEL_SHA256 = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8";
const OUT = path.resolve("public/models");
const RUNTIME = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = (p) => stat(p).then(() => true, () => false);

async function model() {
  const file = path.join(OUT, "u2netp.onnx");
  if ((await exists(file)) && sha256(await readFile(file)) === MODEL_SHA256) return "already there";
  const res = await fetch(MODEL_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Couldn't download the cut-out model: ${res.status} from ${MODEL_URL}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (sha256(bytes) !== MODEL_SHA256) throw new Error("The cut-out model downloaded, but its checksum is wrong. It was not saved.");
  await writeFile(file, bytes);
  return "downloaded";
}

async function runtime() {
  const from = path.resolve("node_modules/onnxruntime-web/dist");
  await mkdir(path.join(OUT, "ort"), { recursive: true });
  for (const name of RUNTIME) {
    if (!(await exists(path.join(from, name)))) throw new Error(`${name} is missing from onnxruntime-web. Run npm install first.`);
    await copyFile(path.join(from, name), path.join(OUT, "ort", name));
  }
}

await mkdir(OUT, { recursive: true });
try {
  console.log(`cut-out model: ${await model()}`);
  await runtime();
  console.log("cut-out runtime: copied");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
