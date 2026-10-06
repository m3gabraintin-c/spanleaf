import { del, get, keys, set } from "idb-keyval";
import { Project, newDesign, uid, FormatKey } from "./carouselModel";
import { buildTemplate } from "./templates";

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
  await Promise.all(expired.map((p) => del(KEY(p.id))));
  return found
    .filter((p): p is Project => !!p && !p.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getProject = async (id: string): Promise<Project | null> => {
  const p = await get<Project>(KEY(id));
  return p && !p.deletedAt ? p : null;
};

export const saveProject = async (p: Project): Promise<void> => {
  await set(KEY(p.id), { ...p, updatedAt: Date.now() });
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
