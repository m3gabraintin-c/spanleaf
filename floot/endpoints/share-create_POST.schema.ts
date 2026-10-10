import { z } from "zod";
import { callApi, jsonInit } from "../helpers/apiCall";

export const schema = z.object({
  title: z.string().trim().min(1).max(80),
  /** Slide width over height. */
  aspect: z.number().min(0.25).max(2.5),
  /** The size in bytes of each slide's JPEG picture, in order. */
  sizes: z.array(z.number().int().min(100).max(3_000_000)).min(1).max(30),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  shareId: string;
  /** Keep this: it is needed to delete the link. It is not kept on the server. */
  ownerToken: string;
  expiresAt: Date;
  /** Where to send each slide's picture, in order. */
  uploads: { presignedUrl: string; headers: Record<string, string> }[];
};

export const postShareCreate = (body: InputType, init?: RequestInit) => callApi<OutputType>("/_api/share-create", jsonInit(schema.parse(body), init), "The link couldn't be made.");