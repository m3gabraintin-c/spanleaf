import { del, get, keys, set } from "idb-keyval";
import { Project, newDesign, uid, FormatKey } from "./carouselModel";
import { buildTemplate } from "./templates";
import { removeClip } from "./videoClips";
import { deleteHistory } from "./editHistory";

/**
 * Projects live in this browser (IndexedDB). Deleting moves a project to the bin,
 * where it can be restored for 30 days.
 */

const KEY = (id: string) => `spanleaf:project:${id}`;
const BIN_DAYS = 30;

export const listProjects = async (): Promise<Project[]> => {
  const all = await keys();
  const found = await Promise.all(
    all
      .filter((k): k is string => typeof k === "string" && k.startsWith("spanleaf:project:"))
      .map((k) => get<Project>(k)),
  );
  const cutoff = Date.now() - BIN_DAYS * 864e5;
  const expired = found.filter((p): p is Project => !!p && !!p.deletedAt && p.deletedAt < cutoff);
  await Promise.all(expired.flatMap((p) => [del(KEY(p.id)), deleteHistory(p.id)]));
  // A clip is removed only when no project left still uses it (a copied project shares its clips).
  const kept = found.filter((p): p is Project => !!p && !expired.includes(p));
  const used = new Set(kept.flatMap((p) => p.design.layers.map((l) => l.mediaKey).filter(Boolean)));
  const gone = expired.flatMap((p) => p.design.layers.map((l) => l.mediaKey)).filter((k): k is string => !!k && !used.has(k));
  await Promise.all(gone.map(removeClip));
  return found
    .filter((p): p is Project => !!p && !p.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getProject = async (id: string): Promise<Project | null> => {
  const p = await get<Project>(KEY(id));
  return p && !p.deletedAt ? p : null;
};

/** Thrown when the browser has no room left to save. */
export class StorageFullError extends Error {
  constructor() {
    super("This browser is out of space for Spanleaf. Delete projects you don't need, or download a backup and remove large videos.");
  }
}

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);

export const saveProject = async (p: Project): Promise<void> => {
  try {
    await set(KEY(p.id), { ...p, updatedAt: Date.now() });
  } catch (e) {
    throw isQuota(e) ? new StorageFullError() : e;
  }
};

/** How much of the browser's space this site uses, when the browser says. */
export const storageUse = async (): Promise<{ used: number; quota: number } | null> => {
  try {
    const est = await navigator.storage?.estimate?.();
    return est?.usage != null && est.quota ? { used: est.usage, quota: est.quota } : null;
  } catch {
    return null;
  }
};

/** Puts an imported project in as a new one, with new ids so it never clashes with an existing project. */
export const addImportedProject = async (p: Omit<Project, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Project> => {
  const now = Date.now();
  const fresh: Project = { ...p, id: uid(), createdAt: now, updatedAt: now, deletedAt: null };
  fresh.design = { ...fresh.design, layers: fresh.design.layers.map((l) => ({ ...l, id: uid() })) };
  try {
    await set(KEY(fresh.id), fresh);
  } catch (e) {
    throw isQuota(e) ? new StorageFullError() : e;
  }
  return fresh;
};

export const createProject = async (
  title: string,
  format: FormatKey,
  slideCount: number,
  template?: string,
): Promise<Project> => {
  const now = Date.now();
  const p: Project = {
    id: uid(),
    title: title.trim().slice(0, 80) || "Untitled",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    design: (template && buildTemplate(template, format)) || newDesign(format, slideCount),
  };
  await set(KEY(p.id), p);
  return p;
};

export const renameProject = async (id: string, title: string): Promise<void> => {
  const p = await get<Project>(KEY(id));
  if (!p || p.deletedAt) throw new Error("That project doesn't exist.");
  await set(KEY(id), { ...p, title: title.trim().slice(0, 80) || "Untitled", updatedAt: Date.now() });
};

export const duplicateProject = async (id: string): Promise<Project> => {
  const p = await get<Project>(KEY(id));
  if (!p || p.deletedAt) throw new Error("That project doesn't exist.");
  const now = Date.now();
  const copy: Project = {
    ...structuredClone(p),
    id: uid(),
    title: `${p.title.slice(0, 74)} copy`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  copy.design.layers = copy.design.layers.map((l) => ({ ...l, id: uid() }));
  await set(KEY(copy.id), copy);
  return copy;
};

export const deleteProject = async (id: string): Promise<void> => {
  const p = await get<Project>(KEY(id));
  if (!p || p.deletedAt) throw new Error("That project doesn't exist.");
  await set(KEY(id), { ...p, deletedAt: Date.now() });
};

export const restoreProject = async (id: string): Promise<void> => {
  const p = await get<Project>(KEY(id));
  if (!p || !p.deletedAt) throw new Error("That project can't be restored.");
  await set(KEY(id), { ...p, deletedAt: null });
};
