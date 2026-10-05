import { createStore, get, set, keys, getMany } from "idb-keyval";
import { DocSchema, EMPTY_DOC, mediaIdsOf, uid } from "@/lib/doc";
import { MAX_SLIDES_FREE, FORMAT_KEYS } from "@/lib/formats";
import { prepareImage } from "@/lib/image";
import { FALLBACK_PLAN, FALLBACK_TAGS, layoutCarousel } from "@/lib/compose";
import {
  DataError,
  type DataLayer,
  type MediaRecord,
  type MediaUrls,
  type Me,
  type Project,
  type ProjectSummary,
} from "./types";

/**
 * Fake data layer: everything lives in this browser's IndexedDB. It follows the same rules as the
 * real API (revision check on save, slide limit, validation) so the editor's behaviour doesn't
 * change when the real backend is switched on. Nothing here talks to a server.
 */

const store = typeof indexedDB === "undefined" ? undefined : createStore("carousel-fake", "kv");

interface StoredProject extends Project {
  mediaIds: string[];
  createdAt: string;
  /** Who owns it. Rows from before this field existed are claimed by whoever opens them first. */
  ownerId?: string;
}
interface StoredMedia {
  record: MediaRecord;
  full: Blob;
  thumb: Blob;
  ownerId?: string;
}

/** The unsaved document, written synchronously when the page is closing. See saveProjectOnExit. */
const pendingKey = (id: string) => `carousel-fake:pending:${id}`;
interface Pending {
  rev: number;
  doc?: unknown;
  title?: string;
}

const URL_CACHE = new Map<string, MediaUrls>();

