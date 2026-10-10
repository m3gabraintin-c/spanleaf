import { z } from "zod";
import { callApi } from "../helpers/apiCall";

export const schema = z.object({ shareId: z.string().min(8).max(32) });

export type InputType = z.infer<typeof schema>;

export type ShareComment = { id: number; name: string; body: string; slide: number | null; createdAt: Date };

export type OutputType = {
  title: string;
  aspect: number;
  /** Addresses of the slide pictures, in order. They work for an hour. */
  slides: string[];
  comments: ShareComment[];
  expiresAt: Date;
};

export const getShareGet = (params: InputType, init?: RequestInit) =>
  callApi<OutputType>(`/_api/share-get?shareId=${encodeURIComponent(schema.parse(params).shareId)}`, { method: "GET", ...init }, "This link couldn't be opened.");