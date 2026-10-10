import { z } from "zod";
import { callApi, jsonInit } from "../helpers/apiCall";

export const schema = z.object({ shareId: z.string().min(8).max(32), ownerToken: z.string().min(16).max(80) });

export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postShareFinish = (body: InputType, init?: RequestInit) => callApi<OutputType>("/_api/share-finish", jsonInit(schema.parse(body), init), "The link couldn't be finished.");