import { z } from "zod";
import { callApi, jsonInit } from "../helpers/apiCall";
import type { ShareComment } from "./share-get_GET.schema";

export const schema = z.object({
  shareId: z.string().min(8).max(32),
  name: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(1000),
  /** Which slide the comment is about, counting from 0, or null for the whole carousel. */
  slide: z.number().int().min(0).max(29).nullable(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = ShareComment;

export const postShareComment = (body: InputType, init?: RequestInit) => callApi<OutputType>("/_api/share-comment", jsonInit(schema.parse(body), init), "Your comment couldn't be posted.");