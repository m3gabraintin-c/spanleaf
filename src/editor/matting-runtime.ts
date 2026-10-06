import { MATTE_SIZE, MODEL_PATH, matteInput } from "@/lib/matting";

/** Just the parts of onnxruntime-web used here, so the real package or a stand-in can be given. */
export interface OrtLike {
  InferenceSession: { create(model: Uint8Array, options: { executionProviders: string[] }): Promise<SessionLike> };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
}
interface SessionLike {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>>;
}

/** Finds the object in a photo: gives the network's 320 by 320 answer, one number per square, higher where the object is. */
type Matter = (data: Uint8ClampedArray, w: number, h: number) => Promise<ArrayLike<number>>;

export async function createMatter(ort: OrtLike, model: Uint8Array): Promise<Matter> {
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  return async (data, w, h) => {
    const input = new ort.Tensor("float32", matteInput(data, w, h), [1, 3, MATTE_SIZE, MATTE_SIZE]);
    const out = await session.run({ [session.inputNames[0]]: input });
    // The network gives seven answers, from rough to fine. The first is the finest.
    return out[session.outputNames[0]].data;
  };
}

/** Why the tool couldn't start, in words for the person using it. */
export class MatterUnavailable extends Error {}

const RUNTIME_PATH = "/models/ort/";
let loading: Promise<Matter> | null = null;

/** Loads the runtime and the model once, the first time a cut-out is asked for. Later calls share the result. */
export function loadMatter(): Promise<Matter> {
  loading ??= (async () => {
    try {
      const [ort, res] = await Promise.all([import("onnxruntime-web/wasm"), fetch(MODEL_PATH)]);
      if (!res.ok) throw new Error(`model ${res.status}`);
      ort.env.wasm.wasmPaths = RUNTIME_PATH;
      ort.env.wasm.proxy = true; // run in a worker, so the page stays usable while it thinks
      ort.env.wasm.numThreads = 1;
      return await createMatter(ort as unknown as OrtLike, new Uint8Array(await res.arrayBuffer()));
    } catch (e) {
      console.error("cutout_model_failed", e);
      throw new MatterUnavailable("The cut-out tool couldn't start. Check your connection and try again.");
    }
  })();
  loading.catch(() => (loading = null)); // a failure isn't remembered, so trying again really tries again
  return loading;
}