function readPending(id: string): Pending | null {
  try {
    const raw = localStorage.getItem(pendingKey(id));
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}
function clearPending(id: string) {
  try {
    localStorage.removeItem(pendingKey(id));
  } catch {
    // ignore
  }
}

async function requireUser(): Promise<Me> {
  const me = await fake.getMe();
  if (!me) throw new DataError("UNAUTHENTICATED", "Sign in first.");
  return me;
}

const fake: DataLayer = {
  capabilities: { google: false, billing: false },

  async getMe() {
    const user = await get<{ id: string; email: string }>("auth:user", store);
    if (!user) return null;
    return { ...user, premium: false, maxSlides: MAX_SLIDES_FREE };
  },

  async signIn(email) {  // the destination only matters for the real email link
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new DataError("INVALID", "Enter a valid email address.");
    const existing = await get<{ id: string; email: string }>("auth:user", store);
    const user = existing?.email === clean ? existing : { id: uid(), email: clean };
    await set("auth:user", user, store);
    return { status: "signed_in", me: { ...user, premium: false, maxSlides: MAX_SLIDES_FREE } };
  },

  async signOut() {
    // Keeps the projects. Only the session ends, like a real sign out.
    const { del } = await import("idb-keyval");
    await del("auth:user", store);
  },

  async completeOnboarding() {},

  async startCheckout() {
    throw new DataError("INTERNAL", "Billing isn't connected in this build.");
  },

  async openPortal() {
    throw new DataError("INTERNAL", "Billing isn't connected in this build.");
  },

  async deleteAccount() {
    await requireUser();
    const { clear } = await import("idb-keyval");
    await clear(store);
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("carousel-fake:")) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },

  async listProjects() {
    const all = await keys(store);
    const ids = all.filter((k): k is string => typeof k === "string" && k.startsWith("project:"));
    const me = await requireUser();
    const rows = (await getMany<StoredProject>(ids, store)).filter((r): r is StoredProject => !!r && (!r.ownerId || r.ownerId === me.id));
    return rows
      .map<ProjectSummary>((p) => ({ id: p.id, title: p.title, format: p.format, slideCount: p.slideCount, updatedAt: p.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async createProject({ format, slideCount, title }) {
    const me = await requireUser();
    if (!FORMAT_KEYS.includes(format)) throw new DataError("INVALID", "Unknown format.");
    if (!Number.isInteger(slideCount) || slideCount < 1) throw new DataError("INVALID", "Slide count must be at least 1.");
    if (slideCount > me.maxSlides) throw new DataError("LIMIT_REACHED", `Your plan allows up to ${me.maxSlides} slides.`);
    const now = new Date().toISOString();
    const p: StoredProject = {
      id: uid(),
      title: title?.trim() || "Untitled",
      format,
      slideCount,
      doc: structuredClone(EMPTY_DOC),
      rev: 0,
      mediaIds: [],
      createdAt: now,
      updatedAt: now,
      ownerId: me.id,
    };
    await set(`project:${p.id}`, p, store);
    return p;
  },

  async composeProject({ mediaIds, format = "portrait_4_5", title, seed }) {
    const me = await requireUser();
    if (mediaIds.length === 0) throw new DataError("INVALID", "Choose at least one photo.");
    if (new Set(mediaIds).size !== mediaIds.length) throw new DataError("INVALID", "The same photo was chosen twice.");
    const media = await Promise.all(mediaIds.map((id) => get<StoredMedia>(`media:${id}`, store)));
    if (media.some((m) => !m || (m.ownerId && m.ownerId !== me.id))) throw new DataError("INVALID", "Some of those photos aren't yours or aren't ready.");
    // No model in the browser demo, so the carousel gets the plain defaults.
    const { doc, slideCount } = layoutCarousel(
      media.map((m) => ({ id: m!.record.id, width: m!.record.width, height: m!.record.height, name: m!.record.name, tags: FALLBACK_TAGS })),
      FALLBACK_PLAN,
      { format, maxSlides: me.maxSlides, seed: seed ?? Math.floor(Math.random() * 1_000_000) },
    );
    const now = new Date().toISOString();
    const p: StoredProject = {
      id: uid(),
      title: title?.trim() || "My carousel",
      format,
      slideCount,
      doc: DocSchema.parse(doc),
      rev: 1,
      mediaIds: mediaIdsOf(doc),
      createdAt: now,
      updatedAt: now,
      ownerId: me.id,
    };
    await set(`project:${p.id}`, p, store);
    return p;
  },

  async getProject(id) {
    const me = await requireUser();
    let p = await get<StoredProject>(`project:${id}`, store);
    if (!p || (p.ownerId && p.ownerId !== me.id)) throw new DataError("NOT_FOUND", "That project doesn't exist.");
    if (!p.ownerId) {
      p = { ...p, ownerId: me.id };
      await set(`project:${id}`, p, store);
    }
    // A save that was cut off by closing the tab. If nothing newer was saved since, apply it now.
    const journal = readPending(id);
    if (journal) {
      clearPending(id);
      if (journal.rev === p.rev) {
        try {
          await fake.saveProject(id, journal as { rev: number });
          p = (await get<StoredProject>(`project:${id}`, store)) ?? p;
        } catch {
          // an invalid or stale journal is dropped
        }
      }
    }
    return p;
  },

  saveProjectOnExit(id, patch) {
    try {
      localStorage.setItem(pendingKey(id), JSON.stringify({ rev: patch.rev, doc: patch.doc, title: patch.title } satisfies Pending));
    } catch {
      // storage full or blocked. The normal autosave is all there is.
    }
  },

  async saveProject(id, patch) {
    const me = await requireUser();
    const key = `project:${id}`;
    const p = await get<StoredProject>(key, store);
    if (!p || (p.ownerId && p.ownerId !== me.id)) throw new DataError("NOT_FOUND", "That project doesn't exist.");
    // Compare and set. The real API does this in one conditional UPDATE.
    if (p.rev !== patch.rev) throw new DataError("REV_CONFLICT", "This project was changed somewhere else.");
    const next: StoredProject = { ...p };
    if (patch.doc) {
      const parsed = DocSchema.safeParse(patch.doc);
      if (!parsed.success) throw new DataError("INVALID", "The project data isn't valid.");
      if (JSON.stringify(parsed.data).length > 2 * 1024 * 1024) throw new DataError("INVALID", "This project is too large to save.");
      next.doc = parsed.data;
      next.mediaIds = mediaIdsOf(parsed.data);
    }
    if (patch.title !== undefined) next.title = patch.title.trim() || "Untitled";
    if (patch.format !== undefined) next.format = patch.format;
    if (patch.slideCount !== undefined) {
      const me = await requireUser();
      if (patch.slideCount > p.slideCount && patch.slideCount > me.maxSlides) {
        throw new DataError("LIMIT_REACHED", `Your plan allows up to ${me.maxSlides} slides.`);
      }
      next.slideCount = patch.slideCount;
    }
    next.rev = p.rev + 1;
    next.updatedAt = new Date().toISOString();
    await set(key, next, store);
    return { rev: next.rev };
  },

  async uploadImage(file) {
    await requireUser();
    const prepared = await prepareImage(file);
    const record: MediaRecord = {
      id: uid(),
      kind: "image",
      mimeType: prepared.mimeType,
      bytes: prepared.full.size,
      width: prepared.width,
      height: prepared.height,
      name: file.name || "Photo",
    };
    const me = await requireUser();
    await set(`media:${record.id}`, { record, full: prepared.full, thumb: prepared.thumb, ownerId: me.id } satisfies StoredMedia, store);
    return record;
  },

  async getMediaUrls(ids) {
    const me = await requireUser();
    const out: Record<string, MediaUrls> = {};
    for (const id of ids) {
      const cached = URL_CACHE.get(`${me.id}:${id}`);
      if (cached) {
        out[id] = cached;
        continue;
      }
      const m = await get<StoredMedia>(`media:${id}`, store);
      if (!m || (m.ownerId && m.ownerId !== me.id)) continue;
      const urls = { url: URL.createObjectURL(m.full), thumbUrl: URL.createObjectURL(m.thumb) };
      URL_CACHE.set(`${me.id}:${id}`, urls);
      out[id] = urls;
    }
    return out;
  },
};

export default fake;

/** Media records are needed to rebuild element names and sizes when a project reopens. */
export async function getMediaRecord(id: string): Promise<MediaRecord | undefined> {
  return (await get<StoredMedia>(`media:${id}`, store))?.record;
}
