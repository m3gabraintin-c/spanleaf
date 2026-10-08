import { del, get, keys, set } from "idb-keyval";
import { uid } from "./carouselModel";

/** Stickers you made, kept in this browser so they can be used in any project. */
export type MySticker = { id: string; src: string; w: number; h: number; createdAt: number };

const KEY = (id: string) => `spanleaf:mysticker:${id}`;
export const MAX_MY_STICKERS = 60;

export const listMyStickers = async (): Promise<MySticker[]> => {
  const all = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith("spanleaf:mysticker:"));
  const found = await Promise.all(all.map((k) => get<MySticker>(k)));
  return found.filter((s): s is MySticker => !!s).sort((a, b) => b.createdAt - a.createdAt);
};

export const saveMySticker = async (src: string, w: number, h: number): Promise<MySticker> => {
  const s: MySticker = { id: uid(), src, w, h, createdAt: Date.now() };
  try {
    await set(KEY(s.id), s);
  } catch {
    throw new Error("This browser wouldn't keep the sticker. It may be out of space.");
  }
  return s;
};

export const deleteMySticker = (id: string) => del(KEY(id));
