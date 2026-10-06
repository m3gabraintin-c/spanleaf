import { create } from "zustand";
import { current } from "immer";
import { immer } from "zustand/middleware/immer";
import { inkFor } from "@/lib/colour";
import { MAX_ELEMENTS, uid, type Doc, type Element, type Gradient, type Pattern } from "@/lib/doc";
import { makePattern } from "@/lib/pattern";
import { DEFAULT_PEN, MAX_PEN_SIZE, MIN_PEN_SIZE, type Pen } from "@/lib/stroke";
import { FORMATS, MAX_SLIDES, type FormatKey } from "@/lib/formats";
import { alignedPosition, type Alignment } from "@/lib/align";
import { duplicateSlide, insertSlide, moveSlide, removeSlide, slideOf } from "@/lib/slides";
import type { MediaUrls, Project } from "@/data";

type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict" | "signed_out";
export type ToolKey = "media" | "themes" | "crop" | "size" | "text" | "stickers" | "frames" | "draw" | "cutout" | "slides" | "background" | "adjust" | "layers";
type LayerMove = "forward" | "backward" | "front" | "back";

const HISTORY_LIMIT = 100;
/** Edits with the same key that come this close together count as one step for undo. */
const COALESCE_MS = 800;

interface EditorState {
  projectId: string | null;
  title: string;
  format: FormatKey;
  slideCount: number;
  doc: Doc;
  rev: number;
  /** Bumps on every change to doc. Autosave compares it with savedVersion. */
  docVersion: number;
  savedVersion: number;
  saveStatus: SaveStatus;
  saveError: string | null;
  selectedId: string | null;
  zoom: number;
  tool: ToolKey | null;
  /** The pen the Draw tool is using. Not saved with the project. */
  pen: Pen;
  mediaUrls: Record<string, MediaUrls>;
  /** Photos the project uses whose files can no longer be found. */
  mediaMissing: Record<string, true>;
  announcement: string;
  /** Earlier versions of the document, oldest first. Never saved. Cleared when a project opens. */
  past: Snapshot[];
  future: Snapshot[];
  lastKey: string | null;
  lastAt: number;

  load: (p: Project) => void;
  /** Adds a layer on top. It is selected unless select is false. */
  addElement: (el: Element, opts?: { select?: boolean }) => void;
  updateElement: (id: string, patch: Partial<Element>, opts?: { key?: string }) => void;
  /** For values worked out by the editor itself (a text layer's height). Saved, but not an undo step. */
  measureElement: (id: string, patch: Partial<Element>) => void;
  removeElement: (id: string) => void;
  /** Removes several layers as one undo step. Calls with the same key close together share a step. */
  removeElements: (ids: string[], key?: string) => void;
  duplicateElement: (id: string, offset?: number, bounds?: { w: number; h: number }) => string | null;
  moveLayer: (id: string, how: LayerMove) => void;
  reorderLayer: (id: string, toIndex: number) => void;
  toggleLock: (id: string) => void;
  /** Swaps the whole document as one undo step. Changes with the same key close together share a step. */
  replaceDoc: (doc: Doc, key?: string) => void;
  /** Changes the project's format together with the document that fits it. One undo step goes back to the old shape. */
  setFormat: (format: FormatKey, doc: Doc) => void;
  /** A blank slide at position at (0 to the slide count). Does nothing at the most slides. */
  addSlide: (at: number) => void;
  /** A copy of slide at, straight after it. Does nothing at the most slides or the most layers. */
  duplicateSlide: (at: number) => void;
  /** Removes slide at and its layers. Does nothing to a project's only slide. */
  deleteSlide: (at: number) => void;
  /** Moves slide from to position to. */
  moveSlide: (from: number, to: number) => void;
  /** Lines a layer up with an edge or the middle of the slide it is on. Does nothing to a locked layer. */
  alignElement: (id: string, how: Alignment) => void;
  setBackground: (color: string) => void;
  /** Pass null to remove the pattern. */
  setPattern: (pattern: Pattern | null) => void;
  /** A blend across the whole carousel, or null for none. Changes close together make one undo step. */
  setGradient: (gradient: Gradient | null) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  setZoom: (z: number) => void;
  setTool: (t: ToolKey | null) => void;
  setPen: (patch: Partial<Pen>) => void;
  addMediaUrls: (urls: Record<string, MediaUrls>) => void;
  setMediaMissing: (ids: string[]) => void;
  setSaveStatus: (s: SaveStatus, error?: string | null) => void;
  markSaved: (rev: number, version: number) => void;
  announce: (msg: string) => void;
}

