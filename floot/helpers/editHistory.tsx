import { del, get, set } from "idb-keyval";
import { Design } from "./carouselModel";

/**
 * Undo that lasts: the steps you can undo are kept in this browser with the project, so they are still there after
 * a reload. Photos are large and most steps share them, so each picture is kept once and the steps point to it.
 */

export const HISTORY_KEEP = 30;
const BIG = 200;
const MAX_CHARS = 80_000_000;
const KEY = (id: string) => `spanleaf:history:${id}`;

export type PackedHistory = { v: 1; blobs: string[]; past: Design[] };

export const packHistory = (past: Design[]): PackedHistory => {
  const index = new Map<string, number>();
  const blobs: string[] = [];
  const ref = (s: string) => {
    let i = index.get(s);
    if (i === undefined) {
      i = blobs.length;
      blobs.push(s);
      index.set(s, i);
    }
    return `@@${i}`;
  };
  return {
    v: 1,
    blobs,
    past: past.slice(-HISTORY_KEEP).map((d) => ({ ...d, layers: d.layers.map((l) => (l.src && l.src.length > BIG ? { ...l, src: ref(l.src) } : l)) })),
  };
};

export const unpackHistory = (p: PackedHistory): Design[] =>
  p.past.map((d) => ({ ...d, layers: d.layers.map((l) => (l.src?.startsWith("@@") ? { ...l, src: p.blobs[Number(l.src.slice(2))] } : l)) }));

/** Keeps the undo steps. Skipped when they would take too much room; undo then works until the page closes, as before. */
export const saveHistory = async (projectId: string, past: Design[]) => {
  const packed = packHistory(past);
  if (packed.blobs.reduce((n, b) => n + b.length, 0) > MAX_CHARS) return;
  try {
    await set(KEY(projectId), packed);
  } catch {
    /* out of room: undo just won't outlast a reload */
  }
};

export const loadHistory = async (projectId: string): Promise<Design[]> => {
  try {
    const p = await get<PackedHistory>(KEY(projectId));
    return p?.v === 1 ? unpackHistory(p) : [];
  } catch {
    return [];
  }
};

export const deleteHistory = (projectId: string) => del(KEY(projectId)).catch(() => undefined);