import { del, get, set } from "idb-keyval";

/** Video clips are kept in this browser apart from the project, because they are large. */

export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 90;

const KEY = (k: string) => `spanleaf:media:${k}`;

/**
 * A clip is kept as its bytes and type rather than as a file object. Safari in private browsing, and some other
 * browsers, refuse to keep file objects in storage but accept plain bytes.
 */
type Stored = { type: string; bytes: ArrayBuffer } | Blob;

export type ClipInfo = { key: string; width: number; height: number; duration: number; name: string };

/** Reads a clip's size and length, keeps it, and returns where it is. Throws a message fit for the person. */
export const addClip = async (file: File): Promise<ClipInfo> => {
  if (!VIDEO_TYPES.includes(file.type)) throw new Error(`${file.name} isn't an MP4, WebM or MOV video.`);
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name} is larger than 200 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const meta = await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
      v.onerror = () => reject(new Error(`${file.name} couldn't be opened. This browser may not play it.`));
      v.src = url;
    });
    if (!meta.width || !meta.height) throw new Error(`${file.name} has no picture.`);
    if (meta.duration > MAX_VIDEO_SECONDS) throw new Error(`${file.name} is longer than ${MAX_VIDEO_SECONDS} seconds.`);
    const key = crypto.randomUUID();
    try {
      await set(KEY(key), { type: file.type, bytes: await file.arrayBuffer() } satisfies Stored);
    } catch {
      throw new Error("This browser wouldn't keep the video. It may be out of space, or in private browsing.");
    }
    return { key, ...meta, name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Video" };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const urls = new Map<string, string>();

/** A playable address for a kept clip, or null if it's gone (made in another browser, or storage was cleared). */
export const clipUrl = async (key: string): Promise<string | null> => {
  const have = urls.get(key);
  if (have) return have;
  const stored = await get<Stored>(KEY(key));
  if (!stored) return null;
  const blob = stored instanceof Blob ? stored : new Blob([stored.bytes], { type: stored.type });
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
};

export const removeClip = (key: string) => del(KEY(key));