type Draft = EditorState;

/** What undo goes back to: the document, and the shape of the project it was in. */
interface Snapshot {
  doc: Doc;
  slideCount: number;
  format: FormatKey;
}

const snapshot = (s: Draft): Snapshot => ({ doc: current(s.doc), slideCount: s.slideCount, format: s.format });

function restore(s: Draft, snap: Snapshot) {
  s.doc = snap.doc;
  s.slideCount = snap.slideCount;
  s.format = snap.format;
  s.lastKey = null;
  if (s.selectedId && !s.doc.elements.some((e) => e.id === s.selectedId)) s.selectedId = null;
}

/** Records the document as it is now, before a change, so the change can be undone. */
function remember(s: Draft, key?: string) {
  const now = Date.now();
  if (key && key === s.lastKey && now - s.lastAt < COALESCE_MS) {
    s.lastAt = now;
    return;
  }
  s.past.push(snapshot(s));
  if (s.past.length > HISTORY_LIMIT) s.past.shift();
  s.future = [];
  s.lastKey = key ?? null;
  s.lastAt = now;
}

function touch(s: Draft) {
  s.docVersion++;
  s.saveStatus = "unsaved";
}

export const useEditor = create<EditorState>()(
  immer((set) => ({
    projectId: null,
    title: "",
    format: "portrait_4_5",
    slideCount: 3,
    doc: { v: 1, background: { type: "color", value: "#ffffff" }, elements: [] },
    rev: 0,
    docVersion: 0,
    savedVersion: 0,
    saveStatus: "saved",
    saveError: null,
    selectedId: null,
    zoom: 1,
    tool: "media",
    pen: DEFAULT_PEN,
    mediaUrls: {},
    mediaMissing: {},
    announcement: "",
    past: [],
    future: [],
    lastKey: null,
    lastAt: 0,

    load: (p) =>
      set((s) => {
        s.projectId = p.id;
        s.title = p.title;
        s.format = p.format;
        s.slideCount = p.slideCount;
        s.doc = p.doc;
        s.rev = p.rev;
        s.docVersion = 0;
        s.savedVersion = 0;
        s.saveStatus = "saved";
        s.saveError = null;
        s.selectedId = null;
        s.zoom = 1;
        s.mediaMissing = {};
        s.past = [];
        s.future = [];
        s.lastKey = null;
      }),

    addElement: (el, opts) =>
      set((s) => {
        remember(s);
        s.doc.elements.push(el);
        if (opts?.select !== false) s.selectedId = el.id;
        touch(s);
      }),

    updateElement: (id, patch, opts) =>
      set((s) => {
        const el = s.doc.elements.find((e) => e.id === id);
        if (!el) return;
        remember(s, opts?.key);
        Object.assign(el, patch);
        touch(s);
      }),

    measureElement: (id, patch) =>
      set((s) => {
        const el = s.doc.elements.find((e) => e.id === id);
        if (!el) return;
        let changed = false;
        for (const [k, v] of Object.entries(patch)) {
          const old = (el as Record<string, unknown>)[k];
          if (typeof v === "number" && typeof old === "number" ? Math.abs(v - old) > 0.5 : old !== v) changed = true;
        }
        if (!changed) return;
        Object.assign(el, patch);
        // Not an undo step. The same measurement is also written into the older snapshots, so undo doesn't
        // bring back a stale height.
        for (const d of s.past) {
          const e = d.doc.elements.find((x) => x.id === id);
          if (e) Object.assign(e, patch);
        }
        for (const d of s.future) {
          const e = d.doc.elements.find((x) => x.id === id);
          if (e) Object.assign(e, patch);
        }
        touch(s);
      }),

    removeElement: (id) =>
      set((s) => {
        const i = s.doc.elements.findIndex((e) => e.id === id);
        if (i < 0) return;
        remember(s);
        s.doc.elements.splice(i, 1);
        if (s.selectedId === id) s.selectedId = null;
        touch(s);
      }),

    removeElements: (ids, key) =>
      set((s) => {
        const gone = new Set(ids);
        if (!s.doc.elements.some((e) => gone.has(e.id))) return;
        remember(s, key);
        s.doc.elements = s.doc.elements.filter((e) => !gone.has(e.id));
        if (s.selectedId && gone.has(s.selectedId)) s.selectedId = null;
        touch(s);
      }),

    duplicateElement: (id, offset = 48, bounds) => {
      let created: string | null = null;
      set((s) => {
        const i = s.doc.elements.findIndex((e) => e.id === id);
        if (i < 0) return;
        remember(s);
        const src = current(s.doc.elements[i]);
        const copy: Element = { ...src, id: uid(), locked: false, name: src.name ? src.name : undefined };
        copy.x = src.x + offset;
        copy.y = src.y + offset;
        if (bounds) {
          // keep the copy where it can be found
          copy.x = Math.min(bounds.w - Math.min(80, copy.w), copy.x);
          copy.y = Math.min(bounds.h - Math.min(80, copy.h), copy.y);
        }
        s.doc.elements.splice(i + 1, 0, copy);
        s.selectedId = copy.id;
        created = copy.id;
        touch(s);
      });
      return created;
    },

    moveLayer: (id, how) =>
      set((s) => {
        const list = s.doc.elements;
        const i = list.findIndex((e) => e.id === id);
        if (i < 0) return;
        const to = how === "forward" ? Math.min(list.length - 1, i + 1) : how === "backward" ? Math.max(0, i - 1) : how === "front" ? list.length - 1 : 0;
        if (to === i) return;
        remember(s);
        const [el] = list.splice(i, 1);
        list.splice(to, 0, el);
        touch(s);
      }),

    reorderLayer: (id, toIndex) =>
      set((s) => {
        const list = s.doc.elements;
        const i = list.findIndex((e) => e.id === id);
        const to = Math.max(0, Math.min(list.length - 1, toIndex));
        if (i < 0 || i === to) return;
        remember(s);
        const [el] = list.splice(i, 1);
        list.splice(to, 0, el);
        touch(s);
      }),

    toggleLock: (id) =>
      set((s) => {
        const el = s.doc.elements.find((e) => e.id === id);
        if (!el) return;
        remember(s);
        el.locked = !el.locked;
        touch(s);
      }),

    replaceDoc: (doc, key) =>
      set((s) => {
        remember(s, key);
        s.doc = doc;
        s.selectedId = null;
        touch(s);
      }),

    setFormat: (format, doc) =>
      set((s) => {
        remember(s);
        s.format = format;
        s.doc = doc;
        s.selectedId = null;
        touch(s);
      }),

    addSlide: (at) =>
      set((s) => {
        if (s.slideCount >= MAX_SLIDES || at < 0 || at > s.slideCount) return;
        remember(s);
        s.doc = insertSlide(current(s.doc), at);
        s.slideCount++;
        touch(s);
      }),

    duplicateSlide: (at) =>
      set((s) => {
        if (s.slideCount >= MAX_SLIDES || at < 0 || at >= s.slideCount) return;
        const copies = s.doc.elements.filter((e) => slideOf(e) === at).length;
        if (s.doc.elements.length + copies > MAX_ELEMENTS) {
          s.announcement = `A copy would go past the limit of ${MAX_ELEMENTS} layers.`;
          return;
        }
        remember(s);
        s.doc = duplicateSlide(current(s.doc), at);
        s.slideCount++;
        touch(s);
      }),

    deleteSlide: (at) =>
      set((s) => {
        if (s.slideCount <= 1 || at < 0 || at >= s.slideCount) return;
        remember(s);
        s.doc = removeSlide(current(s.doc), at);
        s.slideCount--;
        if (s.selectedId && !s.doc.elements.some((e) => e.id === s.selectedId)) s.selectedId = null;
        touch(s);
      }),

    alignElement: (id, how) =>
      set((s) => {
        const el = s.doc.elements.find((e) => e.id === id);
        if (!el || el.locked) return;
        const at = alignedPosition(el, how, s.slideCount, FORMATS[s.format].height);
        if (at.x === el.x && at.y === el.y) return;
        remember(s);
        el.x = at.x;
        el.y = at.y;
        touch(s);
      }),

    moveSlide: (from, to) =>
      set((s) => {
        if (from === to || from < 0 || to < 0 || from >= s.slideCount || to >= s.slideCount) return;
        remember(s);
        s.doc = moveSlide(current(s.doc), s.slideCount, from, to);
        touch(s);
      }),

    setBackground: (color) =>
      set((s) => {
        if (s.doc.background.value.toLowerCase() === color.toLowerCase()) return;
        remember(s, "background");
        s.doc.background.value = color;
        // A pattern is drawn against the background, so it follows the colour.
        if (s.doc.pattern) s.doc.pattern = makePattern(s.doc.pattern.kind, color, inkFor(color, "#1a1a1a"));
        touch(s);
      }),

    setPattern: (pattern) =>
      set((s) => {
        if (JSON.stringify(s.doc.pattern ?? null) === JSON.stringify(pattern)) return;
        remember(s, "pattern");
        if (pattern) s.doc.pattern = pattern;
        else delete s.doc.pattern;
        touch(s);
      }),

    setGradient: (gradient) =>
      set((s) => {
        if (JSON.stringify(s.doc.gradient ?? null) === JSON.stringify(gradient)) return;
        remember(s, "gradient");
        if (gradient) s.doc.gradient = gradient;
        else delete s.doc.gradient;
        touch(s);
      }),

    undo: () =>
      set((s) => {
        const prev = s.past.pop();
        if (!prev) return;
        s.future.push(snapshot(s));
        restore(s, prev);
        touch(s);
      }),

    redo: () =>
      set((s) => {
        const next = s.future.pop();
        if (!next) return;
        s.past.push(snapshot(s));
        restore(s, next);
        touch(s);
      }),

    select: (id) => set((s) => void (s.selectedId = id)),
    setZoom: (z) => set((s) => void (s.zoom = Math.min(4, Math.max(0.25, z)))),
    setTool: (t) => set((s) => void (s.tool = t)),
    setPen: (patch) =>
      set((s) => {
        const next = { ...s.pen, ...patch };
        s.pen = { ...next, size: Math.min(MAX_PEN_SIZE, Math.max(MIN_PEN_SIZE, next.size)) };
      }),
    addMediaUrls: (urls) =>
      set((s) => {
        Object.assign(s.mediaUrls, urls);
      }),
    setMediaMissing: (ids) =>
      set((s) => {
        s.mediaMissing = Object.fromEntries(ids.map((id) => [id, true as const]));
      }),
    setSaveStatus: (status, error = null) =>
      set((s) => {
        s.saveStatus = status;
        s.saveError = error;
      }),
    markSaved: (rev, version) =>
      set((s) => {
        s.rev = rev;
        s.savedVersion = version;
        // Changes made while the save was in flight keep the state at "unsaved".
        s.saveStatus = s.docVersion === version ? "saved" : "unsaved";
        s.saveError = null;
      }),
    announce: (msg) => set((s) => void (s.announcement = msg)),
  })),
);
