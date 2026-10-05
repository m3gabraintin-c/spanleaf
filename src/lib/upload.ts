export interface BatchProgress {
  total: number;
  /** Uploads that have finished, whether they worked or not. */
  finished: number;
  failed: number;
}

interface Settled<T> {
  /** Position in the list the caller passed in. */
  index: number;
  file: File;
  value?: T;
  /** A message safe to show the person. Set when the upload failed. */
  error?: string;
}

interface BatchResult<T> {
  ok: { index: number; file: File; value: T }[];
  failed: { index: number; file: File; message: string }[];
  /** Files left out because the batch was over maxFiles. */
  skipped: number;
}

/**
 * Uploads many files with a few running at once. One bad file doesn't stop the rest.
 *
 * onSettled is called once per file, always in the order the files were given, and each call is awaited
 * before the next starts. A photo that finishes early waits for the ones before it, so adding photos to
 * a canvas keeps the person's order however the network behaves.
 */
export async function uploadMany<T>(
  files: File[],
  upload: (file: File) => Promise<T>,
  opts: {
    concurrency?: number;
    maxFiles?: number;
    onProgress?: (p: BatchProgress) => void;
    onSettled?: (r: Settled<T>) => void | Promise<void>;
  } = {},
): Promise<BatchResult<T>> {
  const max = opts.maxFiles ?? Infinity;
  const list = files.slice(0, max);
  const skipped = Math.max(0, files.length - list.length);
  const settled: (Settled<T> | undefined)[] = new Array(list.length);
  const progress: BatchProgress = { total: list.length, finished: 0, failed: 0 };
  opts.onProgress?.({ ...progress });

  let nextToStart = 0;
  let nextToDeliver = 0;
  let draining = false;
  let drainDone: Promise<void> = Promise.resolve();
  let handlerError: unknown;

  // Delivers every settled file that is next in line. Only one loop runs at a time. The flag is set
  // before the loop starts, because a loop with nothing to deliver finishes before drain() returns.
  const drain = () => {
    if (draining) return drainDone;
    draining = true;
    drainDone = (async () => {
      try {
        while (nextToDeliver < list.length && settled[nextToDeliver]) {
          await opts.onSettled?.(settled[nextToDeliver]!);
          nextToDeliver++;
        }
      } catch (e) {
        handlerError ??= e;
        nextToDeliver = list.length; // stop delivering, keep uploading
      } finally {
        draining = false;
      }
    })();
    return drainDone;
  };

  const worker = async () => {
    while (nextToStart < list.length) {
      const index = nextToStart++;
      const file = list[index];
      try {
        settled[index] = { index, file, value: await upload(file) };
      } catch (e) {
        settled[index] = { index, file, error: e instanceof Error && e.message ? e.message : "That photo couldn't be added." };
        progress.failed++;
      }
      progress.finished++;
      opts.onProgress?.({ ...progress });
      void drain();
    }
  };

  const n = Math.max(1, Math.min(opts.concurrency ?? 3, list.length));
  await Promise.all(Array.from({ length: list.length === 0 ? 0 : n }, worker));
  await drain();
  if (handlerError) throw handlerError;

  const ok: BatchResult<T>["ok"] = [];
  const failed: BatchResult<T>["failed"] = [];
  // Every file was started, so every slot is filled by now.
  for (const r of settled as Settled<T>[]) {
    if (r.error !== undefined) failed.push({ index: r.index, file: r.file, message: r.error });
    else ok.push({ index: r.index, file: r.file, value: r.value as T });
  }
  return { ok, failed, skipped };
}
