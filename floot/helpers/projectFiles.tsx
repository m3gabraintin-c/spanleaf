import { z } from "zod";
import { get, set } from "idb-keyval";
import { FORMAT_KEYS, MAX_LAYERS, MAX_SLIDES, Project } from "./carouselModel";
import { addImportedProject } from "./projectStorage";

/**
 * Backups: a project, with its videos, as one file you can keep, move to another device, and open again. The file
 * is plain JSON, ending in .spanleaf.
 */

const FILE_KIND = "spanleaf-project";
const MAX_FILE_BYTES = 400 * 1024 * 1024;

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

type StoredClip = { type: string; bytes: ArrayBuffer } | Blob;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "carousel";

/** Builds the backup file for a project. Videos that aren't in this browser any more are left out and counted. */
export const backupFile = async (p: Project): Promise<{ blob: Blob; name: string; missingVideos: number }> => {
  const clips: Record<string, { type: string; data: string }> = {};
  let missingVideos = 0;
  for (const key of new Set(p.design.layers.map((l) => l.mediaKey).filter((k): k is string => !!k))) {
    const stored = await get<StoredClip>(`spanleaf:media:${key}`);
    if (!stored) {
      missingVideos++;
      continue;
    }
    const type = stored instanceof Blob ? stored.type : stored.type;
    const bytes = stored instanceof Blob ? await stored.arrayBuffer() : stored.bytes;
    clips[key] = { type, data: toBase64(bytes) };
  }
  const { id: _id, deletedAt: _d, ...rest } = p;
  const body = JSON.stringify({ kind: FILE_KIND, version: 1, savedAt: new Date().toISOString(), project: rest, clips });
  return { blob: new Blob([body], { type: "application/json" }), name: `${slug(p.title)}.spanleaf`, missingVideos };
};

const LayerShape = z.object({ id: z.string(), type: z.enum(["image", "text", "sticker", "drawing", "video", "shape"]), x: z.number(), y: z.number(), w: z.number(), h: z.number(), rotation: z.number() }).passthrough();
const FileShape = z.object({
  kind: z.literal(FILE_KIND),
  version: z.literal(1),
  project: z.object({
    title: z.string().max(200),
    thumb: z.string().optional(),
    design: z
      .object({
        format: z.enum(FORMAT_KEYS as [string, ...string[]]),
        slideCount: z.number().int().min(1).max(MAX_SLIDES),
        background: z.string(),
        layers: z.array(LayerShape).max(MAX_LAYERS),
      })
      .passthrough(),
  }),
  clips: z.record(z.object({ type: z.string(), data: z.string() })).default({}),
});

/** Opens a backup file and adds it as a new project. Throws a message fit for the person. */
export const restoreFile = async (file: File): Promise<Project> => {
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is too large to open (over 400 MB).");
  let parsed;
  try {
    parsed = FileShape.parse(JSON.parse(await file.text()));
  } catch {
    throw new Error(`${file.name} isn't a Spanleaf backup, or it is damaged.`);
  }
  for (const [key, clip] of Object.entries(parsed.clips)) {
    await set(`spanleaf:media:${key}`, { type: clip.type, bytes: fromBase64(clip.data) });
  }
  const p = parsed.project as unknown as Omit<Project, "id" | "createdAt" | "updatedAt" | "deletedAt">;
  return addImportedProject({ ...p, title: p.title.slice(0, 80) || "Untitled" });
};

export const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
