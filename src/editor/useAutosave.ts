"use client";
import { useCallback, useEffect, useRef } from "react";
import { data, DataError } from "@/data";
import { useEditor } from "./store";

const DEBOUNCE_MS = 1500;

/** What a save sends: the document and the shape of the project it belongs to. */
export const savePatch = (s: Pick<ReturnType<typeof useEditor.getState>, "rev" | "doc" | "format" | "slideCount">) => ({
  rev: s.rev,
  doc: s.doc,
  format: s.format,
  slideCount: s.slideCount,
});

/**
 * Saves the document about 1.5 s after the last change, and right away when the tab is hidden.
 * One save at a time. Each save carries the revision we last saw, so a second tab gets a
 * conflict instead of silently overwriting this one.
 */
export function useAutosave() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  const flush = useCallback(async () => {
    if (inflight.current) return;
    const s = useEditor.getState();
    if (!s.projectId || s.docVersion === s.savedVersion || s.saveStatus === "conflict") return;
    inflight.current = true;
    const version = s.docVersion;
    useEditor.getState().setSaveStatus("saving");
    let failed = false;
    try {
      const { rev } = await data.saveProject(s.projectId, savePatch(s));
      useEditor.getState().markSaved(rev, version);
    } catch (e) {
      failed = true;
      if (e instanceof DataError && e.code === "REV_CONFLICT") useEditor.getState().setSaveStatus("conflict");
      else if (e instanceof DataError && (e.code === "UNAUTHENTICATED" || e.code === "ACCOUNT_DELETING")) useEditor.getState().setSaveStatus("signed_out");
      else if (e instanceof DataError && e.code === "NETWORK") useEditor.getState().setSaveStatus("error", "Can't reach the server. Your changes will save when you're back online.");
      else if (e instanceof DataError) useEditor.getState().setSaveStatus("error", e.message);
      else useEditor.getState().setSaveStatus("error", "Couldn't save your changes.");
    } finally {
      inflight.current = false;
    }
    const after = useEditor.getState();
    if (!failed && after.docVersion !== after.savedVersion) {
      // More edits arrived while saving.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 300);
    }
  }, []);

  useEffect(() => {
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    };
    const unsub = useEditor.subscribe((state, prev) => {
      if (state.docVersion !== prev.docVersion) schedule();
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    // The page is going away (tab closed, reloaded, navigated off). A normal save waits on I/O first and
    // gets cut off, so hand the document to a save that starts synchronously.
    const onExit = () => {
      const s = useEditor.getState();
      if (!s.projectId || s.docVersion === s.savedVersion || s.saveStatus === "conflict" || inflight.current) return;
      data.saveProjectOnExit?.(s.projectId, savePatch(s));
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onExit);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onExit);
      if (timer.current) clearTimeout(timer.current);
      void flush(); // leaving the editor saves what's pending
    };
  }, [flush]);

  return flush;
}
