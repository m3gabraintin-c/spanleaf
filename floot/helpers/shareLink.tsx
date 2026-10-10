import Konva from "konva";
import { get, set } from "idb-keyval";
import { Design, FORMATS, SLIDE_WIDTH } from "./carouselModel";
import { withExportView } from "./exportSlides";
import { postShareCreate } from "../endpoints/share-create_POST.schema";
import { postShareFinish } from "../endpoints/share-finish_POST.schema";
import { postShareDelete } from "../endpoints/share-delete_POST.schema";

/**
 * Share links, from the editor's side: draws the slides as pictures, sends them to the server, and remembers the
 * links made for each project (with the token that deletes them) in this browser.
 */

export const MAX_SHARED_SLIDES = 30;
export type ShareRecord = { id: string; token: string; createdAt: number; expiresAt: number; slides: number };

const KEY = (projectId: string) => `spanleaf:shares:${projectId}`;

export const shareUrl = (id: string) => `${window.location.origin}/s/${id}`;

export const listShares = async (projectId: string): Promise<ShareRecord[]> => ((await get<ShareRecord[]>(KEY(projectId))) ?? []).filter((s) => s.expiresAt > Date.now());

const keepShares = (projectId: string, list: ShareRecord[]) => set(KEY(projectId), list);

const blobOf = (dataUrl: string) => {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
};

export const createShare = async (
  projectId: string,
  stage: Konva.Stage,
  content: Konva.Layer,
  design: Design,
  title: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ShareRecord> => {
  const n = Math.min(design.slideCount, MAX_SHARED_SLIDES);
  const height = FORMATS[design.format].height;
  // 810 pixels wide is plenty for a phone screen and keeps each picture small.
  const pictures = await withExportView(stage, content, async () => {
    const out: Blob[] = [];
    for (let i = 0; i < n; i++) {
      out.push(blobOf(content.toDataURL({ x: i * SLIDE_WIDTH, y: 0, width: SLIDE_WIDTH, height, pixelRatio: 0.75, mimeType: "image/jpeg", quality: 0.82 })));
      onProgress?.(i + 1, n * 2);
      await new Promise((r) => setTimeout(r, 0));
    }
    return out;
  });
  if (pictures.some((p) => p.size > 3_000_000)) throw new Error("A slide picture came out too large to share.");
  const made = await postShareCreate({ title: title.trim().slice(0, 80) || "Untitled", aspect: SLIDE_WIDTH / height, sizes: pictures.map((p) => p.size) });
  for (let i = 0; i < n; i++) {
    const u = made.uploads[i];
    const r = await fetch(u.presignedUrl, { method: "PUT", headers: u.headers, body: pictures[i] });
    if (!r.ok) throw new Error("A slide picture didn't upload. Check your connection and try again.");
    onProgress?.(n + i + 1, n * 2);
  }
  await postShareFinish({ shareId: made.shareId, ownerToken: made.ownerToken });
  const record: ShareRecord = { id: made.shareId, token: made.ownerToken, createdAt: Date.now(), expiresAt: new Date(made.expiresAt).getTime(), slides: n };
  await keepShares(projectId, [record, ...(await listShares(projectId))]);
  return record;
};

export const deleteShare = async (projectId: string, record: ShareRecord) => {
  await postShareDelete({ shareId: record.id, ownerToken: record.token });
  await keepShares(projectId, (await listShares(projectId)).filter((s) => s.id !== record.id));
};